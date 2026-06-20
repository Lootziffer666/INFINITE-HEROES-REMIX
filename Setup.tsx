/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import {
  AUDIENCE_LABELS,
  Audience,
  AudioConfig,
  Character,
  CharacterRole,
  CHARACTER_CLASSES,
  defaultAudio,
  defaultStats,
  LANGUAGES,
  MusicProvider,
  ROLE_LABELS,
  Series,
  STAT_ABBR,
  STAT_KEYS,
  STYLE_PRESETS,
  TEXT_PROVIDER_LABELS,
  TextProvider,
  TONES,
  TtsProvider,
  uid,
} from "./types";
import { moderateFields } from "./safety";
import { pingProvider } from "./llm";
import { NARRATOR_PERSONAS } from "./personas";
import { exportCameo, exportCrossover, readCameoFile, sanitizeGuest } from "./cameo";

interface SetupProps {
  series: Series;
  isTransitioning: boolean;
  onChange: (s: Series) => void;
  onGeneratePortrait: (description: string) => Promise<string | null>;
  onLaunch: () => void;
  onBack: () => void;
  /** Other saved sagas available to cross over from. */
  crossoverSources: { id: string; title: string }[];
  /** Load the full cast of another saga for cross-over import. */
  loadCrossoverCast: (id: string) => Promise<Character[]>;
}

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const blankChar = (role: CharacterRole): Character => ({
  id: uid(),
  role,
  name: "",
  portrait: "",
  description: "",
  bio: "",
  charClass: "Adventurer",
  stats: defaultStats(),
});

