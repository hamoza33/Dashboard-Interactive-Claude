#!/usr/bin/env node
/**
 * Dashboard Deploy MCP server — HTTP / Streamable HTTP entrypoint.
 *
 * Serves:
 *   GET  /              → gallery page (lists all deployed dashboards with thumbnails)
 *   GET  /:slug         → individual dashboard HTML (with data API injected)
 *   GET  /data/:slug    → proxied sheet data as JSON {columns, rows}
 *   DELETE /api/dashboards/:slug → delete a dashboard (requires Bearer admin token)
 *   POST /mcp           → MCP endpoint (streamable HTTP)
 *   GET  /mcp           → MCP SSE endpoint
 *   DELETE /mcp         → MCP session cleanup
 *   GET  /healthz       → health check
 *   GET  /api/info      → service info JSON
 */

import { randomUUID } from "node:crypto";
import express from "express";
import type { Request, RequestHandler } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthRouter,
} from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { buildMcpServer, readConfig } from "./build-server.js";
import { DashboardStore } from "./store.js";
import { DashboardMcpOAuthProvider } from "./oauth.js";
import { renderGallery, renderImportPage } from "./gallery.js";
import { fetchSheetData } from "./sheet-proxy.js";

const log = (...args: unknown[]): void => {
  process.stderr.write(`[dashboard-deploy-mcp:http] ${args.join(" ")}\n`);
};

/* ------------------------------------------------------------------ */
/*  Session management                                                */
/* ------------------------------------------------------------------ */

interface McpSession {
  server: Server;
  transport: StreamableHTTPServerTransport;
  lastUsed: number;
}

const sessions = new Map<string, McpSession>();
const SESSION_TTL_MS = 30 * 60 * 1000;

function gcSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastUsed > SESSION_TTL_MS) {
      sessions.delete(id);
      void session.transport.close().catch(() => {});
      void session.server.close().catch(() => {});
      log(`session ${id} expired`);
    }
  }
}

const gcTimer = setInterval(gcSessions, 5 * 60 * 1000);
gcTimer.unref();

/* ------------------------------------------------------------------ */
/*  Sheet data cache (30s TTL)                                        */
/* ------------------------------------------------------------------ */

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const sheetCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;

