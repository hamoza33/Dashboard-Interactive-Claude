/**
 * Minimal OAuth 2.1 authorization server for the dashboard deploy MCP HTTP
 * endpoint. Follows the same pattern as cod-network-mcp.
 */

import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import type {
  AuthorizationParams,
  OAuthServerProvider,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  InvalidGrantError,
  InvalidRequestError,
  InvalidTokenError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";

const ACCESS_TTL_SEC = 3600;
const REFRESH_TTL_SEC = 30 * 24 * 3600;
const CODE_TTL_SEC = 5 * 60;
const PENDING_TTL_SEC = 10 * 60;

interface PendingAuth {
  client: OAuthClientInformationFull;
  params: AuthorizationParams;
  expiresAt: number;
}

interface CodeRecord {
  client: OAuthClientInformationFull;
  params: AuthorizationParams;
  expiresAt: number;
}

interface AccessRecord {
  type: "access";
  clientId: string;
  scopes: string[];
  expiresAt: number;
  resource?: URL;
}

interface RefreshRecord {
  type: "refresh";
  clientId: string;
  scopes: string[];
  expiresAt: number;
  resource?: URL;
}

type TokenRecord = AccessRecord | RefreshRecord;

class InMemoryClientsStore implements OAuthRegisteredClientsStore {
  private clients = new Map<string, OAuthClientInformationFull>();

  async getClient(id: string): Promise<OAuthClientInformationFull | undefined> {
    return this.clients.get(id);
  }

  async registerClient(
    meta: OAuthClientInformationFull,
  ): Promise<OAuthClientInformationFull> {
    this.clients.set(meta.client_id, meta);
    return meta;
  }
}

function timingSafeEq(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return c;
    }
  });
}

export class DashboardMcpOAuthProvider implements OAuthServerProvider {
  readonly clientsStore: OAuthRegisteredClientsStore = new InMemoryClientsStore();

  private readonly pending = new Map<string, PendingAuth>();
  private readonly codes = new Map<string, CodeRecord>();
  private readonly tokens = new Map<string, TokenRecord>();

  constructor(private readonly adminToken: string) {}

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    if (!client.redirect_uris.includes(params.redirectUri)) {
      throw new InvalidRequestError("Unregistered redirect_uri");
    }

    this.gcExpired();

    const pendingId = randomUUID();
    this.pending.set(pendingId, {
      client,
      params,
      expiresAt: Date.now() + PENDING_TTL_SEC * 1000,
    });

