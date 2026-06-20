/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * storage.ts
 * ----------
 * Persistence for sagas (series) + issues.
 *
 * Heavy page artwork (base64  comic panels) is split into its OWN IndexedDB
 * object store ("pages"), keyed by issue id. The "series" store keeps only the
 * lightweight saga metadata (cast, settings, campaigns, and issues WITHOUT
 * their faces). This keeps the hot save path cheap:
 *
 *   - saveActiveIssue(series, issueId)  -> rewrites meta + ONE issue's pages
 *   - persistMeta(series)               -> rewrites meta only (no page images)
 *   - saveSeries(series)                -> full write (meta + every issue)
 *
 * A small localStorage index keeps the library grid fast. Loading reassembles
 * each issue's faces from the pages store, with a fallback to any inline faces
 * still present in legacy (v1) records.
 */

import { defaultAudio, defaultProvider, Series, SeriesSummary } from "./types";

const DB_NAME = "infinite-heroes";
const DB_VERSION = 2;
const STORE = "series";
const PAGES = "pages";
const INDEX_KEY = "infinite-heroes:index";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(PAGES)) db.createObjectStore(PAGES, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(
  storeNames: string | string[],
  mode: IDBTransactionMode,
  fn: (t: IDBTransaction) => IDBRequest<T> | void,
): Promise<T | void> {
  return openDB().then(
    (db) =>
      new Promise<T | void>((resolve, reject) => {
        const t = db.transaction(storeNames, mode);
        let req: IDBRequest<T> | void;
        try {
          req = fn(t);
        } catch (e) {
          reject(e);
          return;
        }
        if (req) {
          req.onsuccess = () => resolve(req!.result);
          req.onerror = () => reject(req!.error);
        } else {
          t.oncomplete = () => resolve();
          t.onerror = () => reject(t.error);
          t.onabort = () => reject(t.error);
        }
      }),
  );
}

// ---------------------------------------------------------------------------
// META / PAGE SPLIT HELPERS
// ---------------------------------------------------------------------------

// A copy of the series with every issue's heavy `faces` stripped out.
function stripFaces(series: Series): Series {
  return {
    ...series,
    updatedAt: Date.now(),
    issues: series.issues.map((i) => ({ ...i, faces: [] })),
  };
}

async function writeMeta(series: Series): Promise<void> {
  await tx(STORE, "readwrite", (t) => t.objectStore(STORE).put(stripFaces(series)));
}

async function writePages(issueId: string, faces: unknown[]): Promise<void> {
  await tx(PAGES, "readwrite", (t) => t.objectStore(PAGES).put({ id: issueId, faces }));
}

async function readPages(issueId: string): Promise<any[] | undefined> {
  const rec = (await tx<any>(PAGES, "readonly", (t) => t.objectStore(PAGES).get(issueId))) as
    | { id: string; faces: any[] }
    | undefined;
  return rec?.faces;
}

// ---------------------------------------------------------------------------
// LIBRARY INDEX (lightweight, in localStorage)
// ---------------------------------------------------------------------------

function summarize(s: Series): SeriesSummary {
  const cover = s.issues
    .flatMap((i) => i.faces)
    .find((f) => f.type === "cover" && f.imageUrl);
  return {
    id: s.id,
    title: s.title,
    coverUrl: cover?.imageUrl,
    issueCount: s.issues.length,
    castCount: s.cast.length,
    style: s.settings.style,
    safeMode: s.safeMode,
    gmMode: s.gmMode,
    campaignCount: s.campaigns?.length ?? 0,
    updatedAt: Date.now(),
  };
}

function readIndex(): SeriesSummary[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    return raw ? (JSON.parse(raw) as SeriesSummary[]) : [];
  } catch {
    return [];
  }
}

function writeIndex(list: SeriesSummary[]) {
  try {
    const json = JSON.stringify(list);
    if (json.length > 4_000_000) {
      localStorage.setItem(
        INDEX_KEY,
        JSON.stringify(list.map((s) => ({ ...s, coverUrl: undefined }))),
      );
    } else {
      localStorage.setItem(INDEX_KEY, json);
    }
  } catch {
    /* ignore quota errors for the index; IDB remains source of truth */
  }
}

