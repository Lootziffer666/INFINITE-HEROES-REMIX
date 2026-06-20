/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * cameo.ts
 * --------
 * Portable character "cameo cards" and CROSS-OVER packs.
 *
 *  - A single character can be exported to a .cameo.json card.
 *  - A whole party can be exported to a .crossover.json pack.
 *  - Either file can be imported into another saga, and characters can also be
 *    pulled straight from another saved saga in your library (no file) — so a
 *    hero can guest-star, or two casts can cross over, across comics (the
 *    foundation for cross-saga, and later cross-user, cross-overs).
 *
 * Imported data is UNTRUSTED: we only read known fields, normalise portraits to
 * a bare base64 payload, clamp sizes/lengths, cap the number of characters, and
 * hand text to the caller's moderation layer. Nothing is eval'd or executed.
 */

import { Character, CharacterRole, uid } from "./types";

export const CAMEO_SCHEMA = "infinite-heroes/cameo";
export const CROSSOVER_SCHEMA = "infinite-heroes/crossover";
export const CAMEO_VERSION = 1;

export interface CameoCard {
  schema: string;
  version: number;
  exportedAt: number;
  originTitle: string;
  character: Character;
}

export interface CrossoverPack {
  schema: string;
  version: number;
  exportedAt: number;
  originTitle: string;
  characters: Character[];
}

// ~6MB of base64 is a generous portrait ceiling; reject anything larger.
const MAX_PORTRAIT_CHARS = 8_000_000;
// A crossover pack can't dump an unbounded number of characters.
const MAX_PACK_CHARACTERS = 12;

const safeName = (s: string): string =>
  (s || "cameo").replace(/[^\w.-]+/g, "_").slice(0, 60) || "cameo";

const clampStat = (n: unknown): number => {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 10;
  return Math.max(1, Math.min(20, v));
};

const str = (v: unknown, max: number): string => String(v ?? "").slice(0, max);

/**
 * Normalise an arbitrary object into a fresh, sanitised guest Character with a
 * NEW id. `originTitle` is recorded as the saga the guest came from.
 */
export function sanitizeGuest(raw: any, originTitle?: string): Character {
  if (!raw || typeof raw !== "object") {
    throw new Error("No character data found.");
  }
  let portrait = String(raw.portrait ?? "");
  if (portrait.startsWith("data:")) {
    const comma = portrait.indexOf(",");
    if (comma !== -1) portrait = portrait.slice(comma + 1);
  }
  portrait = portrait.trim();
  if (!portrait) throw new Error(`"${str(raw.name, 40) || "A character"}" has no portrait image.`);
  if (portrait.length > MAX_PORTRAIT_CHARS) throw new Error("A portrait in this file is too large.");

  const role: CharacterRole = ["hero", "ally", "villain"].includes(raw.role) ? raw.role : "ally";
  const s = raw.stats ?? {};
  const origin = originTitle ? str(originTitle, 80) : raw.cameoFrom ? str(raw.cameoFrom, 80) : undefined;

  return {
    id: uid(),
    role,
    name: str(raw.name, 60).trim() || "Guest Star",
    portrait,
    description: str(raw.description, 600),
    bio: raw.bio ? str(raw.bio, 1200) : undefined,
    charClass: raw.charClass ? str(raw.charClass, 40) : "Adventurer",
    stats: {
      strength: clampStat(s.strength),
      dexterity: clampStat(s.dexterity),
      constitution: clampStat(s.constitution),
      intelligence: clampStat(s.intelligence),
      wisdom: clampStat(s.wisdom),
      charisma: clampStat(s.charisma),
    },
    status: "alive", // a cameo/crossover is a fresh appearance
    player: raw.player ? str(raw.player, 60) : undefined,
    cameoFrom: origin,
  };
}

/** Export a single character to a downloadable cameo card. */
export function exportCameo(character: Character, originTitle: string): void {
  const card: CameoCard = {
    schema: CAMEO_SCHEMA,
    version: CAMEO_VERSION,
    exportedAt: Date.now(),
    originTitle,
    character,
  };
  download(JSON.stringify(card, null, 2), `${safeName(character.name)}.cameo.json`);
}

/** Export several characters (e.g. a whole party) as a cross-over pack. */
export function exportCrossover(characters: Character[], originTitle: string): void {
  const pack: CrossoverPack = {
    schema: CROSSOVER_SCHEMA,
    version: CAMEO_VERSION,
    exportedAt: Date.now(),
    originTitle,
    characters,
  };
  download(JSON.stringify(pack, null, 2), `${safeName(originTitle)}.crossover.json`);
}

function download(text: string, filename: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Parse a cameo card, a crossover pack, OR a bare character object into a list
 * of fresh, sanitised guest Characters. Throws a friendly Error on bad input.
 */
export function parseCameoData(jsonText: string): Character[] {
  let data: any;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw new Error("That file isn't valid JSON — is it a cameo or crossover file?");
  }

  // Crossover pack: { characters: [...] }
  if (Array.isArray(data?.characters)) {
    const origin = data.originTitle;
    const list = data.characters.slice(0, MAX_PACK_CHARACTERS);
    if (list.length === 0) throw new Error("This crossover pack has no characters.");
    return list.map((c: any) => sanitizeGuest(c, origin));
  }
  // Bare array of characters
  if (Array.isArray(data)) {
    return data.slice(0, MAX_PACK_CHARACTERS).map((c: any) => sanitizeGuest(c));
  }
  // Single cameo card { character: {...} } or a bare character object
  const raw = data?.character ?? data;
  return [sanitizeGuest(raw, data?.originTitle)];
}

/** Read a user-selected file into a list of sanitised guest Characters. */
export function readCameoFile(file: File): Promise<Character[]> {
  return new Promise((resolve, reject) => {
    if (file.size > (MAX_PORTRAIT_CHARS + 100_000) * MAX_PACK_CHARACTERS) {
      reject(new Error("That file is too large."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(parseCameoData(String(reader.result || "")));
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsText(file);
  });
}
