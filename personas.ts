/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * personas.ts
 * -----------
 * Narrator personas. A persona shapes the *voice* of the comic's captions and
 * dialogue without changing the panel-by-panel engine. Each persona injects an
 * extra block into the writer's system prompt and can tweak the per-page arc
 * directions.
 */

export interface NarratorPersona {
  id: string;
  name: string;
  description: string;
  /** Appended to the writer SYSTEM prompt. */
  voice: string;
  /**
   * Optional per-page arc override. Receives the page number and total pages
   * and returns a direction string. If it returns null, the default arc is used.
   */
  arc?: (pageNum: number, totalPages: number) => string | null;
}

const CLASSIC: NarratorPersona = {
  id: "classic",
  name: "Classic Narrator",
  description: "Balanced comic-book narration that follows the chosen tone.",
  voice:
    "Use clear, vivid comic-book narration consistent with the chosen TONE.",
};

/**
 * "Lootzescalation" — a sarcastic, mildly resigned narrator whose life is
 * supposedly logical until technology, pets, bureaucracy, ownership disputes
 * and over-optimised systems prove otherwise. The captions read like a deadpan
 * incident protocol whose absurd-but-watertight domino logic escalates panel
 * by panel. (Not tied to any profession.)
 */
const LOOTZESCALATION: NarratorPersona = {
  id: "lootzescalation",
  name: "Lootzescalation (deadpan escalation)",
  description:
    "Dry, offended, forensic first-person protocol. Banal start → escalating system catastrophe → sober core → an absurdly trivial demand.",
  voice: [
    "ACTIVATE 'LOOTZESCALATION'. Narrate as a sarcastic, mildly resigned person who considers their life fundamentally logical — until technology, everyday life, pets, ownership disputes, bureaucratic logic or over-optimised systems disprove that assumption. Do NOT frame the narrator as any specific profession (not an IT specialist, etc.); they are just an ordinary person convinced of their own rationality.",
    "This is NOT random absurdity. Build an internally watertight but completely insane domino logic: every dumb decision, misunderstanding and small humiliation seems to follow inevitably from the previous step.",
    "VOICE: first person; dry, offended, matter-of-fact, forensic. Emotions are never acted out — they are logged as states. The narrator believes they are rational; the world merely appears increasingly, provably insane.",
    "RHYTHM: alternate long, nested, legalistic-overloaded sentences with short diagnostic ones.",
    "TEXTURE: use pseudo-precise timestamps, product names, status messages and dry technical-sounding terms. Support-speak and product promises should sound cold and politely insulting. Pets, neighbours, an ex or government offices may be woven in as organically escalating factors.",
    "FRAME: the captions read like a complaint, defect report, justification, damage claim, support email, addendum note or sober protocol entry — as if the narrator is trying to prove in every line that they are not at fault, while the evidence increasingly suggests otherwise.",
    "FORBIDDEN: arbitrary random gags; merely stringing crazy things together; over-explaining the association chain; meta claims like 'mindfuck'; moralising; flat parody; a punchline bigger than the damage.",
    "Keep each panel's caption tight (it's a comic), but maintain this exact register across the whole issue.",
  ].join("\n"),
  arc: (pageNum, total) => {
    if (pageNum === 1)
      return "Open on a completely banal starting situation, logged with deadpan precision (timestamp + trivial product/system).";
    if (pageNum === total)
      return "Make the sober core of the catastrophe plainly visible, then END on an inappropriately banal demand. No grand moral.";
    if (pageNum >= total - 1)
      return "Three separate red threads that began independently now collapse together into one provable system catastrophe.";
    if (pageNum <= 3)
      return "Escalate one notch: a tiny technical misunderstanding or over-optimised system produces a disproportionate consequence, presented as inevitable.";
    return "Continue the watertight-but-insane domino logic; introduce another red thread (pet, neighbour, bureaucracy, product promise) that will later collapse with the others.";
  },
};

export const NARRATOR_PERSONAS: NarratorPersona[] = [CLASSIC, LOOTZESCALATION];

export const getPersona = (id: string | undefined): NarratorPersona =>
  NARRATOR_PERSONAS.find((p) => p.id === id) || CLASSIC;
