/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * storage.ts
 * ----------
 * Persistence for sagas (series) + issues. Comic pages are base64 images that
 * easily blow past the ~5MB localStorage quota, so the heavy data lives in
 * IndexedDB. A small localStorage index keeps the library grid fast.
 *
 * No external dependencies — a tiny promise wrapper over the native IndexedDB.
 */

import { Series, SeriesSummary } from "./types";

const DB_NAME = "infinite-heroes";
const DB_VERSION = 1;
const STORE = "series";
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
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
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
    updatedAt: s.updatedAt,
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
    // Cover thumbnails can be large; keep the index lean by dropping covers
    // if it gets close to the localStorage budget.
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

// ---------------------------------------------------------------------------
// PUBLIC API
// ---------------------------------------------------------------------------

export async function saveSeries(series: Series): Promise<void> {
  series.updatedAt = Date.now();
  try {
    await tx("readwrite", (store) => store.put(series));
  } catch (e) {
    console.warn("IndexedDB save failed", e);
  }
  const idx = readIndex().filter((s) => s.id !== series.id);
  idx.unshift(summarize(series));
  idx.sort((a, b) => b.updatedAt - a.updatedAt);
  writeIndex(idx);
}

export async function loadSeries(id: string): Promise<Series | null> {
  try {
    const result = await tx<Series | undefined>("readonly", (store) =>
      store.get(id),
    );
    return result ?? null;
  } catch (e) {
    console.warn("IndexedDB load failed", e);
    return null;
  }
}

export async function deleteSeries(id: string): Promise<void> {
  try {
    await tx("readwrite", (store) => store.delete(id));
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
    const all = await tx<Series[]>("readonly", (store) =>
      (store as any).getAll(),
    );
    const summaries = (all || [])
      .map(summarize)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    writeIndex(summaries);
    return summaries;
  } catch {
    return readIndex();
  }
}
