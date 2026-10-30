import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { BLOB_PREFIX, blobAccess } from "./config.ts";
import { pathToStorageKey } from "./rounds.ts";
import type { SitePage } from "./render.ts";

/**
 * Where rendered pages live.
 *
 * - On Vercel: a Vercel Blob store connected to the project. Auth is either
 *   OIDC (`VERCEL_OIDC_TOKEN` + `BLOB_STORE_ID`, which the store connection
 *   provides) or `BLOB_READ_WRITE_TOKEN`. Nothing is committed.
 * - Locally (no Blob credentials): files under `.eve/rendered/`.
 */
export function storeKind(): "blob" | "local" {
  if (process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  if (process.env.BLOB_STORE_ID && (process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL === "1")) return "blob";
  return "local";
}

const LOCAL_DIR = path.join(process.cwd(), ".eve", "rendered");

export interface SavedSite {
  readonly store: "blob" | "local";
  readonly paths: readonly string[];
  readonly archivedPrefix: string;
  readonly bytes: number;
}

const putOpts = () =>
  ({ access: blobAccess(), contentType: "text/html; charset=utf-8", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60 }) as const;

/**
 * Saves every page of a render. Idempotent per deployment: the same relative
 * Blob keys are overwritten (`index.html`, `about.html`, `rounds/N.html`) and
 * a full copy is archived under `renders/<key>/`.
 */
export async function saveSite(pages: readonly SitePage[], key: string): Promise<SavedSite> {
  const safeKey = key.replace(/[^a-zA-Z0-9._-]/g, "_");
  const archivedPrefix = `renders/${safeKey}`;
  const bytes = pages.reduce((n, p) => n + Buffer.byteLength(p.html), 0);
  const paths = pages.map((p) => p.path);
  // Archive first, then live pages with `index.html` last, then the manifest:
  // a failed write never leaves `/` linking to a round page that isn't stored.
  const rest = pages.filter((p) => p.path !== "/");
  const home = pages.filter((p) => p.path === "/");

  if (storeKind() === "blob") {
    const { put } = await import("@vercel/blob");
    const opts = putOpts();
    await Promise.all(pages.map((page) => put(`${BLOB_PREFIX}/${archivedPrefix}/${pathToStorageKey(page.path)}`, page.html, opts)));
    await Promise.all(rest.map((page) => put(`${BLOB_PREFIX}/${pathToStorageKey(page.path)}`, page.html, opts)));
    for (const page of home) await put(`${BLOB_PREFIX}/${pathToStorageKey(page.path)}`, page.html, opts);
    // Manifest so a deploy can be inspected without listing the whole store.
    const manifest = JSON.stringify({ key: safeKey, paths, archivedPrefix, renderedAt: new Date().toISOString() });
    await put(`${BLOB_PREFIX}/manifest.json`, manifest, { ...opts, contentType: "application/json; charset=utf-8" });
    await put(`${BLOB_PREFIX}/${archivedPrefix}/manifest.json`, manifest, { ...opts, contentType: "application/json; charset=utf-8" });
    return { store: "blob", paths, archivedPrefix, bytes };
  }

  for (const page of pages) {
    const archivedPath = path.join(LOCAL_DIR, archivedPrefix, pathToStorageKey(page.path));
    await mkdir(path.dirname(archivedPath), { recursive: true });
    await writeFile(archivedPath, page.html, "utf8");
  }
  for (const page of [...rest, ...home]) {
    const latestPath = path.join(LOCAL_DIR, pathToStorageKey(page.path));
    await mkdir(path.dirname(latestPath), { recursive: true });
    await writeFile(latestPath, page.html, "utf8");
  }
  const manifest = JSON.stringify({ key: safeKey, paths, archivedPrefix, renderedAt: new Date().toISOString() }, null, 2);
  await writeFile(path.join(LOCAL_DIR, "manifest.json"), manifest, "utf8");
  await mkdir(path.join(LOCAL_DIR, archivedPrefix), { recursive: true });
  await writeFile(path.join(LOCAL_DIR, archivedPrefix, "manifest.json"), manifest, "utf8");
  return { store: "local", paths, archivedPrefix, bytes };
}

/** Loads one rendered page by site path (`/`, `/about`, `/rounds/7`), or null. */
export async function loadPage(pagePath: string): Promise<string | null> {
  const rel = pathToStorageKey(pagePath);
  try {
    if (storeKind() === "blob") {
      const { get } = await import("@vercel/blob");
      const result = await get(`${BLOB_PREFIX}/${rel}`, { access: blobAccess(), useCache: false });
      if (!result || !result.stream) return null;
      return await new Response(result.stream).text();
    }
    return await readFile(path.join(LOCAL_DIR, rel), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("[cybernetics-log] could not load page", pagePath, (error as Error).message);
    }
    return null;
  }
}

/** Loads the home page (latest round + earlier-rounds index). */
export async function loadLatestPage(): Promise<string | null> {
  return loadPage("/");
}
