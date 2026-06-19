/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * safety.ts
 * ---------
 * A lightweight, layered content-safety system. This app is meant to be used
 * by children, so safety is treated as a first-class feature rather than an
 * afterthought.
 *
 * Three layers:
 *   1. INPUT MODERATION  - screen everything the user types (names, bios,
 *      descriptions, style/setting, custom premises) before it ever reaches
 *      a model. Blocks on hard categories, warns on softer ones.
 *   2. PROMPT GUARDRAILS  - inject explicit "stay in bounds" instructions into
 *      both the writer (text) and artist (image) prompts.
 *   3. OUTPUT SANITISATION - last-chance scrub of generated captions/dialogue.
 *
 * The blocklist is intentionally conservative for Safe Mode. It is a heuristic
 * filter, not a guarantee, and is paired with the model's own safety settings.
 */

import { Audience } from "./types";

// ---------------------------------------------------------------------------
// TERM LISTS
// ---------------------------------------------------------------------------

// Hard-blocked in every mode (illegal / exploitative / extreme). These cause a
// flat refusal regardless of Safe Mode.
const ALWAYS_BLOCKED: RegExp[] = [
  /\bchild\s*(porn|sex|abuse)\b/i,
  /\bcsam\b/i,
  /\bbestiality\b/i,
  /\brape\b/i,
  /\bincest\b/i,
  /\bhow\s+to\s+(make|build)\s+(a\s+)?(bomb|explosive|nerve\s*agent)\b/i,
  /\b(suicide|self[-\s]?harm)\s+(method|instructions|how)\b/i,
];

// Blocked only when Safe Mode is ON (i.e. when a child may be reading).
const SAFE_MODE_BLOCKED: RegExp[] = [
  // sexual / adult
  /\b(sex|sexual|nude|nudity|naked|porn|erotic|fetish|nsfw)\b/i,
  // graphic gore
  /\b(gore|gory|dismember|decapitat|disembowel|mutilat)\b/i,
  // drugs
  /\b(cocaine|heroin|meth(amphetamine)?|drug\s*deal)\b/i,
  // slurs / hate (kept generic; the model handles the rest)
  /\b(slur|racist\s+joke)\b/i,
  // explicit self-harm framing
  /\b(self[-\s]?harm|cutting\s+myself|kill\s+myself)\b/i,
];

// Softer terms that we allow but lean away from in Safe Mode (warn only).
const SAFE_MODE_DISCOURAGED: RegExp[] = [
  /\b(blood|kill|die|death|gun|knife|weapon)\b/i,
];

export interface ModerationResult {
  ok: boolean;
  /** "block" => refuse, "warn" => allow but flag, "clean" => fine. */
  level: "clean" | "warn" | "block";
  message?: string;
}

/**
 * Screen a free-text user input. `safeMode` raises strictness for child use.
 */
export function moderateInput(
  text: string | undefined | null,
  safeMode: boolean,
): ModerationResult {
  if (!text || !text.trim()) return { ok: true, level: "clean" };

  for (const re of ALWAYS_BLOCKED) {
    if (re.test(text)) {
      return {
        ok: false,
        level: "block",
        message:
          "That request can't be used here. Let's keep the story safe and fun — try a different idea.",
      };
    }
  }

  if (safeMode) {
    for (const re of SAFE_MODE_BLOCKED) {
      if (re.test(text)) {
        return {
          ok: false,
          level: "block",
          message:
            "Safe Mode is on, so that wording isn't allowed. Try something more kid-friendly (heroic, adventurous, silly, mysterious).",
        };
      }
    }
    for (const re of SAFE_MODE_DISCOURAGED) {
      if (re.test(text)) {
        return {
          ok: true,
          level: "warn",
          message:
            "Heads up: Safe Mode will keep things gentle, so intense themes get softened automatically.",
        };
      }
    }
  }

  return { ok: true, level: "clean" };
}

