/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// ---------------------------------------------------------------------------
// PAGE / PACING CONSTANTS
// ---------------------------------------------------------------------------
export const MAX_STORY_PAGES = 10;
export const BACK_COVER_PAGE = 11;
export const TOTAL_PAGES = 11;
export const INITIAL_PAGES = 2;
export const GATE_PAGE = 2;
export const BATCH_SIZE = 6;
export const DECISION_PAGES = [3, 7];

// ---------------------------------------------------------------------------
// CREATIVE PRESETS
// ---------------------------------------------------------------------------
export const STYLE_PRESETS = [
  "Classic Comic",
  "Modern American",
  "Saturday Morning Cartoon",
  "90s Anime",
  "Watercolor Storybook",
  "High Fantasy Painting",
  "Neon Cyberpunk",
  "Pixel Art",
];

export const TONES = [
  "ACTION-HEAVY (Short, punchy dialogue. Focus on kinetics.)",
  "INNER-MONOLOGUE (Heavy captions revealing thoughts.)",
  "QUIPPY (Characters use humor as a defense mechanism.)",
  "OPERATIC (Grand, dramatic declarations and high stakes.)",
  "CASUAL (Natural dialogue, focus on relationships/banter.)",
  "WHOLESOME (Warm, gentle, optimistic.)",
  "HEROIC QUEST (Epic D&D-style adventure narration.)",
];

export const LANGUAGES = [
  { code: "en-US", name: "English (US)" },
  { code: "ar-EG", name: "Arabic (Egypt)" },
  { code: "de-DE", name: "German (Germany)" },
  { code: "es-MX", name: "Spanish (Mexico)" },
  { code: "fr-FR", name: "French (France)" },
  { code: "hi-IN", name: "Hindi (India)" },
  { code: "id-ID", name: "Indonesian (Indonesia)" },
  { code: "it-IT", name: "Italian (Italy)" },
  { code: "ja-JP", name: "Japanese (Japan)" },
  { code: "ko-KR", name: "Korean (South Korea)" },
  { code: "pt-BR", name: "Portuguese (Brazil)" },
  { code: "ru-RU", name: "Russian (Russia)" },
  { code: "uk-UA", name: "Ukrainian (Ukraine)" },
  { code: "vi-VN", name: "Vietnamese (Vietnam)" },
  { code: "zh-CN", name: "Chinese (China)" },
];

// D&D-style classes (used as creative flavour, not mechanics)
export const CHARACTER_CLASSES = [
  "Adventurer",
  "Fighter",
  "Wizard",
  "Rogue",
  "Cleric",
  "Ranger",
  "Bard",
  "Paladin",
  "Druid",
  "Barbarian",
  "Monk",
  "Sorcerer",
  "Warlock",
];

// ---------------------------------------------------------------------------
// AUDIENCE / SAFETY
// ---------------------------------------------------------------------------
export type Audience = "kids" | "teen" | "mature";

export const AUDIENCE_LABELS: Record<Audience, string> = {
  kids: "Kids (all ages)",
  teen: "Teen (PG-13)",
  mature: "Mature (16+)",
};

// ---------------------------------------------------------------------------
// CHARACTERS (PARTY ROSTER)
// ---------------------------------------------------------------------------
export type CharacterRole = "hero" | "ally" | "villain";

export const ROLE_LABELS: Record<CharacterRole, string> = {
  hero: "Hero",
  ally: "Ally / Sidekick",
  villain: "Villain",
};

// Classic D&D ability scores (1-20 scale, ~10 = average mortal).
export interface CharacterStats {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}

export const STAT_KEYS: (keyof CharacterStats)[] = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
];

export const STAT_ABBR: Record<keyof CharacterStats, string> = {
  strength: "STR",
  dexterity: "DEX",
  constitution: "CON",
  intelligence: "INT",
  wisdom: "WIS",
  charisma: "CHA",
};

