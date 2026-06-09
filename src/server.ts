#!/usr/bin/env node
/**
 * Dashboard Deploy MCP server — stdio entrypoint.
 *
 * This is the entrypoint for Claude Code (local MCP via stdio).
 * Claude sends deploy_dashboard / update_dashboard tool calls,
 * and the server writes HTML files + registry to disk.
 *
 * Configuration via environment variables:
 *   DASHBOARD_DATA_DIR   directory for registry + HTML files (default: ./data)
 *   DASHBOARD_BASE_URL   public URL prefix (default: http://localhost:8122)
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildMcpServer, readConfig } from "./build-server.js";

async function main() {
  const cfg = readConfig();
  const { server, toolCount } = buildMcpServer(cfg);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `[dashboard-deploy-mcp] ready (${toolCount} tools, dataDir=${cfg.dataDir}, baseUrl=${cfg.baseUrl})\n`,
  );
}

main().catch((err) => {
  process.stderr.write(
    `[dashboard-deploy-mcp] fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
  );
  process.exit(1);
});
