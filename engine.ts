/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * engine.ts
 * ---------
 * The generation engine. Pure-ish functions that take an EngineContext and
 * produce story beats, panel art, character portraits, covers and recaps.
 *
 * Consistency is the priority:
 *   - One LOCKED visual style per saga is threaded through every prompt.
 *   - Character portraits are reused as reference images so faces stay stable
 *     across panels AND across issues.
 *   - Prior-issue synopses + in-issue history are injected so the story stays
 *     coherent over a whole multi-issue saga.
 *
 * Safety is layered in via safety.ts (writer/artist guardrails + sanitisation).
 * Text routes through llm.ts (Gemini or a local OpenAI-compatible model).
 * Images always use Gemini.
 */

import { GoogleGenAI } from "@google/genai";
import {
  Beat,
  Campaign,
  Character,
  FaceType,
  LANGUAGES,
  MAX_COVER_HEROES,
  MAX_PANEL_CAST,
  MAX_STORY_PAGES,
  RESULT_LABELS,
  Series,
} from "./types";
import { generateText, extractJson, GEMINI_TEXT_MODEL } from "./llm";
import {
  artistGuardrails,
  sanitizeOutput,
  writerGuardrails,
} from "./safety";
import { getPersona } from "./personas";

const GEMINI_IMAGE_MODEL = "gemini-3-pro-image-preview";

