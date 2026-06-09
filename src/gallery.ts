/**
 * Generates the gallery HTML page that lists all deployed dashboards
 * with live iframe thumbnails, category badges, and delete buttons.
 */

import type { DashboardMeta } from "./store.js";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function renderGallery(dashboards: DashboardMeta[]): string {
  const cards = dashboards
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .map(
      (d) => `
      <div class="card" data-slug="${escapeHtml(d.slug)}">
        <a href="/${escapeHtml(d.slug)}" class="thumbnail-link">
          <div class="thumbnail">
            <iframe src="/${escapeHtml(d.slug)}" loading="lazy" sandbox="allow-scripts allow-same-origin" tabindex="-1"></iframe>
          </div>
        </a>
        <div class="card-body">
          <div class="card-header">
            <h2>${escapeHtml(d.name)}</h2>
            <button class="delete-btn" data-slug="${escapeHtml(d.slug)}" title="Delete dashboard">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
              </svg>
            </button>
          </div>
          <div class="badges">
            <span class="badge category">${escapeHtml(d.category || "General")}</span>
            ${d.sheetUrl ? '<span class="badge sheet">📊 Live Data</span>' : ""}
          </div>
          <p class="desc">${escapeHtml(d.description || "No description")}</p>
          <div class="meta">
            <span class="slug">/${escapeHtml(d.slug)}</span>
            <span class="time">${timeAgo(d.updatedAt)}</span>
          </div>
        </div>
      </div>`,
    )
    .join("\n");

  const empty = dashboards.length === 0
    ? `<div class="empty">
        <div class="empty-icon">🚀</div>
        <h2>No dashboards yet</h2>
        <p>Use Claude with the <code>deploy_dashboard</code> MCP tool to deploy your first interactive dashboard here.</p>
        <p class="hint">Tell Claude: "Deploy this dashboard to dash.shopinzo.bond"</p>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Dashboards — dash.shopinzo.bond</title>
  <style>
    :root {
      --bg: #0f1117;
      --surface: #1a1d27;
      --border: #2a2d3a;
      --text: #e4e4e7;
      --muted: #71717a;
      --accent: #6366f1;
      --accent-hover: #818cf8;
      --danger: #ef4444;
      --danger-hover: #dc2626;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
    }
    header {
      padding: 2rem 2rem 1.5rem;
      text-align: center;
      border-bottom: 1px solid var(--border);
    }
    header h1 {
      font-size: 1.75rem;
      font-weight: 700;
      background: linear-gradient(135deg, var(--accent), var(--accent-hover));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    header p { color: var(--muted); margin-top: 0.5rem; font-size: 0.9rem; }
    .count {
      display: inline-block;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 0.2rem 0.75rem;
      font-size: 0.8rem;
      color: var(--muted);
      margin-top: 0.75rem;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 1.5rem;
      padding: 2rem;
      max-width: 1400px;
      margin: 0 auto;
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      transition: border-color 0.2s, transform 0.2s;
    }
    .card:hover {
      border-color: var(--accent);
      transform: translateY(-2px);
    }
    .thumbnail-link {
      display: block;
      text-decoration: none;
    }
    .thumbnail {
      position: relative;
      width: 100%;
      height: 200px;
      overflow: hidden;
      background: #0a0b0f;
      border-bottom: 1px solid var(--border);
    }
    .thumbnail iframe {
      position: absolute;
      top: 0;
      left: 0;
      width: 1280px;
      height: 800px;
      transform: scale(0.266);
      transform-origin: top left;
      border: none;
      pointer-events: none;
    }
    .card-body { padding: 1rem 1.25rem 1.25rem; }
    .card-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.5rem;
    }
    .card-header h2 {
      font-size: 1rem;
      font-weight: 600;
      line-height: 1.3;
    }
    .delete-btn {
      background: none;
      border: none;
      color: var(--muted);
      cursor: pointer;
      padding: 4px;
      border-radius: 6px;
      transition: color 0.2s, background 0.2s;
      flex-shrink: 0;
    }
    .delete-btn:hover {
      color: var(--danger);
      background: rgba(239, 68, 68, 0.1);
    }
    .badges {
      display: flex;
      gap: 0.4rem;
      margin-top: 0.5rem;
      flex-wrap: wrap;
    }
    .badge {
      font-size: 0.7rem;
      padding: 0.15rem 0.5rem;
      border-radius: 999px;
      font-weight: 500;
    }
    .badge.category {
      background: rgba(99, 102, 241, 0.15);
      color: var(--accent-hover);
      border: 1px solid rgba(99, 102, 241, 0.3);
    }
    .badge.sheet {
      background: rgba(34, 197, 94, 0.15);
      color: #4ade80;
      border: 1px solid rgba(34, 197, 94, 0.3);
    }
    .card .desc {
      color: var(--muted);
      font-size: 0.8rem;
      line-height: 1.5;
      margin-top: 0.5rem;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .card .meta {
      display: flex;
      justify-content: space-between;
      font-size: 0.7rem;
      color: var(--muted);
      margin-top: 0.75rem;
      padding-top: 0.75rem;
      border-top: 1px solid var(--border);
    }
    .card .slug {
      font-family: monospace;
      background: var(--bg);
      padding: 0.1rem 0.35rem;
      border-radius: 4px;
    }
    .empty {
      text-align: center;
      padding: 4rem 2rem;
    }
    .empty-icon { font-size: 3rem; margin-bottom: 1rem; }
    .empty h2 { font-size: 1.25rem; margin-bottom: 0.5rem; }
    .empty p { color: var(--muted); max-width: 500px; margin: 0 auto; line-height: 1.6; }
    .empty code {
      background: var(--surface);
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      font-size: 0.85rem;
    }
    .empty .hint { margin-top: 1rem; font-style: italic; font-size: 0.85rem; }
    .header-actions {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      margin-top: 0.75rem;
    }
    .import-btn {
      display: inline-block;
      background: var(--accent);
      color: white;
      text-decoration: none;
      padding: 0.4rem 1.1rem;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 600;
      transition: background 0.2s;
    }
    .import-btn:hover { background: var(--accent-hover); }

    /* Delete modal */
    .modal-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.7);
      z-index: 1000;
      align-items: center;
      justify-content: center;
    }
    .modal-overlay.active { display: flex; }
    .modal {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      width: 340px;
    }
    .modal h3 { margin-bottom: 0.75rem; font-size: 1rem; }
    .modal p { color: var(--muted); font-size: 0.85rem; margin-bottom: 1rem; }
    .modal input {
      width: 100%;
      padding: 0.5rem;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: var(--bg);
      color: var(--text);
      margin-bottom: 0.75rem;
    }
    .modal-actions {
      display: flex;
      gap: 0.5rem;
      justify-content: flex-end;
    }
    .modal-actions button {
      padding: 0.4rem 1rem;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      font-size: 0.85rem;
      font-weight: 500;
    }
    .btn-cancel {
      background: var(--bg);
      color: var(--text);
      border: 1px solid var(--border) !important;
    }
    .btn-delete {
      background: var(--danger);
      color: white;
    }
    .btn-delete:hover { background: var(--danger-hover); }
    .modal .error { color: var(--danger); font-size: 0.8rem; margin-top: 0.5rem; display: none; }
  </style>
</head>
<body>
  <header>
    <h1>Interactive Dashboards</h1>
    <p>Deployed via Claude MCP → dash.shopinzo.bond</p>
    <div class="header-actions">
      ${dashboards.length > 0 ? `<span class="count">${dashboards.length} dashboard${dashboards.length === 1 ? "" : "s"}</span>` : ""}
      <a href="/import" class="import-btn">+ Import Dashboard</a>
    </div>
  </header>
  ${empty}
  ${dashboards.length > 0 ? `<div class="grid">${cards}</div>` : ""}

  <!-- Delete confirmation modal -->
  <div class="modal-overlay" id="deleteModal">
    <div class="modal">
      <h3>Delete Dashboard</h3>
      <p>Enter admin token to confirm deletion of <strong id="deleteSlug"></strong>:</p>
      <input type="password" id="deleteToken" placeholder="Admin token" autocomplete="off" />
      <div class="error" id="deleteError">Invalid token or deletion failed.</div>
      <div class="modal-actions">
        <button class="btn-cancel" onclick="closeModal()">Cancel</button>
        <button class="btn-delete" onclick="confirmDelete()">Delete</button>
      </div>
    </div>
  </div>

  <script>
    let deleteSlug = '';

    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSlug = btn.dataset.slug;
        document.getElementById('deleteSlug').textContent = '/' + deleteSlug;
        document.getElementById('deleteToken').value = '';
        document.getElementById('deleteError').style.display = 'none';
        document.getElementById('deleteModal').classList.add('active');
        document.getElementById('deleteToken').focus();
      });
    });

    function closeModal() {
      document.getElementById('deleteModal').classList.remove('active');
      deleteSlug = '';
    }

    async function confirmDelete() {
      const token = document.getElementById('deleteToken').value;
      if (!token) return;
      try {
        const resp = await fetch('/api/dashboards/' + encodeURIComponent(deleteSlug), {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + token }
        });
        if (resp.ok) {
          location.reload();
        } else {
          document.getElementById('deleteError').style.display = 'block';
        }
      } catch {
        document.getElementById('deleteError').style.display = 'block';
      }
    }

    document.getElementById('deleteToken').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirmDelete();
      if (e.key === 'Escape') closeModal();
    });

    document.getElementById('deleteModal').addEventListener('click', (e) => {
      if (e.target === document.getElementById('deleteModal')) closeModal();
    });
  </script>
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/*  Import Dashboard page                                             */
/* ------------------------------------------------------------------ */

export function renderImportPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Import Dashboard — dash.shopinzo.bond</title>
  <style>
    :root {
      --bg: #0f1117;
      --surface: #1a1d27;
      --border: #2a2d3a;
      --text: #e4e4e7;
      --muted: #71717a;
      --accent: #6366f1;
      --accent-hover: #818cf8;
      --danger: #ef4444;
      --success: #22c55e;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
    }
    header {
      padding: 2rem 2rem 1.5rem;
      text-align: center;
      border-bottom: 1px solid var(--border);
    }
    header h1 {
      font-size: 1.75rem;
      font-weight: 700;
      background: linear-gradient(135deg, var(--accent), var(--accent-hover));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    header p { color: var(--muted); margin-top: 0.5rem; font-size: 0.9rem; }
    .back-link {
      display: inline-block;
      color: var(--accent);
      text-decoration: none;
      margin-top: 0.75rem;
      font-size: 0.85rem;
    }
    .back-link:hover { text-decoration: underline; }

    .form-container {
      max-width: 720px;
      margin: 2rem auto;
      padding: 0 2rem;
    }
    .form-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 2rem;
    }
    .form-row {
      margin-bottom: 1.25rem;
    }
    .form-row label {
      display: block;
      font-size: 0.85rem;
      font-weight: 600;
      margin-bottom: 0.4rem;
      color: var(--text);
    }
    .form-row .hint {
      font-size: 0.75rem;
      color: var(--muted);
      margin-bottom: 0.4rem;
    }
    .form-row input[type="text"],
    .form-row input[type="url"],
    .form-row input[type="password"],
    .form-row select {
      width: 100%;
      padding: 0.6rem 0.75rem;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--bg);
      color: var(--text);
      font-size: 0.9rem;
      outline: none;
      transition: border-color 0.2s;
    }
    .form-row input:focus,
    .form-row select:focus,
    .form-row textarea:focus {
      border-color: var(--accent);
    }
    .form-row textarea {
      width: 100%;
      padding: 0.6rem 0.75rem;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--bg);
      color: var(--text);
      font-size: 0.85rem;
      font-family: 'SF Mono', 'Fira Code', monospace;
      outline: none;
      resize: vertical;
      transition: border-color 0.2s;
    }
    .html-input { min-height: 300px; }
    .desc-input { min-height: 60px; }

    .form-row-inline {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }
    @media (max-width: 600px) {
      .form-row-inline { grid-template-columns: 1fr; }
    }

    .file-upload {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.5rem;
    }
    .file-upload label.file-btn {
      display: inline-block;
      background: var(--bg);
      border: 1px solid var(--border);
      padding: 0.4rem 0.9rem;
      border-radius: 8px;
      font-size: 0.8rem;
      cursor: pointer;
      transition: border-color 0.2s;
      color: var(--text);
      font-weight: 500;
    }
    .file-upload label.file-btn:hover { border-color: var(--accent); }
    .file-upload .file-name {
      font-size: 0.8rem;
      color: var(--muted);
    }
    .file-upload input[type="file"] { display: none; }

    .or-divider {
      text-align: center;
      color: var(--muted);
      font-size: 0.75rem;
      margin: 0.5rem 0;
    }

    .submit-row {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-top: 1.5rem;
    }
    .submit-btn {
      background: var(--accent);
      color: white;
      border: none;
      padding: 0.65rem 1.5rem;
      border-radius: 8px;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    .submit-btn:hover { background: var(--accent-hover); }
    .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .status-msg {
      font-size: 0.85rem;
      display: none;
    }
    .status-msg.error { color: var(--danger); display: block; }
    .status-msg.success { color: var(--success); display: block; }

    .preview-section {
      margin-top: 1.25rem;
      border-top: 1px solid var(--border);
      padding-top: 1.25rem;
    }
    .preview-section h3 {
      font-size: 0.85rem;
      font-weight: 600;
      margin-bottom: 0.75rem;
      color: var(--muted);
    }
    .preview-frame {
      width: 100%;
      height: 400px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: white;
    }
  </style>
</head>
<body>
  <header>
    <h1>Import Dashboard</h1>
    <p>Manually deploy an HTML dashboard with an optional linked data source</p>
    <a href="/" class="back-link">\u2190 Back to gallery</a>
  </header>

  <div class="form-container">
    <div class="form-card">
      <div class="form-row-inline">
        <div class="form-row">
          <label for="name">Dashboard Name *</label>
          <input type="text" id="name" placeholder="e.g. Product X Sales" required />
        </div>
        <div class="form-row">
          <label for="slug">Slug *</label>
          <div class="hint">URL path: dash.shopinzo.bond/<strong id="slugPreview">...</strong></div>
          <input type="text" id="slug" placeholder="e.g. product-x-sales" required />
        </div>
      </div>

      <div class="form-row-inline">
        <div class="form-row">
          <label for="category">Category</label>
          <input type="text" id="category" placeholder="e.g. Product X, Analytics" />
        </div>
        <div class="form-row">
          <label for="sheetUrl">Google Sheet URL</label>
          <div class="hint">Sheet must be shared as "Anyone with the link can view"</div>
          <input type="url" id="sheetUrl" placeholder="https://docs.google.com/spreadsheets/d/..." />
        </div>
      </div>

      <div class="form-row">
        <label for="description">Description</label>
        <textarea id="description" class="desc-input" placeholder="Brief description of this dashboard"></textarea>
      </div>

      <div class="form-row">
        <label>Dashboard HTML *</label>
        <div class="file-upload">
          <label class="file-btn" for="htmlFile">Upload .html file</label>
          <input type="file" id="htmlFile" accept=".html,.htm" />
          <span class="file-name" id="fileName">No file chosen</span>
        </div>
        <div class="or-divider">— or paste HTML below —</div>
        <textarea id="htmlContent" class="html-input" placeholder="&lt;!DOCTYPE html&gt;&#10;&lt;html&gt;&#10;  ...your dashboard HTML...&#10;&lt;/html&gt;"></textarea>
      </div>

      <div class="form-row">
        <label for="adminToken">Admin Token *</label>
        <input type="password" id="adminToken" placeholder="Enter admin token to authorize import" required />
      </div>

      <div class="submit-row">
        <button class="submit-btn" id="submitBtn" onclick="submitDashboard()">Deploy Dashboard</button>
        <span class="status-msg" id="statusMsg"></span>
      </div>

      <div class="preview-section" id="previewSection" style="display:none">
        <h3>Preview</h3>
        <iframe id="previewFrame" class="preview-frame" sandbox="allow-scripts"></iframe>
      </div>
    </div>
  </div>

  <script>
    // Auto-generate slug from name
    const nameEl = document.getElementById('name');
    const slugEl = document.getElementById('slug');
    const slugPreview = document.getElementById('slugPreview');
    let slugManuallyEdited = false;

    slugEl.addEventListener('input', () => { slugManuallyEdited = true; updateSlugPreview(); });
    nameEl.addEventListener('input', () => {
      if (!slugManuallyEdited) {
        slugEl.value = nameEl.value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
      }
      updateSlugPreview();
    });

    function updateSlugPreview() {
      slugPreview.textContent = slugEl.value || '...';
    }

    // File upload handling
    const htmlFileEl = document.getElementById('htmlFile');
    const htmlContentEl = document.getElementById('htmlContent');
    const fileNameEl = document.getElementById('fileName');

    htmlFileEl.addEventListener('change', () => {
      const file = htmlFileEl.files[0];
      if (!file) return;
      fileNameEl.textContent = file.name;
      const reader = new FileReader();
      reader.onload = (e) => {
        htmlContentEl.value = e.target.result;
        updatePreview();
      };
      reader.readAsText(file);
    });

    // Live preview
    htmlContentEl.addEventListener('input', debounce(updatePreview, 500));

    function updatePreview() {
      const html = htmlContentEl.value.trim();
      const previewSection = document.getElementById('previewSection');
      const previewFrame = document.getElementById('previewFrame');
      if (html.length > 50) {
        previewSection.style.display = 'block';
        previewFrame.srcdoc = html;
      } else {
        previewSection.style.display = 'none';
      }
    }

    function debounce(fn, ms) {
      let timer;
      return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
    }

    // Submit
    async function submitDashboard() {
      const btn = document.getElementById('submitBtn');
      const status = document.getElementById('statusMsg');
      status.className = 'status-msg';
      status.style.display = 'none';

      const name = nameEl.value.trim();
      const slug = slugEl.value.trim();
      const html = htmlContentEl.value.trim();
      const token = document.getElementById('adminToken').value.trim();

      if (!name || !slug || !html || !token) {
        status.textContent = 'Please fill in all required fields (name, slug, HTML, token).';
        status.className = 'status-msg error';
        return;
      }

      if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) && !/^[a-z0-9]$/.test(slug)) {
        status.textContent = 'Slug must be lowercase letters, numbers, and hyphens only.';
        status.className = 'status-msg error';
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Deploying...';

      try {
        const body = {
          slug,
          name,
          description: document.getElementById('description').value.trim(),
          category: document.getElementById('category').value.trim() || 'General',
          html,
          sheetUrl: document.getElementById('sheetUrl').value.trim(),
        };

        const resp = await fetch('/api/dashboards', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
          },
          body: JSON.stringify(body),
        });

        const data = await resp.json();

        if (resp.ok) {
          status.textContent = 'Dashboard deployed successfully! Redirecting...';
          status.className = 'status-msg success';
          setTimeout(() => { window.location.href = '/' + slug; }, 1000);
        } else {
          status.textContent = data.error || 'Deployment failed.';
          status.className = 'status-msg error';
        }
      } catch (err) {
        status.textContent = 'Network error: ' + err.message;
        status.className = 'status-msg error';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Deploy Dashboard';
      }
    }

    // Enter key in token field triggers submit
    document.getElementById('adminToken').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitDashboard();
    });
  </script>
</body>
</html>`;
}
