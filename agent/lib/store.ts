import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { BLOB_PREFIX, blobAccess } from "./config.ts";

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
const LATEST = "index.html";

export interface SavedPage {
  readonly store: "blob" | "local";
  readonly latest: string;
  readonly archived: string;
  readonly bytes: number;
}

/** Saves the page as the latest render plus an archived copy keyed by commit and deployment. */
export async function savePage(html: string, key: string): Promise<SavedPage> {
  const archivedName = `renders/${key.replace(/[^a-zA-Z0-9._-]/g, "_")}.html`;
  const bytes = Buffer.byteLength(html);
  if (storeKind() === "blob") {
    const { put } = await import("@vercel/blob");
    const opts = { access: blobAccess(), contentType: "text/html; charset=utf-8", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60 } as const;
    const archived = await put(`${BLOB_PREFIX}/${archivedName}`, html, opts);
    const latest = await put(`${BLOB_PREFIX}/${LATEST}`, html, opts);
    return { store: "blob", latest: latest.pathname, archived: archived.pathname, bytes };
  }
  await mkdir(path.join(LOCAL_DIR, "renders"), { recursive: true });
  await writeFile(path.join(LOCAL_DIR, archivedName), html, "utf8");
  await writeFile(path.join(LOCAL_DIR, LATEST), html, "utf8");
  return { store: "local", latest: path.join(LOCAL_DIR, LATEST), archived: path.join(LOCAL_DIR, archivedName), bytes };
}

/** Loads the latest rendered page, or null when nothing has been rendered yet. */
export async function loadLatestPage(): Promise<string | null> {
  try {
    if (storeKind() === "blob") {
      const { get } = await import("@vercel/blob");
      const result = await get(`${BLOB_PREFIX}/${LATEST}`, { access: blobAccess(), useCache: false });
      if (!result || !result.stream) return null;
      return await new Response(result.stream).text();
    }
    return await readFile(path.join(LOCAL_DIR, LATEST), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("[cybernetics-log] could not load latest page:", (error as Error).message);
    }
    return null;
  }
}