export const Setup: React.FC<SetupProps> = (props) => {
  const { series } = props;
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [draft, setDraft] = useState<Character | null>(null);
  const [busyPortrait, setBusyPortrait] = useState(false);
  const [pingMsg, setPingMsg] = useState<string>("");
  const [pinging, setPinging] = useState(false);
  const [xover, setXover] = useState<{ sourceId: string; cast: Character[]; selected: string[]; loading: boolean } | null>(null);

  const set = (patch: Partial<Series>) => props.onChange({ ...series, ...patch });
  const setSettings = (patch: Partial<Series["settings"]>) =>
    set({ settings: { ...series.settings, ...patch } });
  const audio: AudioConfig = series.audio ?? defaultAudio();
  const setAudio = (patch: Partial<AudioConfig>) => set({ audio: { ...audio, ...patch } });

  // ---- cast helpers ----
  const upsertChar = (c: Character) => {
    const exists = series.cast.some((x) => x.id === c.id);
    set({ cast: exists ? series.cast.map((x) => (x.id === c.id ? c : x)) : [...series.cast, c] });
  };
  const removeChar = (id: string) => set({ cast: series.cast.filter((c) => c.id !== id) });

  const saveDraft = () => {
    if (!draft) return;
    if (!draft.portrait) {
      alert("Add a photo or generate a portrait first.");
      return;
    }
    const mod = moderateFields([draft.name, draft.bio, draft.description], series.safeMode);
    if (mod.level === "block") {
      alert(mod.message);
      return;
    }
    upsertChar({ ...draft, name: draft.name.trim() || ROLE_LABELS[draft.role] });
    if (mod.level === "warn" && mod.message) alert(mod.message);
    setDraft(null);
  };

  const onUpload = async (file: File) => {
    try {
      const b64 = await fileToBase64(file);
      setDraft((d) => (d ? { ...d, portrait: b64 } : d));
    } catch {
      alert("Could not read that image.");
    }
  };

  // Import a cameo card or crossover pack from a file. A single character opens
  // in the editor for review; a pack of several is added straight to the cast.
  const addGuests = (chars: Character[]) => {
    const blocked = chars.some(
      (c) => moderateFields([c.name, c.bio, c.description], series.safeMode).level === "block",
    );
    if (blocked) {
      alert("One or more characters contain content that isn't allowed here (Safe Mode).");
      return;
    }
    if (chars.length === 1) {
      setDraft(chars[0]);
      return;
    }
    set({ cast: [...series.cast, ...chars] });
    alert(`Added ${chars.length} guest characters to your saga.`);
  };

  const importCameo = async (file: File) => {
    try {
      const chars = await readCameoFile(file);
      addGuests(chars);
    } catch (e: any) {
      alert(e?.message || "Could not import this file.");
    }
  };

  // ----- Cross-over: pull characters straight from another saved saga -----
  const openCrossover = () => {
    if (props.crossoverSources.length === 0) {
      alert("No other sagas to cross over from yet. Create another saga first, or import a cameo file.");
      return;
    }
    setXover({ sourceId: "", cast: [], selected: [], loading: false });
  };

  const pickSource = async (id: string) => {
    setXover((x) => (x ? { ...x, sourceId: id, loading: true, cast: [], selected: [] } : x));
    try {
      const cast = await props.loadCrossoverCast(id);
      setXover((x) => (x ? { ...x, cast, loading: false } : x));
    } catch {
      setXover((x) => (x ? { ...x, loading: false } : x));
      alert("Could not load that saga's cast.");
    }
  };

  const toggleXover = (id: string) =>
    setXover((x) =>
      x ? { ...x, selected: x.selected.includes(id) ? x.selected.filter((i) => i !== id) : [...x.selected, id] } : x,
    );

  const confirmCrossover = () => {
    if (!xover) return;
    const source = props.crossoverSources.find((s) => s.id === xover.sourceId);
    const chosen = xover.cast.filter((c) => xover.selected.includes(c.id));
    if (chosen.length === 0) return;
    const guests = chosen.map((c) => sanitizeGuest(c, source?.title));
    const blocked = guests.some(
      (g) => moderateFields([g.name, g.bio, g.description], series.safeMode).level === "block",
    );
    if (blocked) {
      alert("Some of those characters can't be brought in while Safe Mode is on.");
      return;
    }
    set({ cast: [...series.cast, ...guests] });
    setXover(null);
  };

  const genPortrait = async () => {
    if (!draft) return;
    if (!draft.description.trim()) {
      alert("Describe the character first (e.g. 'a brave young knight with red hair').");
      return;
    }
    const mod = moderateFields([draft.description], series.safeMode);
    if (mod.level === "block") {
      alert(mod.message);
      return;
    }
    setBusyPortrait(true);
    const b64 = await props.onGeneratePortrait(draft.description);
    setBusyPortrait(false);
    if (b64) setDraft({ ...draft, portrait: b64 });
  };

  const launch = () => {
    const mod = moderateFields([series.title, series.settings.style, series.settings.setting], series.safeMode);
    if (mod.level === "block") {
      alert(mod.message);
      return;
    }
    props.onLaunch();
  };

  const testProvider = async () => {
    setPinging(true);
    setPingMsg("Checking...");
    const r = await pingProvider(series.provider);
    setPingMsg(r.detail);
    setPinging(false);
  };

  const heroCount = series.cast.filter((c) => c.role === "hero").length;

  return (
    <div className="fixed inset-0 z-[200] overflow-y-auto bg-black/85 backdrop-blur-md"
      style={{
        animation: props.isTransitioning ? "knockout-exit 1s forwards cubic-bezier(.6,-0.28,.74,.05)" : "none",
        pointerEvents: props.isTransitioning ? "none" : "auto",
      }}>
      <style>{`
        @keyframes knockout-exit { 0%{transform:scale(1)} 15%{transform:scale(1.08) rotate(-3deg)} 100%{transform:translateY(-200vh) rotate(720deg) scale(.5);opacity:0} }
        .stat-slider{-webkit-appearance:none;width:100%;height:10px;background:#e2e8f0;outline:none;border:2px solid black;border-radius:2px}
        .stat-slider::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;background:#facc15;cursor:pointer;border:3px solid black;border-radius:2px}
      `}</style>

      <div className="min-h-full flex items-start justify-center p-4 py-8">
        <div className="max-w-[760px] w-full bg-white p-6 border-[6px] border-black shadow-[12px_12px_0px_rgba(0,0,0,0.6)] relative">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={props.onBack} className="comic-btn bg-gray-200 px-3 py-1 text-sm">← Library</button>
            <div className="text-center">
              <h1 className="font-comic text-4xl text-amber-400 inline-block mr-2" style={{ textShadow: "2px 2px 0 black" }}>THE BARD&apos;S</h1>
              <h1 className="font-comic text-4xl text-red-600 inline-block" style={{ textShadow: "2px 2px 0 black" }}>SONG</h1>
            </div>
            <div className={`px-3 py-1 border-2 border-black font-comic text-sm ${series.safeMode ? "bg-green-300" : "bg-orange-300"}`}>
              {series.safeMode ? "SAFE MODE ON" : "SAFE MODE OFF"}
            </div>
          </div>

          {/* Steps nav */}
          <div className="flex justify-center gap-2 mb-6">
            {[[1, "1. PARTY"], [2, "2. WORLD"], [3, "3. ENGINE & SAFETY"]].map(([n, label]) => (
              <button key={n as number} onClick={() => setStep(n as 1 | 2 | 3)}
                className={`font-comic border-2 border-black px-3 py-1 ${step === n ? "bg-black text-white" : "bg-gray-200"}`}>
                {label as string}
              </button>
            ))}
          </div>

          {/* STEP 1: PARTY ROSTER */}
          {step === 1 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-comic text-2xl uppercase">Your Party</h2>
                <div className="flex items-center gap-2">
                  {series.cast.length > 0 && (
                    <button onClick={() => exportCrossover(series.cast, series.title)} title="Export the whole party as a crossover pack"
                      className="comic-btn bg-fuchsia-300 text-black px-2 py-1 text-xs">⤓ Export Party</button>
                  )}
                  <p className="text-sm text-gray-600 font-sans hidden sm:block">A whole D&amp;D group — add or cross over every hero.</p>
                </div>
              </div>

              {/* Roster grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                {series.cast.map((c) => (
                  <div key={c.id} className="border-4 border-black p-2 bg-gray-50 relative">
                    <img src={`data:image/jpeg;base64,${c.portrait}`} alt={c.name} className="w-full h-28 object-cover border-2 border-black mb-1" />
                    {c.cameoFrom && (
                      <span className="absolute top-1 left-1 bg-fuchsia-400 text-black text-[9px] font-bold px-1 border border-black" title={`Guest from "${c.cameoFrom}"`}>★ GUEST</span>
                    )}
                    <div className="font-comic text-lg leading-none truncate">{c.name}</div>
                    <div className="text-xs uppercase tracking-wide text-gray-600">{ROLE_LABELS[c.role]} · {c.charClass}</div>
                    <div className="flex gap-1 mt-2">
                      <button onClick={() => setDraft({ ...c })} className="flex-1 text-xs border-2 border-black bg-yellow-300 font-comic">EDIT</button>
                      <button onClick={() => exportCameo(c, series.title)} title="Export as cameo card" className="text-xs border-2 border-black bg-fuchsia-300 px-2 font-comic">⤓</button>
                      <button onClick={() => removeChar(c.id)} className="text-xs border-2 border-black bg-red-300 px-2 font-comic">✕</button>
                    </div>
                  </div>
                ))}
                {/* Add buttons */}
                <div className="border-4 border-dashed border-gray-400 p-2 flex flex-col gap-2 items-center justify-center">
                  <button onClick={() => setDraft(blankChar("hero"))} className="comic-btn bg-blue-500 text-white w-full py-2 text-sm">+ HERO</button>
                  <button onClick={() => setDraft(blankChar("ally"))} className="comic-btn bg-green-500 text-white w-full py-2 text-sm">+ ALLY</button>
                  <button onClick={() => setDraft(blankChar("villain"))} className="comic-btn bg-purple-600 text-white w-full py-2 text-sm">+ VILLAIN</button>
                  <label className="comic-btn bg-fuchsia-500 text-white w-full py-2 text-sm text-center cursor-pointer">
                    ★ IMPORT CAMEO
                    <input type="file" accept=".json,application/json" className="hidden"
                      onChange={(e) => { if (e.target.files?.[0]) importCameo(e.target.files[0]); e.target.value = ""; }} />
                  </label>
                  <button onClick={openCrossover} className="comic-btn bg-fuchsia-700 text-white w-full py-2 text-sm">⚡ CROSS-OVER</button>
                </div>
              </div>

              {heroCount === 0 && (
                <p className="text-center text-red-600 font-bold mb-3">Add at least one HERO to begin.</p>
              )}

              <div className="flex justify-end">
                <button onClick={() => setStep(2)} disabled={heroCount === 0} className="comic-btn bg-black text-white px-6 py-2 font-comic uppercase disabled:opacity-40">Next: World</button>
              </div>
            </div>
          )}

          {/* STEP 2: WORLD */}
          {step === 2 && (
            <div className="font-sans space-y-4">
              <h2 className="font-comic text-2xl uppercase">World &amp; Saga</h2>
              <div>
                <label className="font-bold uppercase text-sm block mb-1">Saga Title</label>
                <input value={series.title} onChange={(e) => set({ title: e.target.value })}
                  className="w-full border-2 border-black p-2 font-comic text-xl" placeholder="The Chronicles of..." />
              </div>
              <div>
                <label className="font-bold uppercase text-sm block mb-1">Visual Style (locked for the whole saga — keeps it consistent)</label>
                <input value={series.settings.style} onChange={(e) => setSettings({ style: e.target.value })}
                  className="w-full border-2 border-black p-2" placeholder="e.g. Classic Comic, 90s Anime" />
                <div className="flex flex-wrap gap-1 mt-2">
                  {STYLE_PRESETS.map((s) => (
                    <button key={s} onClick={() => setSettings({ style: s })}
                      className={`text-xs border-2 border-black px-2 py-1 ${series.settings.style === s ? "bg-yellow-400" : "bg-gray-100"}`}>{s}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="font-bold uppercase text-sm block mb-1">Setting / World</label>
                <input value={series.settings.setting} onChange={(e) => setSettings({ setting: e.target.value })}
                  className="w-full border-2 border-black p-2" placeholder="e.g. A forgotten dungeon beneath the city" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="font-bold uppercase text-sm block mb-1">Tone</label>
                  <select value={series.settings.tone} onChange={(e) => setSettings({ tone: e.target.value })} className="w-full border-2 border-black p-2 bg-gray-50">
                    {TONES.map((t) => <option key={t} value={t}>{t.split(" (")[0]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="font-bold uppercase text-sm block mb-1">Language</label>
                  <select value={series.settings.language} onChange={(e) => setSettings({ language: e.target.value })} className="w-full border-2 border-black p-2 bg-gray-50">
                    {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="font-bold uppercase text-sm block mb-1">Narrator / Story Bot</label>
                <select value={series.settings.persona ?? "classic"} onChange={(e) => setSettings({ persona: e.target.value })}
                  className="w-full border-2 border-black p-2 bg-gray-50">
                  {NARRATOR_PERSONAS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {NARRATOR_PERSONAS.find((p) => p.id === (series.settings.persona ?? "classic"))?.description}
                </p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer bg-yellow-100 p-2 border-2 border-yellow-400 w-fit">
                <input type="checkbox" checked={series.settings.novelMode} onChange={(e) => setSettings({ novelMode: e.target.checked })} className="w-4 h-4 accent-black" />
                <span className="text-sm font-bold uppercase">Novel Mode (richer narration)</span>
              </label>
              <div className="flex justify-between pt-2">
                <button onClick={() => setStep(1)} className="comic-btn bg-gray-400 px-4 py-2 font-comic uppercase">Back</button>
                <button onClick={() => setStep(3)} className="comic-btn bg-black text-white px-6 py-2 font-comic uppercase">Next: Engine</button>
              </div>
            </div>
          )}

          {/* STEP 3: ENGINE & SAFETY */}
          {step === 3 && (
            <div className="font-sans space-y-5">
              <h2 className="font-comic text-2xl uppercase">Safety &amp; Engine</h2>

              {/* Safe mode */}
              <div className="border-4 border-black p-4 bg-green-50">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={series.safeMode} onChange={(e) => set({ safeMode: e.target.checked })} className="w-6 h-6 accent-green-600" />
                  <div>
                    <div className="font-comic text-xl uppercase">Safe Mode {series.safeMode ? "(On)" : "(Off)"}</div>
                    <div className="text-xs text-gray-700">Built for kids: filters unsafe words, blocks adult/violent content, and keeps art and story all-ages.</div>
                  </div>
                </label>
              </div>

              {/* GM mode */}
              <div className="border-4 border-black p-4 bg-amber-50">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={!!series.gmMode} onChange={(e) => set({ gmMode: e.target.checked })} className="w-6 h-6 accent-amber-600" />
                  <div>
                    <div className="font-comic text-xl uppercase">Game Master Mode {series.gmMode ? "(On)" : "(Off)"}</div>
                    <div className="text-xs text-gray-700">Prep campaigns with scenes &amp; secret notes, run your session, then forge a comic that tells the <b>true story</b> of what your real group did.</div>
                  </div>
                </label>
                {series.gmMode && (
                  <label className="flex items-center gap-2 mt-3 ml-9 cursor-pointer">
                    <input type="checkbox" checked={!!series.permadeath} onChange={(e) => set({ permadeath: e.target.checked })} className="w-5 h-5 accent-red-600" />
                    <span className="text-sm font-bold uppercase">Permadeath — fallen heroes stay fallen across the saga</span>
                  </label>
                )}
              </div>

              {/* Audience */}
              <div>
                <label className="font-bold uppercase text-sm block mb-1">Audience / Rating</label>
                <div className="flex gap-2">
                  {(["kids", "teen", "mature"] as Audience[]).map((a) => {
                    const locked = series.safeMode && a === "mature";
                    return (
                      <button key={a} disabled={locked}
                        onClick={() => setSettings({ audience: a })}
                        className={`flex-1 border-2 border-black p-2 font-comic text-sm ${series.settings.audience === a ? "bg-yellow-400" : "bg-gray-100"} ${locked ? "opacity-40 cursor-not-allowed" : ""}`}>
                        {AUDIENCE_LABELS[a]}{locked ? " 🔒" : ""}
                      </button>
                    );
                  })}
                </div>
                {series.safeMode && <p className="text-xs text-gray-500 mt-1">Mature is locked while Safe Mode is on.</p>}
              </div>

              {/* Provider */}
              <div className="border-2 border-black p-4 bg-gray-50">
                <label className="font-bold uppercase text-sm block mb-2">Story Writer Engine (Multi-LLM)</label>
                <div className="flex gap-2 mb-2">
                  {(["gemini", "openai", "local"] as TextProvider[]).map((p) => (
                    <button key={p} onClick={() => set({ provider: { ...series.provider, textProvider: p } })}
                      className={`flex-1 border-2 border-black p-2 font-comic text-xs ${series.provider.textProvider === p ? "bg-yellow-400" : "bg-white"}`}>
                      {TEXT_PROVIDER_LABELS[p]}
                    </button>
                  ))}
                </div>
                {series.provider.textProvider === "openai" && (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-600">OpenAI or any OpenAI-compatible cloud (OpenRouter, Groq, Together…). Artwork still uses Gemini.</p>
                    <input value={series.provider.openaiBaseUrl} onChange={(e) => set({ provider: { ...series.provider, openaiBaseUrl: e.target.value } })}
                      className="w-full border-2 border-black p-2 text-sm" placeholder="https://api.openai.com/v1" />
                    <input type="password" value={series.provider.openaiApiKey} onChange={(e) => set({ provider: { ...series.provider, openaiApiKey: e.target.value } })}
                      className="w-full border-2 border-black p-2 text-sm" placeholder="API key (sk-...)" />
                    <input value={series.provider.openaiModel} onChange={(e) => set({ provider: { ...series.provider, openaiModel: e.target.value } })}
                      className="w-full border-2 border-black p-2 text-sm" placeholder="gpt-4o-mini" />
                    <button onClick={testProvider} disabled={pinging} className="comic-btn bg-blue-500 text-white px-4 py-1 text-sm">Test connection</button>
                    {pingMsg && <p className="text-xs font-bold">{pingMsg}</p>}
                  </div>
                )}
                {series.provider.textProvider === "local" && (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-600">Runs the writing on your own machine (Ollama, LM Studio, llama.cpp). Artwork still uses Gemini.</p>
                    <input value={series.provider.localBaseUrl} onChange={(e) => set({ provider: { ...series.provider, localBaseUrl: e.target.value } })}
                      className="w-full border-2 border-black p-2 text-sm" placeholder="http://localhost:11434/v1" />
                    <input value={series.provider.localModel} onChange={(e) => set({ provider: { ...series.provider, localModel: e.target.value } })}
                      className="w-full border-2 border-black p-2 text-sm" placeholder="llama3.1" />
                    <button onClick={testProvider} disabled={pinging} className="comic-btn bg-blue-500 text-white px-4 py-1 text-sm">Test connection</button>
                    {pingMsg && <p className="text-xs font-bold">{pingMsg}</p>}
                  </div>
                )}
                {series.provider.textProvider === "gemini" && (
                  <p className="text-xs text-gray-600">Uses your app's Gemini API key for both story and art.</p>
                )}
              </div>

              {/* Audio */}
              <div className="border-2 border-black p-4 bg-gray-50">
                <label className="font-bold uppercase text-sm block mb-2">Audio (optional)</label>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs font-bold uppercase block mb-1">Narration (read aloud)</span>
                    <div className="flex gap-1">
                      {(["off", "local", "elevenlabs"] as TtsProvider[]).map((t) => (
                        <button key={t} onClick={() => setAudio({ tts: t })}
                          className={`flex-1 border-2 border-black p-1 text-xs font-comic ${audio.tts === t ? "bg-yellow-400" : "bg-white"}`}>
                          {t === "off" ? "Off" : t === "local" ? "Local (free)" : "ElevenLabs"}
                        </button>
                      ))}
                    </div>
                    {audio.tts === "elevenlabs" && (
                      <div className="space-y-1 mt-2">
                        <input type="password" value={audio.elevenApiKey ?? ""} onChange={(e) => setAudio({ elevenApiKey: e.target.value })}
                          className="w-full border-2 border-black p-1.5 text-xs" placeholder="ElevenLabs API key" />
                        <input value={audio.elevenVoiceId ?? ""} onChange={(e) => setAudio({ elevenVoiceId: e.target.value })}
                          className="w-full border-2 border-black p-1.5 text-xs" placeholder="Voice ID" />
                      </div>
                    )}
                    {audio.tts === "local" && <p className="text-xs text-gray-500 mt-1">Uses your browser's built-in voices — free, offline, no key.</p>}
                  </div>
                  <div>
                    <span className="text-xs font-bold uppercase block mb-1">Background music</span>
                    <div className="flex gap-1">
                      {(["off", "ambient", "lyria"] as MusicProvider[]).map((m) => (
                        <button key={m} onClick={() => setAudio({ music: m })}
                          className={`flex-1 border-2 border-black p-1 text-xs font-comic ${audio.music === m ? "bg-yellow-400" : "bg-white"}`}>
                          {m === "off" ? "Off" : m === "ambient" ? "Ambient (free)" : "Lyria*"}
                        </button>
                      ))}
                    </div>
                    {audio.music === "lyria" && <p className="text-xs text-gray-500 mt-1">*Lyria streaming is experimental; falls back to the free ambient pad for now.</p>}
                    {audio.music !== "off" && (
                      <div className="mt-2">
                        <span className="text-xs">Volume</span>
                        <input type="range" min={0} max={0.4} step={0.02} value={audio.musicVolume}
                          onChange={(e) => setAudio({ musicVolume: parseFloat(e.target.value) })} className="w-full" />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setStep(2)} className="comic-btn bg-gray-400 px-4 py-3 font-comic uppercase">Back</button>
                <button onClick={launch} disabled={heroCount === 0 || props.isTransitioning}
                  className="comic-btn bg-red-600 text-white text-2xl px-6 py-3 w-full uppercase font-comic disabled:bg-gray-400">
                  {props.isTransitioning ? "Summoning..." : series.gmMode ? "Open Campaign Studio →" : series.issues.length > 0 ? "Save & Read →" : "Roll Initiative!"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CHARACTER EDITOR MODAL */}
      {draft && (
        <div className="fixed inset-0 z-[300] bg-black/70 flex items-start justify-center overflow-y-auto p-4">
          <div className="max-w-[560px] w-full bg-white border-[6px] border-black shadow-[10px_10px_0_rgba(0,0,0,.7)] p-5 my-6">
            <h2 className="font-comic text-2xl uppercase mb-3">Create {ROLE_LABELS[draft.role]}</h2>
            {draft.cameoFrom && (
              <div className="bg-fuchsia-100 border-2 border-fuchsia-400 text-fuchsia-900 text-xs p-2 mb-3">
                ★ Guest cameo from <b>"{draft.cameoFrom}"</b>. Review (and tweak the role) below, then Save to add them to this saga.
              </div>
            )}

            <div className="flex gap-4 mb-4">
              <div className="w-32 shrink-0">
                {draft.portrait ? (
                  <img src={`data:image/jpeg;base64,${draft.portrait}`} alt="portrait" className="w-32 h-32 object-cover border-4 border-black" />
                ) : (
                  <div className="w-32 h-32 border-4 border-dashed border-gray-400 flex items-center justify-center text-gray-400 text-xs text-center p-2">No image yet</div>
                )}
                <label className="comic-btn bg-yellow-400 text-black text-xs px-2 py-2 mt-2 block text-center cursor-pointer">
                  UPLOAD PHOTO
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
                </label>
              </div>
              <div className="flex-1 space-y-2">
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="w-full border-2 border-black p-2 font-comic text-lg" placeholder="Character name" />
                {series.gmMode && draft.role === "hero" && (
                  <input value={draft.player ?? ""} onChange={(e) => setDraft({ ...draft, player: e.target.value })}
                    className="w-full border-2 border-blue-400 p-2 text-sm" placeholder="Real player's name (e.g. 'Played by Mia')" />
                )}
                <div className="flex gap-2">
                  <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as CharacterRole })} className="border-2 border-black p-2 text-sm flex-1">
                    {(["hero", "ally", "villain"] as CharacterRole[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                  <select value={draft.charClass} onChange={(e) => setDraft({ ...draft, charClass: e.target.value })} className="border-2 border-black p-2 text-sm flex-1">
                    {CHARACTER_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  className="w-full border-2 border-black p-2 text-sm h-16 resize-none" placeholder="Look (for the artist): e.g. tall elf, silver armor, green cloak" />
                <button onClick={genPortrait} disabled={busyPortrait} className="comic-btn bg-blue-500 text-white px-3 py-1 text-xs">
                  {busyPortrait ? "Drawing..." : "✨ Generate portrait from description"}
                </button>
              </div>
            </div>

            <textarea value={draft.bio} onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
              className="w-full border-2 border-black p-2 text-sm h-16 resize-none mb-3" placeholder="Personality / backstory (for the writer): e.g. loyal but reckless, fears the dark" />

            {/* D&D stats */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-4">
              {STAT_KEYS.map((k) => (
                <div key={k}>
                  <div className="flex justify-between font-comic text-sm uppercase">
                    <span>{STAT_ABBR[k]}</span><span>{draft.stats[k]}</span>
                  </div>
                  <input type="range" min={1} max={20} value={draft.stats[k]} className="stat-slider"
                    onChange={(e) => setDraft({ ...draft, stats: { ...draft.stats, [k]: parseInt(e.target.value) } })} />
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setDraft(null)} className="comic-btn bg-gray-300 px-4 py-2 font-comic uppercase">Cancel</button>
              <button onClick={saveDraft} className="comic-btn bg-green-500 text-white px-6 py-2 font-comic uppercase">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* CROSS-OVER PICKER MODAL */}
      {xover && (
        <div className="fixed inset-0 z-[300] bg-black/75 flex items-start justify-center overflow-y-auto p-4">
          <div className="max-w-[620px] w-full bg-white border-[6px] border-fuchsia-600 shadow-[10px_10px_0_rgba(0,0,0,.7)] p-5 my-6">
            <h2 className="font-comic text-2xl uppercase mb-1">⚡ Cross-Over</h2>
            <p className="text-xs text-gray-600 mb-3">Bring characters from another one of your sagas into this one as guest stars.</p>

            <label className="font-bold uppercase text-xs block mb-1">Choose a saga</label>
            <select value={xover.sourceId} onChange={(e) => pickSource(e.target.value)} className="w-full border-2 border-black p-2 mb-3">
              <option value="">— Select a saga —</option>
              {props.crossoverSources.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>

            {xover.loading && <p className="font-comic text-center py-6">Loading cast…</p>}

            {!xover.loading && xover.sourceId && xover.cast.length === 0 && (
              <p className="text-sm text-gray-500 py-4 text-center">That saga has no characters to bring over.</p>
            )}

            {!xover.loading && xover.cast.length > 0 && (
              <>
                <p className="text-xs font-bold uppercase mb-2">Pick who joins ({xover.selected.length} selected)</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4 max-h-[320px] overflow-y-auto">
                  {xover.cast.map((c) => {
                    const on = xover.selected.includes(c.id);
                    return (
                      <button key={c.id} onClick={() => toggleXover(c.id)}
                        className={`border-4 p-1 text-left ${on ? "border-fuchsia-600 bg-fuchsia-50" : "border-black bg-gray-50"}`}>
                        <img src={`data:image/jpeg;base64,${c.portrait}`} alt={c.name} className="w-full h-20 object-cover border-2 border-black mb-1" />
                        <div className="font-comic text-sm leading-none truncate">{on ? "✓ " : ""}{c.name}</div>
                        <div className="text-[10px] uppercase text-gray-600 truncate">{ROLE_LABELS[c.role]}</div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={() => setXover(null)} className="comic-btn bg-gray-300 px-4 py-2 font-comic uppercase">Cancel</button>
              <button onClick={confirmCrossover} disabled={xover.selected.length === 0}
                className="comic-btn bg-fuchsia-600 text-white px-6 py-2 font-comic uppercase disabled:bg-gray-400">
                Bring in {xover.selected.length || ""}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