// `series` must still carry in-memory faces so the cover thumbnail resolves.
function bumpIndex(series: Series) {
  const idx = readIndex().filter((s) => s.id !== series.id);
  idx.unshift(summarize(series));
  idx.sort((a, b) => b.updatedAt - a.updatedAt);
  writeIndex(idx);
}

// ---------------------------------------------------------------------------
// PUBLIC API
// ---------------------------------------------------------------------------

/** Write saga metadata only (no page images). Cheapest save. */
export async function persistMeta(series: Series): Promise<void> {
  try {
    await writeMeta(series);
  } catch (e) {
    console.warn("persistMeta failed", e);
  }
  bumpIndex(series);
}

/** Write metadata + the pages of a single issue (the reader hot path). */
export async function saveActiveIssue(series: Series, issueId: string): Promise<void> {
  const issue = series.issues.find((i) => i.id === issueId);
  try {
    await writeMeta(series);
    if (issue) await writePages(issueId, issue.faces);
  } catch (e) {
    console.warn("saveActiveIssue failed", e);
  }
  bumpIndex(series);
}

/** Full write: metadata + every issue's pages. */
export async function saveSeries(series: Series): Promise<void> {
  try {
    await writeMeta(series);
    for (const issue of series.issues) await writePages(issue.id, issue.faces);
  } catch (e) {
    console.warn("saveSeries failed", e);
  }
  bumpIndex(series);
}

export async function loadSeries(id: string): Promise<Series | null> {
  try {
    const meta = (await tx<Series>(STORE, "readonly", (t) => t.objectStore(STORE).get(id))) as
      | Series
      | undefined;
    if (!meta) return null;
    // Reassemble each issue's faces from the pages store, falling back to any
    // inline faces from a legacy (v1) record.
    const issues = await Promise.all(
      (meta.issues || []).map(async (i) => {
        const pages = await readPages(i.id);
        return { ...i, faces: pages ?? i.faces ?? [] };
      }),
    );
    return normalize({ ...meta, issues });
  } catch (e) {
    console.warn("IndexedDB load failed", e);
    return null;
  }
}

export async function deleteSeries(id: string): Promise<void> {
  try {
    const meta = (await tx<Series>(STORE, "readonly", (t) => t.objectStore(STORE).get(id))) as
      | Series
      | undefined;
    const issueIds = (meta?.issues || []).map((i) => i.id);
    await tx([STORE, PAGES], "readwrite", (t) => {
      t.objectStore(STORE).delete(id);
      const pages = t.objectStore(PAGES);
      issueIds.forEach((iid) => pages.delete(iid));
    });
  } catch (e) {
    console.warn("IndexedDB delete failed", e);
  }
  writeIndex(readIndex().filter((s) => s.id !== id));
}

export function listSeries(): SeriesSummary[] {
  return readIndex();
}

/** Rebuild the localStorage index from IndexedDB (recovery / migration). */
export async function rebuildIndex(): Promise<SeriesSummary[]> {
  try {
    const keys = (await tx<IDBValidKey[]>(STORE, "readonly", (t) =>
      (t.objectStore(STORE) as any).getAllKeys(),
    )) as IDBValidKey[];
    const summaries: SeriesSummary[] = [];
    for (const k of keys || []) {
      const full = await loadSeries(String(k));
      if (full) summaries.push(summarize(full));
    }
    summaries.sort((a, b) => b.updatedAt - a.updatedAt);
    writeIndex(summaries);
    return summaries;
  } catch {
    return readIndex();
  }
}

// ---------------------------------------------------------------------------
// SCHEMA NORMALISATION (forward/backward compatibility)
// ---------------------------------------------------------------------------
// Sagas saved by older builds predate fields like the OpenAI provider config,
// audio settings, narrator persona, and campaigns. Merge in defaults on load
// so the rest of the app can assume a complete shape. Exported for testing.
export function normalize(s: Series): Series {
  return {
    ...s,
    provider: { ...defaultProvider(), ...(s.provider || {}) },
    audio: { ...defaultAudio(), ...(s.audio || {}) },
    campaigns: s.campaigns ?? [],
    settings: { persona: "classic", ...s.settings },
  };
}
