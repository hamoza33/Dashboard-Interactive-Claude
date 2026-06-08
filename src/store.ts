/**
 * File-based dashboard storage.
 *
 * Registry lives at `<dataDir>/registry.json`.
 * Dashboard HTML files live at `<dataDir>/dashboards/<slug>.html`.
 */

import { mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface DashboardMeta {
  slug: string;
  name: string;
  description: string;
  category: string;
  sheetUrl: string;
  createdAt: string;
  updatedAt: string;
}

export class DashboardStore {
  private readonly registryPath: string;
  private readonly dashboardsDir: string;

  constructor(dataDir: string) {
    this.registryPath = join(dataDir, "registry.json");
    this.dashboardsDir = join(dataDir, "dashboards");
    mkdirSync(this.dashboardsDir, { recursive: true });
    if (!existsSync(this.registryPath)) {
      writeFileSync(this.registryPath, "[]", "utf-8");
    }
  }

  private readRegistry(): DashboardMeta[] {
    const raw = readFileSync(this.registryPath, "utf-8");
    return JSON.parse(raw) as DashboardMeta[];
  }

  private writeRegistry(entries: DashboardMeta[]): void {
    writeFileSync(this.registryPath, JSON.stringify(entries, null, 2), "utf-8");
  }

  private htmlPath(slug: string): string {
    return join(this.dashboardsDir, `${slug}.html`);
  }

  list(): DashboardMeta[] {
    return this.readRegistry();
  }

  get(slug: string): DashboardMeta | undefined {
    return this.readRegistry().find((d) => d.slug === slug);
  }

  getHtml(slug: string): string | undefined {
    const p = this.htmlPath(slug);
    if (!existsSync(p)) return undefined;
    return readFileSync(p, "utf-8");
  }

  deploy(
    slug: string,
    name: string,
    description: string,
    html: string,
    category: string,
    sheetUrl: string,
  ): DashboardMeta {
    const entries = this.readRegistry();
    const now = new Date().toISOString();
    const existing = entries.find((d) => d.slug === slug);

    if (existing) {
      existing.name = name;
      existing.description = description;
      existing.category = category;
      existing.sheetUrl = sheetUrl;
      existing.updatedAt = now;
    } else {
      entries.push({ slug, name, description, category, sheetUrl, createdAt: now, updatedAt: now });
    }

    writeFileSync(this.htmlPath(slug), html, "utf-8");
    this.writeRegistry(entries);
    return entries.find((d) => d.slug === slug)!;
  }

  update(
    slug: string,
    html: string,
    name?: string,
    description?: string,
    category?: string,
    sheetUrl?: string,
  ): DashboardMeta | undefined {
    const entries = this.readRegistry();
    const entry = entries.find((d) => d.slug === slug);
    if (!entry) return undefined;

    const now = new Date().toISOString();
    entry.updatedAt = now;
    if (name !== undefined) entry.name = name;
    if (description !== undefined) entry.description = description;
    if (category !== undefined) entry.category = category;
    if (sheetUrl !== undefined) entry.sheetUrl = sheetUrl;

    writeFileSync(this.htmlPath(slug), html, "utf-8");
    this.writeRegistry(entries);
    return entry;
  }

  remove(slug: string): boolean {
    const entries = this.readRegistry();
    const idx = entries.findIndex((d) => d.slug === slug);
    if (idx === -1) return false;

    entries.splice(idx, 1);
    this.writeRegistry(entries);

    const p = this.htmlPath(slug);
    if (existsSync(p)) unlinkSync(p);
    return true;
  }
}
