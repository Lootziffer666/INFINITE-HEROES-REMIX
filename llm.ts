/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * llm.ts
 * ------
 * Text-generation provider abstraction. The story SCRIPT can be written either
 * by Gemini (cloud) or by a LOCAL model exposed through an OpenAI-compatible
 * endpoint (Ollama at /v1, LM Studio, llama.cpp server, etc.).
 *
 * Image generation is NOT abstracted here — it stays on Gemini (engine.ts),
 * since local open models can't yet match the character-consistent panel art.
 */

import { GoogleGenAI } from "@google/genai";
import { ProviderConfig } from "./types";

export const GEMINI_TEXT_MODEL = "gemini-3-pro-image-preview";

export interface TextRequest {
  /** System / role framing instruction. */
  system: string;
  /** The actual user prompt (the script request). */
  prompt: string;
  /** Hint that we expect strict JSON back. */
  json?: boolean;
}

/** Strip markdown fences and isolate the first JSON object if present. */
export function extractJson(raw: string): string {
  let t = (raw || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    t = t.slice(first, last + 1);
  }
  return t || "{}";
}

async function generateGemini(req: TextRequest): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const res = await ai.models.generateContent({
    model: GEMINI_TEXT_MODEL,
    contents: `${req.system}\n\n${req.prompt}`,
    config: req.json ? { responseMimeType: "application/json" } : {},
  });
  return res.text || "";
}

async function generateLocal(
  req: TextRequest,
  cfg: ProviderConfig,
): Promise<string> {
  const base = cfg.localBaseUrl.replace(/\/+$/, "");
  const url = `${base}/chat/completions`;
  const body: Record<string, unknown> = {
    model: cfg.localModel,
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: req.prompt },
    ],
    temperature: 0.9,
    stream: false,
  };
  if (req.json) body.response_format = { type: "json_object" };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`Local LLM HTTP ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? "";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Generate text using the configured provider.
 * Errors propagate so the caller can surface a helpful message and fall back.
 */
export async function generateText(
  req: TextRequest,
  cfg: ProviderConfig,
): Promise<string> {
  if (cfg.textProvider === "local") {
    return generateLocal(req, cfg);
  }
  return generateGemini(req);
}

/** Quick reachability probe for the local endpoint (used in Settings UI). */
export async function pingLocal(cfg: ProviderConfig): Promise<{
  ok: boolean;
  detail: string;
}> {
  const base = cfg.localBaseUrl.replace(/\/+$/, "");
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${base}/models`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const data = await res.json().catch(() => null);
    const ids: string[] = Array.isArray(data?.data)
      ? data.data.map((m: any) => m.id)
      : [];
    const hasModel = ids.length === 0 || ids.includes(cfg.localModel);
    return {
      ok: true,
      detail: hasModel
        ? `Connected. ${ids.length} model(s) available.`
        : `Connected, but "${cfg.localModel}" not found. Available: ${ids.join(", ") || "unknown"}`,
    };
  } catch (e) {
    return { ok: false, detail: `Could not reach ${base}. Is the server running?` };
  }
}