export const defaultStats = (): CharacterStats => ({
  strength: 10,
  dexterity: 10,
  constitution: 10,
  intelligence: 10,
  wisdom: 10,
  charisma: 10,
});

export interface Character {
  id: string;
  role: CharacterRole;
  name: string;
  /** Base64 reference portrait (no data: prefix). */
  portrait: string;
  /** Short visual description handed to the artist model (English). */
  description: string;
  /** Optional backstory / personality handed to the writer model. */
  bio?: string;
  /** D&D-flavoured class. */
  charClass?: string;
  stats: CharacterStats;
}

// ---------------------------------------------------------------------------
// STORY BEATS / PAGES
// ---------------------------------------------------------------------------
export type FaceType = "cover" | "recap" | "story" | "back_cover";

export interface Beat {
  caption?: string;
  dialogue?: string;
  /** Name of the speaking character (if any). */
  speaker?: string;
  /** Vivid visual description, always English, for the artist model. */
  scene: string;
  /** Names of cast members present in this panel (drives image references). */
  present?: string[];
  choices: string[];
}

export interface ComicFace {
  id: string;
  type: FaceType;
  imageUrl?: string;
  narrative?: Beat;
  choices: string[];
  resolvedChoice?: string;
  isLoading: boolean;
  /** Position of this face within the flipbook (0-based book order). */
  pageIndex?: number;
  /** For story faces only: the story-beat number (1..MAX_STORY_PAGES). */
  beatNum?: number;
  isDecisionPage?: boolean;
  /** Static text rendered for recap pages (no AI image text). */
  recapText?: string;
  error?: boolean;
}

// ---------------------------------------------------------------------------
// PROVIDER CONFIG (cloud vs local LLM)
// ---------------------------------------------------------------------------
export type TextProvider = "gemini" | "local";

export interface ProviderConfig {
  /** Which engine writes the story text. Images always use Gemini. */
  textProvider: TextProvider;
  /** OpenAI-compatible base URL, e.g. http://localhost:11434/v1 (Ollama). */
  localBaseUrl: string;
  /** Local model name, e.g. "llama3.1" or "mistral". */
  localModel: string;
}

export const defaultProvider = (): ProviderConfig => ({
  textProvider: "gemini",
  localBaseUrl: "http://localhost:11434/v1",
  localModel: "llama3.1",
});

// ---------------------------------------------------------------------------
// SERIES + ISSUES (the multi-issue saga)
// ---------------------------------------------------------------------------
export interface SeriesSettings {
  /** Locked visual style for the whole saga (keeps issues consistent). */
  style: string;
  setting: string;
  audience: Audience;
  language: string;
  tone: string;
  novelMode: boolean;
}

export type IssueStatus = "generating" | "reading" | "complete";

export interface Issue {
  id: string;
  number: number;
  title: string;
  /** One-line teaser shown in the library. */
  logline?: string;
  /** Auto-written recap of what happened, fed into the next issue. */
  synopsis?: string;
  faces: ComicFace[];
  choiceLog: { page: number; choice: string }[];
  status: IssueStatus;
  createdAt: number;
  updatedAt: number;
}

export interface Series {
  id: string;
  title: string;
  cast: Character[];
  settings: SeriesSettings;
  safeMode: boolean;
  provider: ProviderConfig;
  issues: Issue[];
  createdAt: number;
  updatedAt: number;
}

// Lightweight summary used by the library grid (no heavy image payloads).
export interface SeriesSummary {
  id: string;
  title: string;
  coverUrl?: string;
  issueCount: number;
  castCount: number;
  style: string;
  safeMode: boolean;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
export const uid = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const heroes = (s: Series): Character[] =>
  s.cast.filter((c) => c.role === "hero");
export const allies = (s: Series): Character[] =>
  s.cast.filter((c) => c.role === "ally");
export const villains = (s: Series): Character[] =>
  s.cast.filter((c) => c.role === "villain");
