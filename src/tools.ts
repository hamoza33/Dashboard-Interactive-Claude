/**
 * MCP tool definitions for dashboard deployment.
 */

import { z } from "zod";
import type { DashboardStore } from "./store.js";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  handler: (input: unknown, store: DashboardStore, baseUrl: string) => unknown;
}

export const tools: ToolDef[] = [
  {
    name: "deploy_dashboard",
    description:
      "Deploy a new interactive dashboard to the gallery at dash.shopinzo.bond. " +
      "Provide the full self-contained HTML (inline CSS/JS). " +
      "If a Google Sheet URL is provided, the dashboard will have access to live data via " +
      "`window.DASHBOARD_DATA_API` — your HTML/JS should fetch from this URL to get JSON " +
      "with `{columns: string[], rows: object[]}`. The data auto-refreshes from the sheet. " +
      "If a dashboard with the same slug already exists, it will be overwritten (updated).",
    inputSchema: z.object({
      slug: z
        .string()
        .regex(SLUG_RE, "Slug must be lowercase alphanumeric with optional hyphens, 1-60 chars")
        .describe("URL-safe identifier, e.g. 'product-x-sales' → served at /product-x-sales"),
      name: z.string().min(1).max(200).describe("Dashboard title, e.g. 'Product X Sales Dashboard'"),
      description: z.string().max(1000).default("").describe("Short description shown in the gallery"),
      category: z.string().max(100).default("General").describe("Category for grouping, e.g. 'Product X', 'Analytics', 'Orders'"),
      html: z.string().min(1).describe(
        "Full self-contained HTML page. If a sheetUrl is attached, " +
        "your JS should fetch data from `window.DASHBOARD_DATA_API` (returns JSON {columns, rows}). " +
        "Example: `fetch(window.DASHBOARD_DATA_API).then(r=>r.json()).then(data=>{ /* use data.rows */ })`",
      ),
      sheetUrl: z.string().default("").describe(
        "Google Sheet URL (or any CSV/JSON URL) to link as the live data source. " +
        "E.g. 'https://docs.google.com/spreadsheets/d/SHEET_ID/edit'. " +
        "The server will proxy this and expose it at /data/<slug> for the dashboard to fetch.",
      ),
    }),
    handler: (input, store, baseUrl) => {
      const { slug, name, description, category, html, sheetUrl } = input as {
        slug: string; name: string; description: string; category: string; html: string; sheetUrl: string;
      };
      const meta = store.deploy(slug, name, description, html, category, sheetUrl);
      return {
        ...meta,
        url: `${baseUrl}/${slug}`,
        dataApiUrl: sheetUrl ? `${baseUrl}/data/${slug}` : null,
        galleryUrl: baseUrl,
        message: `Dashboard "${name}" deployed successfully at ${baseUrl}/${slug}`,
      };
    },
  },
  {
    name: "update_dashboard",
    description:
      "Update an existing dashboard's HTML content and/or metadata. " +
      "The slug must already exist. Use this to push new versions of the dashboard.",
    inputSchema: z.object({
      slug: z.string().min(1).describe("Slug of the dashboard to update"),
      html: z.string().min(1).describe("New full HTML content"),
      name: z.string().min(1).max(200).optional().describe("New title (optional)"),
      description: z.string().max(1000).optional().describe("New description (optional)"),
      category: z.string().max(100).optional().describe("New category (optional)"),
      sheetUrl: z.string().optional().describe("New sheet/data source URL (optional)"),
    }),
    handler: (input, store, baseUrl) => {
      const { slug, html, name, description, category, sheetUrl } = input as {
        slug: string; html: string; name?: string; description?: string; category?: string; sheetUrl?: string;
      };
      const meta = store.update(slug, html, name, description, category, sheetUrl);
      if (!meta) {
        throw new Error(`Dashboard with slug "${slug}" not found. Use deploy_dashboard to create it first.`);
      }
      return {
        ...meta,
        url: `${baseUrl}/${slug}`,
        message: `Dashboard "${meta.name}" updated successfully`,
      };
    },
  },
  {
    name: "list_dashboards",
    description:
      "List all deployed dashboards with their metadata (slug, name, category, description, " +
      "sheetUrl, timestamps). Returns an array of dashboard entries.",
    inputSchema: z.object({}),
    handler: (_input, store, baseUrl) => {
      const dashboards = store.list();
      return {
        count: dashboards.length,
        galleryUrl: baseUrl,
        dashboards: dashboards.map((d) => ({
          ...d,
          url: `${baseUrl}/${d.slug}`,
          dataApiUrl: d.sheetUrl ? `${baseUrl}/data/${d.slug}` : null,
        })),
      };
    },
  },
  {
    name: "remove_dashboard",
    description: "Remove a deployed dashboard by slug. Deletes both the HTML file and the registry entry.",
    inputSchema: z.object({
      slug: z.string().min(1).describe("Slug of the dashboard to remove"),
    }),
    handler: (input, store, _baseUrl) => {
      const { slug } = input as { slug: string };
      const removed = store.remove(slug);
      if (!removed) {
        throw new Error(`Dashboard with slug "${slug}" not found.`);
      }
      return { slug, message: `Dashboard "${slug}" removed successfully` };
    },
  },
];
