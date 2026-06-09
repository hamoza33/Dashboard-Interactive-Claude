/**
 * Google Sheets / CSV data proxy.
 *
 * Fetches the linked data source for a dashboard, parses CSV → JSON,
 * and returns `{ source, fetchedAt, columns, rows }`.
 */

export interface SheetData {
  source: string;
  fetchedAt: string;
  columns: string[];
  rows: Record<string, string>[];
}

/**
 * Normalize a Google Sheets URL to a CSV export URL.
 * Handles both /edit and /pub URLs.
 */
function normalizeSheetUrl(url: string): string {
  // Already a direct CSV/export URL
  if (url.includes("/export?") || url.includes("/pub?")) {
    return url;
  }

  // https://docs.google.com/spreadsheets/d/SHEET_ID/edit...
  const match = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(url);
  if (match) {
    const sheetId = match[1];
    // Extract gid if present
    const gidMatch = /[#&?]gid=(\d+)/.exec(url);
    const gid = gidMatch ? gidMatch[1] : "0";
    return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  }

  // Not a Google Sheets URL — return as-is (could be a direct CSV/JSON endpoint)
  return url;
}

/**
 * Parse CSV text into columns + rows. Handles quoted fields.
 */
function parseCsv(text: string): { columns: string[]; rows: Record<string, string>[] } {
  const lines: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        current.push(field);
        field = "";
      } else if (ch === "\r") {
        // skip
      } else if (ch === "\n") {
        current.push(field);
        field = "";
        if (current.length > 0) lines.push(current);
        current = [];
      } else {
        field += ch;
      }
    }
  }
  // Last field/line
  current.push(field);
  if (current.some((f) => f.length > 0)) lines.push(current);

  if (lines.length === 0) return { columns: [], rows: [] };

  const columns = lines[0]!;
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row: Record<string, string> = {};
    const line = lines[i]!;
    for (let j = 0; j < columns.length; j++) {
      row[columns[j]!] = line[j] ?? "";
    }
    rows.push(row);
  }

  return { columns, rows };
}

/**
 * Fetch and parse a sheet URL, returning structured JSON.
 */
export async function fetchSheetData(sheetUrl: string): Promise<SheetData> {
  const fetchUrl = normalizeSheetUrl(sheetUrl);

  const resp = await fetch(fetchUrl, {
    headers: { "User-Agent": "dashboard-deploy-mcp/0.1" },
    signal: AbortSignal.timeout(15_000),
  });

  if (!resp.ok) {
    throw new Error(`Failed to fetch sheet data: HTTP ${resp.status} from ${fetchUrl}`);
  }

  const contentType = resp.headers.get("content-type") ?? "";
  const text = await resp.text();

  // If the response is JSON already, return it directly
  if (contentType.includes("application/json")) {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      const columns = parsed.length > 0 ? Object.keys(parsed[0] as object) : [];
      return {
        source: sheetUrl,
        fetchedAt: new Date().toISOString(),
        columns,
        rows: parsed as Record<string, string>[],
      };
    }
    return {
      source: sheetUrl,
      fetchedAt: new Date().toISOString(),
      columns: Object.keys(parsed as object),
      rows: [parsed as Record<string, string>],
    };
  }

  // Otherwise parse as CSV
  const { columns, rows } = parseCsv(text);
  return {
    source: sheetUrl,
    fetchedAt: new Date().toISOString(),
    columns,
    rows,
  };
}