    res.set("content-type", "text/html; charset=utf-8");
    res.status(200).send(this.loginPage(pendingId, client));
  }

  approveHandler: RequestHandler = (req: Request, res: Response): void => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const pendingId = typeof body.pending_id === "string" ? body.pending_id : "";
    const adminToken = typeof body.admin_token === "string" ? body.admin_token : "";

    if (!pendingId || !adminToken) {
      res.status(400).send("Missing pending_id or admin_token");
      return;
    }

    const pending = this.pending.get(pendingId);
    if (!pending || pending.expiresAt < Date.now()) {
      this.pending.delete(pendingId);
      res.status(400).send("Login session expired — please retry.");
      return;
    }

    if (!timingSafeEq(adminToken, this.adminToken)) {
      res.set("content-type", "text/html; charset=utf-8");
      res.status(403).send(this.loginPage(pendingId, pending.client, "Invalid token — try again."));
      return;
    }

    this.pending.delete(pendingId);

    const code = randomUUID();
    this.codes.set(code, {
      client: pending.client,
      params: pending.params,
      expiresAt: Date.now() + CODE_TTL_SEC * 1000,
    });

    const redirectUrl = new URL(pending.params.redirectUri);
    redirectUrl.searchParams.set("code", code);
    if (pending.params.state) redirectUrl.searchParams.set("state", pending.params.state);

    res.redirect(302, redirectUrl.toString());
  };

  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const rec = this.codes.get(authorizationCode);
    if (!rec || rec.expiresAt < Date.now()) {
      this.codes.delete(authorizationCode);
      throw new InvalidGrantError("Authorization code expired or unknown");
    }
    if (rec.client.client_id !== client.client_id) {
      throw new InvalidGrantError("Client mismatch");
    }
    return rec.params.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    _redirectUri?: string,
  ): Promise<OAuthTokens> {
    const rec = this.codes.get(authorizationCode);
    if (!rec || rec.expiresAt < Date.now()) {
      this.codes.delete(authorizationCode);
      throw new InvalidGrantError("Authorization code expired or unknown");
    }
    if (rec.client.client_id !== client.client_id) {
      throw new InvalidGrantError("Client mismatch");
    }

    this.codes.delete(authorizationCode);

    const scopes = rec.params.scopes ?? ["mcp:tools"];
    const accessToken = randomUUID();
    const refreshToken = randomUUID();
    const now = Date.now();

    this.tokens.set(accessToken, {
      type: "access",
      clientId: client.client_id,
      scopes,
      expiresAt: now + ACCESS_TTL_SEC * 1000,
    });
    this.tokens.set(refreshToken, {
      type: "refresh",
      clientId: client.client_id,
      scopes,
      expiresAt: now + REFRESH_TTL_SEC * 1000,
    });

    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TTL_SEC,
      refresh_token: refreshToken,
      scope: scopes.join(" "),
    };
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    _scopes?: string[],
  ): Promise<OAuthTokens> {
    const rec = this.tokens.get(refreshToken);
    if (!rec || rec.type !== "refresh" || rec.expiresAt < Date.now()) {
      this.tokens.delete(refreshToken);
      throw new InvalidGrantError("Refresh token expired or unknown");
    }
    if (rec.clientId !== client.client_id) {
      throw new InvalidGrantError("Client mismatch");
    }

    this.tokens.delete(refreshToken);

    const accessToken = randomUUID();
    const newRefresh = randomUUID();
    const now = Date.now();

    this.tokens.set(accessToken, {
      type: "access",
      clientId: client.client_id,
      scopes: rec.scopes,
      expiresAt: now + ACCESS_TTL_SEC * 1000,
    });
    this.tokens.set(newRefresh, {
      type: "refresh",
      clientId: client.client_id,
      scopes: rec.scopes,
      expiresAt: now + REFRESH_TTL_SEC * 1000,
    });

    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TTL_SEC,
      refresh_token: newRefresh,
      scope: rec.scopes.join(" "),
    };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const rec = this.tokens.get(token);
    if (!rec || rec.type !== "access" || rec.expiresAt < Date.now()) {
      this.tokens.delete(token);
      throw new InvalidTokenError("Access token expired or unknown");
    }
    return {
      token,
      clientId: rec.clientId,
      scopes: rec.scopes,
      expiresAt: Math.floor(rec.expiresAt / 1000),
    };
  }

  isAdminToken(token: string): boolean {
    return timingSafeEq(token, this.adminToken);
  }

  private gcExpired(): void {
    const now = Date.now();
    for (const [k, v] of this.pending) if (v.expiresAt < now) this.pending.delete(k);
    for (const [k, v] of this.codes) if (v.expiresAt < now) this.codes.delete(k);
    for (const [k, v] of this.tokens) if (v.expiresAt < now) this.tokens.delete(k);
  }

  private loginPage(
    pendingId: string,
    _client: OAuthClientInformationFull,
    error?: string,
  ): string {
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dashboard Deploy MCP — Login</title>
<style>
  body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0f1117;color:#e4e4e7;margin:0}
  form{background:#1a1d27;padding:2rem;border-radius:12px;border:1px solid #2a2d3a;width:340px}
  h1{font-size:1.2rem;margin:0 0 1rem}
  input{width:100%;padding:.6rem;border-radius:6px;border:1px solid #2a2d3a;background:#0f1117;color:#e4e4e7;margin:.5rem 0;box-sizing:border-box}
  button{width:100%;padding:.6rem;border-radius:6px;border:none;background:#6366f1;color:#fff;font-weight:600;cursor:pointer;margin-top:.75rem}
  button:hover{background:#818cf8}
  .err{color:#f87171;font-size:.85rem;margin-top:.5rem}
</style></head><body>
<form method="POST" action="/oauth/approve">
  <h1>Dashboard Deploy MCP</h1>
  <label>Admin Token</label>
  <input type="password" name="admin_token" required autofocus>
  <input type="hidden" name="pending_id" value="${escapeHtml(pendingId)}">
  <button type="submit">Authorize</button>
  ${error ? `<div class="err">${escapeHtml(error)}</div>` : ""}
</form></body></html>`;
  }
}