/* ------------------------------------------------------------------ */
/*  Main                                                              */
/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  const cfg = readConfig();
  const adminToken = process.env.MCP_AUTH_TOKEN;
  const port = Number.parseInt(process.env.PORT ?? "8122", 10);
  const host = process.env.HOST ?? "0.0.0.0";

  if (!adminToken) {
    log(
      "ERROR: MCP_AUTH_TOKEN is required. Generate one with:",
      "`openssl rand -base64 32` and set it as a server env var.",
    );
    process.exit(1);
  }

  const store = new DashboardStore(cfg.dataDir);

  const issuerUrl = process.env.MCP_PUBLIC_URL
    ? new URL(process.env.MCP_PUBLIC_URL)
    : new URL(`http://${host}:${port}`);
  const mcpResourceUrl = new URL("/mcp", issuerUrl);

  const oauth = new DashboardMcpOAuthProvider(adminToken);

  const app = express();
  app.set("trust proxy", true);
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: false, limit: "256kb" }));

  /* ---- Public routes ---- */

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/info", (_req, res) => {
    res.json({
      service: "dashboard-deploy-mcp",
      transport: "streamable-http",
      mcpEndpoint: mcpResourceUrl.toString(),
      oauthDiscovery: new URL(
        "/.well-known/oauth-authorization-server",
        issuerUrl,
      ).toString(),
      protectedResourceMetadata: getOAuthProtectedResourceMetadataUrl(mcpResourceUrl),
      docs: "https://github.com/hamoza33/Dashboard-Interactive-Claude",
    });
  });

  /* ---- Data proxy: /data/:slug ---- */

  app.get("/data/:slug", async (req, res) => {
    const slug = req.params.slug;
    if (!slug) {
      res.status(400).json({ error: "Missing slug" });
      return;
    }

    const meta = store.get(slug);
    if (!meta) {
      res.status(404).json({ error: `Dashboard "${slug}" not found` });
      return;
    }
    if (!meta.sheetUrl) {
      res.status(404).json({ error: `Dashboard "${slug}" has no linked data source` });
      return;
    }

    // Check cache
    const cached = sheetCache.get(slug);
    if (cached && cached.expiresAt > Date.now()) {
      res.set("X-Cache", "HIT");
      res.json(cached.data);
      return;
    }

    try {
      const data = await fetchSheetData(meta.sheetUrl);
      sheetCache.set(slug, { data, expiresAt: Date.now() + CACHE_TTL_MS });
      res.set("X-Cache", "MISS");
      res.json(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`data proxy error for "${slug}":`, msg);
      res.status(502).json({ error: `Failed to fetch data: ${msg}` });
    }
  });

  /* ---- Manual import: POST /api/dashboards ---- */

  app.post("/api/dashboards", (req, res) => {
    const header = req.header("authorization") ?? "";
    const m = /^Bearer\s+(.+)$/i.exec(header);
    if (!m || !m[1] || !oauth.isAdminToken(m[1].trim())) {
      res.status(401).json({ error: "Unauthorized \u2014 invalid admin token" });
      return;
    }

    const { slug, name, description, category, html, sheetUrl } = req.body as {
      slug?: string;
      name?: string;
      description?: string;
      category?: string;
      html?: string;
      sheetUrl?: string;
    };

    if (!slug || !name || !html) {
      res.status(400).json({ error: "Missing required fields: slug, name, html" });
      return;
    }

    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) && !/^[a-z0-9]$/.test(slug)) {
      res.status(400).json({ error: "Invalid slug: use lowercase letters, numbers, and hyphens" });
      return;
    }

    // Reserved slugs
    const reserved = ["import", "mcp", "healthz", "api", "data", "oauth"];
    if (reserved.includes(slug)) {
      res.status(400).json({ error: `Slug "${slug}" is reserved` });
      return;
    }

    const meta = store.deploy(
      slug,
      name,
      description ?? "",
      html,
      category ?? "General",
      sheetUrl ?? "",
    );

    log(`dashboard "${slug}" deployed via manual import`);
    res.json({
      ok: true,
      dashboard: {
        ...meta,
        url: `${cfg.baseUrl}/${meta.slug}`,
        dataUrl: meta.sheetUrl ? `${cfg.baseUrl}/data/${meta.slug}` : null,
      },
    });
  });

  /* ---- Delete dashboard: DELETE /api/dashboards/:slug ---- */

  app.delete("/api/dashboards/:slug", (req, res) => {
    const header = req.header("authorization") ?? "";
    const m = /^Bearer\s+(.+)$/i.exec(header);
    if (!m || !m[1] || !oauth.isAdminToken(m[1].trim())) {
      res.status(401).json({ error: "Unauthorized — invalid admin token" });
      return;
    }

    const slug = req.params.slug;
    if (!slug) {
      res.status(400).json({ error: "Missing slug" });
      return;
    }

    const removed = store.remove(slug);
    if (!removed) {
      res.status(404).json({ error: `Dashboard "${slug}" not found` });
      return;
    }

    sheetCache.delete(slug);
    res.json({ ok: true, message: `Dashboard "${slug}" deleted` });
  });

  /* ---- OAuth ---- */

  app.use(
    mcpAuthRouter({
      provider: oauth,
      issuerUrl,
      resourceServerUrl: mcpResourceUrl,
      scopesSupported: ["mcp:tools"],
      resourceName: "Dashboard Deploy MCP",
    }),
  );

  app.post("/oauth/approve", oauth.approveHandler);

  /* ---- MCP endpoint (auth-gated) ---- */

  const oauthBearer = requireBearerAuth({
    verifier: oauth,
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpResourceUrl),
  });

  const adminOrOauthBearer: RequestHandler = (req, res, next) => {
    const header = req.header("authorization") ?? "";
    const m = /^Bearer\s+(.+)$/i.exec(header);
    if (m && m[1] && oauth.isAdminToken(m[1].trim())) {
      const token = m[1].trim();
      const adminAuth: AuthInfo = {
        token,
        clientId: "admin",
        scopes: ["mcp:tools"],
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };
      (req as Request & { auth?: AuthInfo }).auth = adminAuth;
      next();
      return;
    }
    oauthBearer(req, res, next);
  };

  const mcpHandler: RequestHandler = async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId) {
      const session = sessions.get(sessionId);
      if (session) {
        session.lastUsed = Date.now();
        try {
          await session.transport.handleRequest(req, res, req.body);
        } catch (err) {
          log("error handling /mcp:", err instanceof Error ? err.stack ?? err.message : String(err));
          if (!res.headersSent) {
            res.status(500).json({
              jsonrpc: "2.0",
              error: { code: -32603, message: "Internal server error" },
              id: null,
            });
          }
        }
        return;
      }
      if (req.method !== "POST") {
        res.status(404).json({
          jsonrpc: "2.0",
          error: { code: -32001, message: "Session not found" },
          id: null,
        });
        return;
      }
    }

    if (req.method !== "POST") {
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: No active session. Send an initialize request via POST first.",
        },
        id: null,
      });
      return;
    }

    const { server } = buildMcpServer(cfg);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newId: string) => {
        sessions.set(newId, { server, transport, lastUsed: Date.now() });
        log(`session ${newId} created (active: ${sessions.size})`);
      },
    });

    transport.onclose = () => {
      const id = transport.sessionId;
      if (id) {
        sessions.delete(id);
        log(`session ${id} closed (active: ${sessions.size})`);
      }
      void server.close().catch(() => {});
    };

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      log("error handling /mcp:", err instanceof Error ? err.stack ?? err.message : String(err));
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
      void transport.close().catch(() => {});
      void server.close().catch(() => {});
    }
  };

  app.post("/mcp", adminOrOauthBearer, mcpHandler);
  app.get("/mcp", adminOrOauthBearer, mcpHandler);
  app.delete("/mcp", adminOrOauthBearer, mcpHandler);

  /* ---- Dashboard serving ---- */

  app.get("/", (_req, res) => {
    const dashboards = store.list();
    res.set("content-type", "text/html; charset=utf-8");
    res.send(renderGallery(dashboards));
  });

  app.get("/import", (_req, res) => {
    res.set("content-type", "text/html; charset=utf-8");
    res.send(renderImportPage());
  });

  // Serve individual dashboards — inject data API global variable
  app.get("/:slug", (req, res) => {
    const slug = req.params.slug;
    if (!slug) {
      res.status(404).send("Not found");
      return;
    }

    const meta = store.get(slug);
    if (!meta) {
      res.status(404).set("content-type", "text/html; charset=utf-8").send(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Not Found</title>
<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0f1117;color:#e4e4e7;margin:0}
.c{text-align:center}h1{font-size:4rem;margin:0}p{color:#71717a}a{color:#6366f1}</style></head>
<body><div class="c"><h1>404</h1><p>Dashboard "<code>${slug}</code>" not found.</p><p><a href="/">← Back to gallery</a></p></div></body></html>`,
      );
      return;
    }

    let html = store.getHtml(slug);
    if (!html) {
      res.status(404).send("Dashboard file missing");
      return;
    }

    // Inject data API endpoint + auto-refresh polling script
    if (meta.sheetUrl) {
      const dataApiScript = `<script>
window.DASHBOARD_DATA_API="/data/${slug}";
window.DASHBOARD_SHEET_URL="${meta.sheetUrl.replace(/"/g, '\\"')}";
(function(){
  var api=window.DASHBOARD_DATA_API;
  var interval=30000;
  function poll(){
    fetch(api).then(function(r){return r.json()}).then(function(d){
      window.DASHBOARD_LIVE_DATA=d;
      window.dispatchEvent(new CustomEvent('dashboard-data-update',{detail:d}));
    }).catch(function(){});
  }
  poll();
  setInterval(poll,interval);
})();
</script>`;
      if (html.includes("</head>")) {
        html = html.replace("</head>", `${dataApiScript}</head>`);
      } else if (html.includes("<body")) {
        html = html.replace(/<body[^>]*>/, `$&${dataApiScript}`);
      } else {
        html = dataApiScript + html;
      }
    }

    res.set("content-type", "text/html; charset=utf-8");
    res.send(html);
  });

  app.listen(port, host, () => {
    log(`listening on http://${host}:${port}`);
    log(`Gallery:         ${issuerUrl.toString()}`);
    log(`MCP endpoint:    ${mcpResourceUrl.toString()}`);
  });
}

main().catch((err) => {
  log("fatal:", err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