/**
 * Convenience: moderate several fields at once; returns the first blocking
 * result, otherwise the most severe warn, otherwise clean.
 */
export function moderateFields(
  fields: (string | undefined | null)[],
  safeMode: boolean,
): ModerationResult {
  let warn: ModerationResult | null = null;
  for (const f of fields) {
    const r = moderateInput(f, safeMode);
    if (r.level === "block") return r;
    if (r.level === "warn" && !warn) warn = r;
  }
  return warn ?? { ok: true, level: "clean" };
}

// ---------------------------------------------------------------------------
// PROMPT GUARDRAILS
// ---------------------------------------------------------------------------

/**
 * Instructions appended to the WRITER prompt so generated story text stays in
 * bounds for the chosen audience.
 */
export function writerGuardrails(audience: Audience, safeMode: boolean): string {
  if (safeMode || audience === "kids") {
    return [
      "CONTENT SAFETY (STRICT — A CHILD IS READING):",
      "- Keep everything appropriate for all ages, like a Saturday-morning cartoon or a children's adventure book.",
      "- NO sexual content, romance beyond a friendly crush, nudity, profanity, slurs, or drugs/alcohol.",
      "- NO graphic violence or gore. Conflict is resolved with cleverness, teamwork, courage, and heart.",
      "- Danger can be exciting but never traumatic; nobody is gruesomely hurt or killed on-page.",
      "- Villains can be scary-fun and scheming, but are defeated, redeemed, or outwitted — not brutalised.",
      "- Model kindness, bravery, honesty, and friendship.",
    ].join("\n");
  }
  if (audience === "teen") {
    return [
      "CONTENT SAFETY (TEEN / PG-13):",
      "- Adventure-level peril and mild stylised action are fine; avoid gore, explicit content, and strong profanity.",
      "- No sexual content or drug use. Keep romance light.",
    ].join("\n");
  }
  // mature (still no extreme content)
  return [
    "CONTENT SAFETY (MATURE 16+):",
    "- Darker, more dramatic themes are allowed, but avoid explicit sexual content, gratuitous gore, and anything illegal or hateful.",
  ].join("\n");
}

/**
 * Instructions appended to the ARTIST prompt to keep imagery in bounds.
 */
export function artistGuardrails(audience: Audience, safeMode: boolean): string {
  if (safeMode || audience === "kids") {
    return "IMAGE SAFETY: All-ages, wholesome comic art. Fully clothed characters, no blood, no gore, no weapons pointed at people, no sexualisation, no disturbing imagery. Bright, friendly, heroic energy.";
  }
  if (audience === "teen") {
    return "IMAGE SAFETY: PG-13 comic art. No nudity, no explicit gore, no sexualised imagery.";
  }
  return "IMAGE SAFETY: No explicit nudity, no gratuitous gore, no hateful symbols.";
}

// ---------------------------------------------------------------------------
// OUTPUT SANITISATION
// ---------------------------------------------------------------------------

const PROFANITY: { re: RegExp; replace: string }[] = [
  { re: /\bf+u+c+k+\w*\b/gi, replace: "heck" },
  { re: /\bs+h+i+t+\w*\b/gi, replace: "shoot" },
  { re: /\bb+i+t+c+h+\w*\b/gi, replace: "rascal" },
  { re: /\ba+s+s+h+o+l+e+\w*\b/gi, replace: "meanie" },
  { re: /\bb+a+s+t+a+r+d+\w*\b/gi, replace: "scoundrel" },
  { re: /\bd+a+m+n+\w*\b/gi, replace: "darn" },
];

/**
 * Final scrub of model-generated, user-facing text. In Safe Mode we soften
 * mild profanity so a stray token never reaches the page.
 */
export function sanitizeOutput(
  text: string | undefined,
  safeMode: boolean,
): string | undefined {
  if (!text) return text;
  if (!safeMode) return text;
  let out = text;
  for (const { re, replace } of PROFANITY) out = out.replace(re, replace);
  return out;
}
