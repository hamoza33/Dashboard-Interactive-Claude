/**
 * Shared MCP server factory used by both the stdio entrypoint
 * (`server.ts`) and the HTTP entrypoint (`http.ts`).
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { DashboardStore } from "./store.js";
import { tools } from "./tools.js";

export interface DashboardConfig {
  dataDir: string;
  baseUrl: string;
}

export function readConfig(): DashboardConfig {
  const dataDir = process.env.DASHBOARD_DATA_DIR ?? process.env.DATA_DIR ?? "./data";
  const baseUrl = (
    process.env.DASHBOARD_BASE_URL ??
    process.env.MCP_PUBLIC_URL ??
    `http://localhost:${process.env.PORT ?? "8122"}`
  ).replace(/\/+$/, "");

  return { dataDir, baseUrl };
}

export function buildMcpServer(cfg: DashboardConfig): {
  server: Server;
  store: DashboardStore;
  toolCount: number;
} {
  const store = new DashboardStore(cfg.dataDir);

  const server = new Server(
    { name: "dashboard-deploy-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.inputSchema, {
        target: "jsonSchema7",
        $refStrategy: "none",
      }),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = tools.find((t) => t.name === req.params.name);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }],
      };
    }

    const parsed = tool.inputSchema.safeParse(req.params.arguments ?? {});
    if (!parsed.success) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Invalid arguments for ${tool.name}: ${parsed.error.message}`,
          },
        ],
      };
    }

    try {
      const data = tool.handler(parsed.data, store, cfg.baseUrl);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: "text", text: `Tool ${tool.name} failed: ${msg}` }],
      };
    }
  });

  return { server, store, toolCount: tools.length };
}
