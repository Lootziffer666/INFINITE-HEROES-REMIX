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
  // ---- GM / persistent character-sheet fields ----
  /** Real-life player controlling this character (GM mode). */
  player?: string;
  /** Lifecycle state — drives permadeath & "true story" continuity. */
  status?: CharacterStatus;
  /** Free-form, evolving character-sheet notes (inventory, arc, etc.). */
  notes?: string;
  /** Optional level / milestone marker for progression flavour. */
  level?: number;
}

export type CharacterStatus = "alive" | "fallen" | "retired";

export const STATUS_LABELS: Record<CharacterStatus, string> = {
  alive: "Alive",
  fallen: "Fallen",
  retired: "Retired",
};

export const isPlayable = (c: Character): boolean =>
  (c.status ?? "alive") === "alive";

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
// PROVIDER CONFIG (multi-LLM: Gemini / OpenAI / OpenAI-compatible / local)
// ---------------------------------------------------------------------------
export type TextProvider = "gemini" | "openai" | "local";

export const TEXT_PROVIDER_LABELS: Record<TextProvider, string> = {
  gemini: "Gemini (Cloud)",
  openai: "OpenAI / Compatible",
  local: "Local LLM (Private)",
};

export interface ProviderConfig {
  /** Which engine writes the story text. Images always use Gemini. */
  textProvider: TextProvider;
  /** OpenAI-compatible base URL for the LOCAL endpoint (e.g. Ollama). */
  localBaseUrl: string;
  /** Local model name, e.g. "llama3.1" or "mistral". */
  localModel: string;
  /** OpenAI / OpenAI-compatible cloud base URL. */
  openaiBaseUrl: string;
  /** API key for the OpenAI-compatible cloud provider. */
  openaiApiKey: string;
  /** Cloud model name, e.g. "gpt-4o-mini", "gpt-4o", or an OpenRouter slug. */
  openaiModel: string;
}

export const defaultProvider = (): ProviderConfig => ({
  textProvider: "gemini",
  localBaseUrl: "http://localhost:11434/v1",
  localModel: "llama3.1",
  openaiBaseUrl: "https://api.openai.com/v1",
  openaiApiKey: "",
  openaiModel: "gpt-4o-mini",
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
  /** Narrator persona id (see personas.ts), e.g. "classic" or "lootzescalation". */
  persona?: string;
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
  /** If set, this issue dramatizes a real GM campaign (the "true story"). */
  sourceCampaignId?: string;
}

// ---------------------------------------------------------------------------
// GM MODE: CAMPAIGNS (prep + real-session outcomes)
// ---------------------------------------------------------------------------
export type SceneStatus = "planned" | "played";

export interface CampaignScene {
  id: string;
  title: string;
  /** The GM's plan for this scene (what they intend to happen). */
  plan: string;
  /** NPCs / cast involved, by name. */
  npcs: string[];
  /** Private GM notes (secrets, twists). Never shown unless revealed. */
  gmNotes?: string;
  /** What ACTUALLY happened at the table — the source of the true story. */
  outcome?: string;
  status: SceneStatus;
}

export type CampaignResult = "ongoing" | "victory" | "defeat" | "mixed";

export const RESULT_LABELS: Record<CampaignResult, string> = {
  ongoing: "Ongoing",
  victory: "Victory",
  defeat: "Defeat / TPK",
  mixed: "Bittersweet",
};

export interface Campaign {
  id: string;
  title: string;
  premise: string;
  scenes: CampaignScene[];
  result: CampaignResult;
  /** The true ending in the GM's words. */
  resultNotes?: string;
  /** Character ids who fell this campaign (drives permadeath). */
  casualties: string[];
  /** Issue ids forged from this campaign. */
  forgedIssueIds: string[];
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// AUDIO (narration + music underscore)
// ---------------------------------------------------------------------------
export type TtsProvider = "off" | "local" | "elevenlabs";
export type MusicProvider = "off" | "ambient" | "lyria";

export interface AudioConfig {
  /** Narration: read captions/dialogue aloud as pages turn. */
  tts: TtsProvider;
  /** Local (Web Speech) voice name, if chosen. */
  localVoice?: string;
  /** ElevenLabs API key (kept only in the local browser store). */
  elevenApiKey?: string;
  /** ElevenLabs voice id. */
  elevenVoiceId?: string;
  /** Background music underscore. */
  music: MusicProvider;
  musicVolume: number; // 0..1
}

export const defaultAudio = (): AudioConfig => ({
  tts: "off",
  music: "off",
  musicVolume: 0.35,
});

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
  // ---- GM mode ----
  /** Run as a Game Master campaign workspace. */
  gmMode?: boolean;
  /** When on, fallen characters stay fallen across the saga. */
  permadeath?: boolean;
  /** Prepared / played campaigns. */
  campaigns?: Campaign[];
  /** Audio preferences for this saga. */
  audio?: AudioConfig;
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
  gmMode?: boolean;
  campaignCount?: number;
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
