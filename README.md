# dashboard-deploy-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets
**Claude** deploy interactive HTML dashboards to your website.

Live at: **https://dash.shopinzo.bond**

## How it works

```
Claude (claude.ai) ──(MCP over HTTPS)──► dashboard-deploy-mcp
                                              │
                                              ├─ saves dashboard HTML
                                              ├─ links Google Sheet for live data
                                              ▼
                           dash.shopinzo.bond/  ← gallery (thumbnails + cards)
                           dash.shopinzo.bond/<slug> ← full dashboard
                           dash.shopinzo.bond/data/<slug> ← live JSON from sheet
```

1. You build a dashboard in Claude (as an artifact/conversation).
2. When ready, tell Claude: *"Deploy this dashboard using the deploy_dashboard tool"*.
3. Claude calls `deploy_dashboard` with the HTML + your Google Sheet URL.
4. The dashboard is immediately live at `https://dash.shopinzo.bond/<slug>`.
5. The gallery at `https://dash.shopinzo.bond/` shows all dashboards with live previews.

## MCP Tools

| Tool | Description |
|------|-------------|
| `deploy_dashboard` | Deploy a new dashboard (name, slug, category, HTML, sheetUrl) |
| `update_dashboard` | Update an existing dashboard's HTML / metadata |
| `list_dashboards`  | List all deployed dashboards with metadata |
| `remove_dashboard` | Delete a dashboard by slug |

### deploy_dashboard parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `slug` | Yes | URL-safe identifier (e.g. `product-x-sales`) |
| `name` | Yes | Dashboard title |
| `description` | No | Short text shown in gallery |
| `category` | No | Grouping label (e.g. "Product X", "Analytics") |
| `html` | Yes | Full self-contained HTML page |
| `sheetUrl` | No | Google Sheet URL for live data |

### Live data from Google Sheets

When you provide a `sheetUrl`, the server:
1. Proxies the sheet at `/data/<slug>` (handles CORS, converts CSV→JSON).
2. Injects `window.DASHBOARD_DATA_API = "/data/<slug>"` into the served HTML.
3. Your dashboard JS should fetch from `window.DASHBOARD_DATA_API`:

```js
fetch(window.DASHBOARD_DATA_API)
  .then(r => r.json())
  .then(data => {
    // data.columns = ["Date", "Sales", "Revenue", ...]
    // data.rows = [{Date: "2024-01-01", Sales: "150", ...}, ...]
  });
```

Data refreshes every 30 seconds (server-side cache TTL).

## Features

- **Gallery page** — responsive grid with live iframe thumbnails of each dashboard
- **Categories** — group dashboards by product, type, etc.
- **Live data** — dashboards pull real-time data from linked Google Sheets
- **Delete from UI** — trash icon on each card (requires admin token)
- **OAuth 2.1** — ChatGPT/Claude custom connector compatible
- **Auto-update** — re-deploy same slug to update, or data auto-refreshes from sheet

## Connecting Claude to this MCP

### Option A: Claude.ai Custom Connector (recommended)

1. In Claude settings → Integrations → Add MCP Server
2. URL: `https://dash.shopinzo.bond/mcp`
3. OAuth will prompt for the admin token during authorization

### Option B: Direct Bearer Token

For API/curl access:
```bash
curl -X POST https://dash.shopinzo.bond/mcp \
  -H "Authorization: Bearer YOUR_MCP_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MCP_AUTH_TOKEN` | Yes | Admin token for OAuth + API auth |
| `MCP_PUBLIC_URL` | Yes | Public URL (e.g. `https://dash.shopinzo.bond`) |
| `DASHBOARD_DATA_DIR` | No | Data storage directory (default: `./data`) |
| `PORT` | No | HTTP port (default: 8122) |

## Development

```bash
npm install
npm run dev:http   # Start HTTP server with tsx (hot reload)
```

## Production (VPS)

```bash
npm run build
PORT=8122 MCP_AUTH_TOKEN=... MCP_PUBLIC_URL=https://dash.shopinzo.bond node dist/http.js
```

## Deploy to Docker

```bash
docker build -t dashboard-deploy-mcp .
docker run -p 8122:8080 \
  -e MCP_AUTH_TOKEN=... \
  -e MCP_PUBLIC_URL=https://dash.shopinzo.bond \
  -v /path/to/data:/data \
  dashboard-deploy-mcp
```

## License

MIT
