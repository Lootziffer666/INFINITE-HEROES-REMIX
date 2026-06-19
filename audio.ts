/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * audio.ts
 * --------
 * Optional audio underscore for the reader:
 *   - NARRATION (TTS): read captions/dialogue aloud as pages turn.
 *       • "local"      -> Web Speech API (free, offline, no key) — WORKS NOW.
 *       • "elevenlabs" -> high-quality cloud voice (needs API key + voice id).
 *   - MUSIC: ambient background score.
 *       • "ambient"    -> a gentle procedural WebAudio pad (free, offline) — WORKS NOW.
 *       • "lyria"      -> Gemini Lyria music (experimental seam; see note).
 *
 * Everything is best-effort and fails silently so audio never blocks reading.
 */

import { AudioConfig } from "./types";

// ---------------------------------------------------------------------------
// NARRATION (TTS)
// ---------------------------------------------------------------------------

let currentAudioEl: HTMLAudioElement | null = null;

export function listLocalVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  return window.speechSynthesis.getVoices();
}

export function stopNarration() {
  try {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  } catch {
    /* noop */
  }
  if (currentAudioEl) {
    currentAudioEl.pause();
    currentAudioEl.src = "";
    currentAudioEl = null;
  }
}

async function speakElevenLabs(text: string, cfg: AudioConfig): Promise<void> {
  if (!cfg.elevenApiKey || !cfg.elevenVoiceId) {
    throw new Error("ElevenLabs not configured");
  }
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${cfg.elevenVoiceId}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": cfg.elevenApiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs HTTP ${res.status}`);
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  stopNarration();
  const el = new Audio(objUrl);
  currentAudioEl = el;
  el.onended = () => URL.revokeObjectURL(objUrl);
  await el.play().catch(() => {});
}

function speakLocal(text: string, cfg: AudioConfig, lang?: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  stopNarration();
  const u = new SpeechSynthesisUtterance(text);
  if (lang) u.lang = lang;
  const voices = window.speechSynthesis.getVoices();
  const voice =
    (cfg.localVoice && voices.find((v) => v.name === cfg.localVoice)) ||
    (lang && voices.find((v) => v.lang === lang)) ||
    undefined;
  if (voice) u.voice = voice;
  u.rate = 1;
  u.pitch = 1;
  window.speechSynthesis.speak(u);
}

/** Read a line of comic text aloud using the configured narrator. */
export async function narrate(
  text: string,
  cfg: AudioConfig,
  lang?: string,
): Promise<void> {
  const clean = (text || "").trim();
  if (!clean || cfg.tts === "off") return;
  try {
    if (cfg.tts === "elevenlabs") {
      await speakElevenLabs(clean, cfg);
    } else {
      speakLocal(clean, cfg, lang);
    }
  } catch (e) {
    // Fall back to local voice if the cloud voice fails.
    console.warn("Narration failed, falling back to local voice", e);
    speakLocal(clean, cfg, lang);
  }
}

// ---------------------------------------------------------------------------
// MUSIC UNDERSCORE
// ---------------------------------------------------------------------------

let audioCtx: AudioContext | null = null;
let musicNodes: { osc: OscillatorNode[]; gain: GainNode } | null = null;

/**
 * Gentle, key-agnostic ambient pad built from a few detuned oscillators.
 * Free, offline, and unobtrusive — a real working underscore option.
 */
function startAmbient(volume: number) {
  stopMusic();
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    audioCtx = new Ctx();
    const gain = audioCtx.createGain();
    gain.gain.value = 0;
    gain.connect(audioCtx.destination);
    // Soft fade-in.
    gain.gain.linearRampToValueAtTime(
      Math.max(0, Math.min(0.4, volume)),
      audioCtx.currentTime + 3,
    );
    // A gentle minor-ish chord (A2, E3, A3) detuned for warmth.
    const freqs = [110, 164.81, 220];
    const osc: OscillatorNode[] = freqs.map((f, i) => {
      const o = audioCtx!.createOscillator();
      o.type = i === 0 ? "sine" : "triangle";
      o.frequency.value = f;
      o.detune.value = (i - 1) * 4;
      const og = audioCtx!.createGain();
      og.gain.value = i === 0 ? 0.5 : 0.25;
      o.connect(og);
      og.connect(gain);
      o.start();
      return o;
    });
    // Slow LFO on volume for a breathing feel.
    const lfo = audioCtx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 0.06;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    lfo.start();
    osc.push(lfo);
    musicNodes = { osc, gain };
  } catch (e) {
    console.warn("Ambient music failed", e);
  }
}

export function startMusic(cfg: AudioConfig) {
  if (cfg.music === "off") return;
  if (cfg.music === "ambient") {
    startAmbient(cfg.musicVolume);
    return;
  }
  if (cfg.music === "lyria") {
    // EXPERIMENTAL: Gemini Lyria RealTime streams PCM audio over a live
    // session and needs an AudioWorklet pipeline. That streaming client is a
    // dedicated follow-up; until then we fall back to the free ambient pad so
    // the "music on" experience still works.
    console.info("Lyria music is experimental; using local ambient fallback.");
    startAmbient(cfg.musicVolume);
  }
}

export function setMusicVolume(volume: number) {
  if (musicNodes && audioCtx) {
    musicNodes.gain.gain.setTargetAtTime(
      Math.max(0, Math.min(0.4, volume)),
      audioCtx.currentTime,
      0.3,
    );
  }
}

export function stopMusic() {
  if (musicNodes && audioCtx) {
    try {
      musicNodes.gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1);
      musicNodes.osc.forEach((o) => o.stop(audioCtx!.currentTime + 1.2));
    } catch {
      /* noop */
    }
  }
  musicNodes = null;
  if (audioCtx) {
    const ctx = audioCtx;
    setTimeout(() => ctx.close().catch(() => {}), 1500);
    audioCtx = null;
  }
}