export interface EngineContext {
  series: Series;
  /** Synopsis text of every previous issue, oldest -> newest. */
  priorSynopses: string[];
  /** Issue number currently being generated. */
  issueNumber: number;
  /**
   * GM mode: canonical record of a real campaign this issue must faithfully
   * dramatize (premise, what actually happened scene-by-scene, the result,
   * and who fell). When present, the writer adapts reality instead of
   * inventing freely.
   */
  campaignCanon?: string;
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

export function isAuthError(e: unknown): boolean {
  const msg = String(e);
  // Errors from a non-Gemini provider surface as "LLM HTTP ..." and must NOT
  // be mistaken for a Gemini API-key problem.
  if (msg.includes("LLM HTTP")) return false;
  return (
    msg.includes("Requested entity was not found") ||
    msg.includes("API_KEY_INVALID") ||
    msg.toLowerCase().includes("permission denied") ||
    msg.toLowerCase().includes("api key")
  );
}

function langName(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.name || "English";
}

function getAI(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
}

/** Best-effort MIME sniff from a base64 payload's magic prefix. */
function mimeOf(b64: string): string {
  if (b64.startsWith("/9j/")) return "image/jpeg";
  if (b64.startsWith("iVBOR")) return "image/png";
  if (b64.startsWith("R0lG")) return "image/gif";
  if (b64.startsWith("UklGR")) return "image/webp";
  return "image/jpeg";
}

/**
 * Compile a GM campaign into a canonical "this really happened" briefing the
 * writer must dramatize faithfully (used for true-story issues).
 */
export function buildCampaignCanon(series: Series, campaign: Campaign): string {
  const nameOf = (id: string) =>
    series.cast.find((c) => c.id === id)?.name || "an unnamed hero";
  const lines: string[] = [];
  lines.push(`CAMPAIGN: "${campaign.title}".`);
  if (campaign.premise) lines.push(`PREMISE: ${campaign.premise}`);

  const played = campaign.scenes.filter((s) => s.status === "played");
  const scenes = played.length ? played : campaign.scenes;
  if (scenes.length) {
    lines.push("WHAT HAPPENED, IN ORDER:");
    scenes.forEach((s, i) => {
      const what = s.outcome?.trim() || s.plan?.trim() || s.title;
      const who = s.npcs?.length ? ` (featuring: ${s.npcs.join(", ")})` : "";
      lines.push(`${i + 1}. ${s.title}: ${what}${who}`);
    });
  }
  lines.push(`RESULT: ${RESULT_LABELS[campaign.result]}.`);
  if (campaign.resultNotes) lines.push(`ENDING: ${campaign.resultNotes}`);
  if (campaign.casualties.length) {
    lines.push(
      `HEROES WHO FELL: ${campaign.casualties.map(nameOf).join(", ")}. Give their sacrifice meaning.`,
    );
  }
  return lines.join("\n");
}

function castLine(c: Character): string {
  const stats = c.stats;
  const flavour = c.charClass ? `${c.charClass}` : c.role;
  const bio = c.bio ? ` Personality/backstory: ${c.bio}.` : "";
  return `- ${c.name} (${flavour}, role: ${c.role}). STR ${stats.strength} DEX ${stats.dexterity} CON ${stats.constitution} INT ${stats.intelligence} WIS ${stats.wisdom} CHA ${stats.charisma}.${bio}`;
}

// ---------------------------------------------------------------------------
// CHARACTER PORTRAIT
// ---------------------------------------------------------------------------

/**
 * Generate a clean character-sheet style portrait from a text description,
 * locked to the saga's visual style. Returns base64 (no data: prefix).
 */
export async function generatePortrait(
  ctx: EngineContext,
  description: string,
): Promise<string> {
  const { series } = ctx;
  const safety = artistGuardrails(series.settings.audience, series.safeMode);
  const res = await getAI().models.generateContent({
    model: GEMINI_IMAGE_MODEL,
    contents: {
      text: `STYLE: Masterpiece ${series.settings.style} character sheet, detailed ink, clean neutral background, FULL BODY hero pose. CHARACTER: ${description}. ${safety}`,
    },
    config: { imageConfig: { aspectRatio: "1:1" } },
  });
  const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (part?.inlineData?.data) return part.inlineData.data;
  throw new Error("Portrait generation returned no image");
}

// ---------------------------------------------------------------------------
// STORY BEAT (WRITER)
// ---------------------------------------------------------------------------

export interface BeatRequest {
  history: { pageIndex: number; beat: Beat; resolvedChoice?: string }[];
  pageNum: number;
  isDecisionPage: boolean;
}

export async function generateBeat(
  ctx: EngineContext,
  req: BeatRequest,
): Promise<Beat> {
  const { series, priorSynopses, issueNumber, campaignCanon } = ctx;
  const { history, pageNum, isDecisionPage } = req;
  const lang = langName(series.settings.language);
  const isFinal = pageNum === MAX_STORY_PAGES;
  const persona = getPersona(series.settings.persona);

  const castSheet = series.cast.map(castLine).join("\n");
  const heroNames = series.cast
    .filter((c) => c.role === "hero")
    .map((c) => c.name)
    .join(", ");
  const villainNames = series.cast
    .filter((c) => c.role === "villain")
    .map((c) => c.name)
    .join(", ");

  // Cross-over guests get acknowledged as special guest appearances.
  const guests = series.cast.filter((c) => c.cameoFrom);
  const guestLine = guests.length
    ? `GUEST STARS (cross-over): ${guests
        .map((g) => `${g.name} (from "${g.cameoFrom}")`)
        .join(", ")}. Treat them as special crossover guests; honour their established persona and let the cast react to their presence.`
    : "";

  const historyText = history
    .sort((a, b) => a.pageIndex - b.pageIndex)
    .map(
      (h) =>
        `[Page ${h.pageIndex}] (Caption: "${h.beat.caption || ""}") (Dialogue: "${h.beat.dialogue || ""}") (Scene: ${h.beat.scene})${h.resolvedChoice ? ` -> READER CHOSE: "${h.resolvedChoice}"` : ""}`,
    )
    .join("\n");

  // ----- Party spotlight balancing -----
  // Count how often each hero has appeared so far so we can nudge the writer
  // to give the whole party (not just the first two) coherent screen time.
  const heroList = series.cast.filter((c) => c.role === "hero");
  const isParty = heroList.length >= 3;
  let partyBlock = "";
  if (isParty) {
    const appears = (name: string) =>
      history.filter(
        (h) =>
          (h.beat.present || []).some((n) => n.toLowerCase() === name.toLowerCase()) ||
          (h.beat.scene || "").toLowerCase().includes(name.toLowerCase()),
      ).length;
    const counts = heroList.map((h) => ({ name: h.name, n: appears(h.name) }));
    const min = Math.min(...counts.map((c) => c.n));
    const underused = counts.filter((c) => c.n === min).map((c) => c.name);
    partyBlock =
      `PARTY (${heroList.length} heroes — this is a full adventuring group, NOT a duo): ${heroList.map((h) => h.name).join(", ")}.\n` +
      `PARTY HANDLING: Over the whole issue, give EVERY hero meaningful moments and in-character beats. In a single panel usually feature 1-3 characters for clarity; reserve the full group for establishing shots, the climax, and big team moments. Keep each hero visually and personality-distinct.` +
      (history.length > 0
        ? `\nSPOTLIGHT BALANCE: these heroes have had the least screen time so far — favour them on this page: ${underused.join(", ")}.`
        : "");
  }

  const continuity =
    priorSynopses.length > 0
      ? `THE STORY SO FAR (previous issues — honour this canon):\n${priorSynopses
          .map((s, i) => `Issue #${i + 1}: ${s}`)
          .join("\n")}`
      : "This is the very first issue. Establish the world and the cast.";

  let arc = "";
  if (isFinal) {
    arc = campaignCanon
      ? "FINAL PAGE. Land the campaign's REAL ending exactly as recorded (victory, defeat, or bittersweet). Honour any heroes who fell. End with a heartfelt closing caption."
      : "FINAL PAGE. Resolve this issue's main conflict in a satisfying way, then plant ONE hook for the next issue. End the text with 'TO BE CONTINUED...' (or a localised equivalent).";
  } else if (isDecisionPage) {
    arc =
      "End on a meaningful CHOICE about values, relationships, or risk (e.g. Truth vs. Safety, Help a stranger vs. Stay on mission). The two options must be character-driven, not 'go left / go right'.";
  } else if (pageNum === 1) {
    arc =
      "INCITING INCIDENT. Open in the established world and disrupt the status quo with a clear call to adventure.";
  } else if (pageNum <= 4) {
    arc =
      "RISING ACTION. The party engages the new situation. Spotlight character dynamics and teamwork.";
  } else if (pageNum <= 8) {
    arc =
      "COMPLICATION. A twist — a secret, a setback, or a rising threat. Raise the stakes appropriately for the tone.";
  } else {
    arc = "CLIMAX. The confrontation. Pay off the issue's central question.";
  }

  // A narrator persona may override the per-page arc (except on branching
  // decision pages and faithful campaign retellings).
  if (!campaignCanon && !isDecisionPage && persona.arc) {
    const pa = persona.arc(pageNum, MAX_STORY_PAGES);
    if (pa) arc = pa;
  }

  const capLimit = series.settings.novelMode
    ? "max 38 words, rich narration or inner monologue"
    : "max 16 words";
  const diaLimit = series.settings.novelMode
    ? "max 32 words, character-driven speech"
    : "max 14 words";

  const system = [
    "You are a master comic-book writer scripting one panel at a time for an ongoing saga.",
    `NARRATOR PERSONA — ${persona.name}: ${persona.voice}`,
    writerGuardrails(series.settings.audience, series.safeMode),
  ].join("\n");

  const trueStoryBlock = campaignCanon
    ? `
TRUE STORY MODE (GM CAMPAIGN — THIS REALLY HAPPENED AT THE TABLE):
${campaignCanon}
You MUST dramatize these real events faithfully across the ${MAX_STORY_PAGES} pages, in order, without contradicting them or inventing a different outcome. This page (${pageNum}/${MAX_STORY_PAGES}) should cover the corresponding part of that timeline. Treat fallen heroes' fates with weight appropriate to the audience.
`
    : "";

  const prompt = `
SAGA: "${series.title}" — Issue #${issueNumber}, Page ${pageNum} of ${MAX_STORY_PAGES}.
VISUAL STYLE (locked): ${series.settings.style}. SETTING: ${series.settings.setting}. TONE: ${series.settings.tone}. AUDIENCE: ${series.settings.audience}.
OUTPUT LANGUAGE for caption/dialogue/choices: ${lang.toUpperCase()} (the "scene" field stays ENGLISH for the artist).

CAST:
${castSheet}
HEROES: ${heroNames || "(none yet)"} | VILLAINS: ${villainNames || "(none yet)"}
${partyBlock}
${guestLine}
${continuity}
${trueStoryBlock}
PANELS SO FAR THIS ISSUE:
${historyText || "(none — this is the opening panel)"}

DIRECTION: ${arc}

RULES:
1. NO repetition of earlier captions/dialogue.
2. Use character NAMES, never "the hero" / "the villain".
3. Vary shot types page to page (wide, close-up, reaction, action).
4. Keep the cast consistent with their personalities and the canon above.
5. The "scene" must name every character physically present so the artist can draw them.
6. Don't crowd a panel: only put characters in "present" who genuinely belong in this shot (usually 1-3), and make sure "present" exactly matches who you describe in "scene".

Return STRICT JSON only (no markdown):
{
  "caption": "narrator text in ${lang} (${capLimit})",
  "dialogue": "one line of speech in ${lang} (${diaLimit}); optional",
  "speaker": "name of the speaking character, or empty",
  "scene": "vivid ENGLISH visual description naming who is present and what they do",
  "present": ["names of cast members visible in this panel"],
  "choices": ${isDecisionPage && !isFinal ? `["option A in ${lang}", "option B in ${lang}"]` : "[]"}
}`;

  try {
    const raw = await generateText(
      { system, prompt, json: true },
      series.provider,
    );
    const parsed = JSON.parse(extractJson(raw)) as Beat & {
      present?: string[];
    };

    if (parsed.dialogue) {
      parsed.dialogue = parsed.dialogue
        .replace(/^[\w\s\-]+:\s*/i, "")
        .replace(/["']/g, "")
        .trim();
    }
    if (parsed.caption) parsed.caption = parsed.caption.replace(/^[\w\s\-]+:\s*/i, "").trim();

    parsed.caption = sanitizeOutput(parsed.caption, series.safeMode);
    parsed.dialogue = sanitizeOutput(parsed.dialogue, series.safeMode);

    if (!isDecisionPage || isFinal) parsed.choices = [];
    else if (!parsed.choices || parsed.choices.length < 2)
      parsed.choices = ["Stand and fight", "Find another way"];

    if (!Array.isArray(parsed.present)) parsed.present = [];
    if (!parsed.scene) parsed.scene = `A ${series.settings.style} scene in ${series.settings.setting}.`;

    return parsed as Beat;
  } catch (e) {
    if (isAuthError(e)) throw e;
    console.error("Beat generation failed", e);
    return {
      caption: pageNum === 1 ? "The adventure begins..." : "...",
      scene: `A ${series.settings.style} scene featuring ${heroNames} in ${series.settings.setting}.`,
      present: series.cast.filter((c) => c.role === "hero").map((c) => c.name),
      choices: [],
    };
  }
}

// ---------------------------------------------------------------------------
// PANEL ART (ARTIST)
// ---------------------------------------------------------------------------

/**
 * Map the beat's "present" names back to cast members (case-insensitive),
 * always including at least the heroes so the page isn't empty. Returned in
 * stable cast order so the artist gets consistent REFERENCE labels panel to
 * panel (this is key to keeping a big party visually coherent).
 */
function presentCast(series: Series, beat: Beat): Character[] {
  const names = (beat.present || []).map((n) => n.toLowerCase());
  let present = series.cast.filter((c) => names.includes(c.name.toLowerCase()));
  if (present.length === 0) {
    const scene = (beat.scene || "").toLowerCase();
    present = series.cast.filter((c) => scene.includes(c.name.toLowerCase()));
  }
  if (present.length === 0) {
    present = series.cast.filter((c) => c.role === "hero").slice(0, 1);
  }
  // Stable cast order, then cap. Up to MAX_PANEL_CAST characters can share a
  // panel cleanly; beyond that the art (and the model) gets muddy.
  const order = new Map(series.cast.map((c, i) => [c.id, i]));
  return present
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .slice(0, MAX_PANEL_CAST);
}

/** Choose which cast members to reference for a given face type. */
function imageCast(series: Series, beat: Beat, type: FaceType): Character[] {
  const heroes = series.cast.filter((c) => c.role === "hero");
  const villains = series.cast.filter((c) => c.role === "villain");
  if (type === "story") return presentCast(series, beat);
  // Covers & recaps are full-party group shots: the WHOLE team (room for an
  // optional GM character) plus the lead villain, capped so art stays coherent.
  if (type === "cover") return [...heroes.slice(0, MAX_COVER_HEROES), ...villains.slice(0, 1)];
  if (type === "recap") return heroes.slice(0, MAX_COVER_HEROES);
  return [...heroes.slice(0, 3), ...villains.slice(0, 1)];
}

/**
 * A text "manifest" tying each REFERENCE number to a name + short look, so the
 * model anchors identity on words AND image (not image alone). This is what
 * stops a 5-6 person party from blending into each other.
 */
function castManifest(cast: Character[]): string {
  return cast
    .map((c, i) => {
      const look = c.description ? `, ${c.description}` : "";
      const role = c.charClass || c.role;
      return `REFERENCE ${i + 1} = ${c.name} (${role})${look}`;
    })
    .join("; ");
}

export async function generatePanelImage(
  ctx: EngineContext,
  beat: Beat,
  type: FaceType,
): Promise<string> {
  const { series } = ctx;
  const style = series.settings.style;
  const safety = artistGuardrails(series.settings.audience, series.safeMode);
  const contents: any[] = [];

  const cast = imageCast(series, beat, type).filter((c) => c.portrait);
  cast.forEach((c, i) => {
    contents.push({ text: `REFERENCE ${i + 1} [${c.name}]:` });
    contents.push({ inlineData: { mimeType: mimeOf(c.portrait), data: c.portrait } });
  });
  const manifest = castManifest(cast);
  const distinctRule =
    cast.length > 1
      ? `CAST (match each person to their REFERENCE by number; keep every character VISUALLY DISTINCT — do NOT merge, swap, duplicate or blend faces/outfits): ${manifest}. `
      : cast.length === 1
        ? `CAST: ${manifest}. Maintain STRICT likeness to the reference. `
        : "";

  let promptText = `STYLE: ${style} comic book art, detailed ink, vibrant colors, dynamic composition. ${safety} ${distinctRule}`;

  if (type === "cover") {
    promptText += `TYPE: Comic book COVER for "${series.title}" Issue #${ctx.issueNumber}. Bold title lettering reading "${series.title.toUpperCase()}". A heroic FULL-PARTY group shot showing the entire team together (${cast.map((c) => c.name).join(", ")}), each clearly recognizable from their reference.`;
  } else if (type === "recap") {
    promptText += `TYPE: "Previously..." recap splash page. A montage of the whole party's journey so far; show each hero recognizably.`;
  } else if (type === "back_cover") {
    promptText += `TYPE: Comic BACK COVER. Full-page dramatic teaser for the next issue. Text: "NEXT ISSUE SOON".`;
  } else {
    promptText += `TYPE: Single vertical comic panel. SCENE: ${beat.scene}. `;
    if (beat.caption) promptText += `INCLUDE a caption box reading: "${beat.caption}". `;
    if (beat.dialogue)
      promptText += `INCLUDE a speech bubble${beat.speaker ? ` from ${beat.speaker}` : ""} reading: "${beat.dialogue}". `;
  }

  contents.push({ text: promptText });

  const res = await getAI().models.generateContent({
    model: GEMINI_IMAGE_MODEL,
    contents,
    config: { imageConfig: { aspectRatio: "2:3" } },
  });
  const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  return part?.inlineData?.data
    ? `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
    : "";
}

// ---------------------------------------------------------------------------
// SYNOPSIS (for cross-issue continuity / "Previously on")
// ---------------------------------------------------------------------------

/**
 * Summarise a finished issue into a few sentences of canon, used to seed the
 * next issue and to render the recap page.
 */
export async function summarizeIssue(
  ctx: EngineContext,
  beats: { pageIndex: number; beat: Beat; resolvedChoice?: string }[],
): Promise<string> {
  const { series } = ctx;
  const lang = langName(series.settings.language);
  const body = beats
    .sort((a, b) => a.pageIndex - b.pageIndex)
    .map(
      (b) =>
        `${b.beat.caption || ""} ${b.beat.dialogue || ""} (${b.beat.scene})${b.resolvedChoice ? ` [chose: ${b.resolvedChoice}]` : ""}`,
    )
    .join("\n");

  const system = `You summarise comic issues into tight canon recaps. ${writerGuardrails(series.settings.audience, series.safeMode)}`;
  const prompt = `Summarise this issue of "${series.title}" in 2-3 sentences in ${lang}. Name the characters and capture the key events, choices, and the cliffhanger. Plain prose, no preamble.\n\n${body}`;

  try {
    const raw = await generateText({ system, prompt }, series.provider);
    return sanitizeOutput(raw.trim(), series.safeMode) || "";
  } catch (e) {
    if (isAuthError(e)) throw e;
    return "";
  }
}
