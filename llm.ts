/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * llm.ts
 * ------
 * Multi-LLM text-generation abstraction. The story SCRIPT can be written by:
 *   - "gemini"  -> Google Gemini (cloud).
 *   - "openai"  -> OpenAI or ANY OpenAI-compatible cloud (OpenRouter, Groq,
 *                  Together, Azure-style, etc.) via base URL + API key.
 *   - "local"   -> a local OpenAI-compatible endpoint (Ollama, LM Studio,
 *                  llama.cpp server) with no key.
 *
 * Image generation is NOT abstracted here — it stays on Gemini (engine.ts).
 */

import { GoogleGenAI } from "@google/genai";
import { ProviderConfig } from "./types";

export const GEMINI_TEXT_MODEL = "gemini-3-pro-image-preview";

export interface TextRequest {
  system: string;
  prompt: string;
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

interface OpenAITarget {
  baseUrl: string;
  model: string;
  apiKey?: string;
}

/** Single code path for OpenAI, OpenAI-compatible clouds, and local servers. */
async function generateOpenAICompatible(
  req: TextRequest,
  target: OpenAITarget,
): Promise<string> {
  const base = target.baseUrl.replace(/\/+$/, "");
  const url = `${base}/chat/completions`;
  const body: Record<string, unknown> = {
    model: target.model,
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: req.prompt },
    ],
    temperature: 0.9,
    stream: false,
  };
  if (req.json) body.response_format = { type: "json_object" };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (target.apiKey) headers.Authorization = `Bearer ${target.apiKey}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`LLM HTTP ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? "";
  } finally {
    clearTimeout(timer);
  }
}

function targetFor(cfg: ProviderConfig): OpenAITarget | null {
  if (cfg.textProvider === "openai") {
    return { baseUrl: cfg.openaiBaseUrl, model: cfg.openaiModel, apiKey: cfg.openaiApiKey };
  }
  if (cfg.textProvider === "local") {
    return { baseUrl: cfg.localBaseUrl, model: cfg.localModel };
  }
  return null;
}

/**
 * Generate text using the configured provider.
 * Errors propagate so the caller can surface a helpful message and fall back.
 */
export async function generateText(
  req: TextRequest,
  cfg: ProviderConfig,
): Promise<string> {
  const target = targetFor(cfg);
  if (target) {
    if (cfg.textProvider === "openai" && !cfg.openaiApiKey) {
      throw new Error("OpenAI provider selected but no API key is set.");
    }
    return generateOpenAICompatible(req, target);
  }
  return generateGemini(req);
}

/** Reachability + model probe for a given provider (used in Settings UI). */
export async function pingProvider(cfg: ProviderConfig): Promise<{
  ok: boolean;
  detail: string;
}> {
  const target = targetFor(cfg);
  if (!target) return { ok: true, detail: "Gemini (cloud) uses your app API key." };
  const base = target.baseUrl.replace(/\/+$/, "");
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const headers: Record<string, string> = {};
    if (target.apiKey) headers.Authorization = `Bearer ${target.apiKey}`;
    const res = await fetch(`${base}/models`, { signal: ctrl.signal, headers });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status} from ${base}` };
    const data = await res.json().catch(() => null);
    const ids: string[] = Array.isArray(data?.data)
      ? data.data.map((m: any) => m.id)
      : [];
    const hasModel = ids.length === 0 || ids.includes(target.model);
    return {
      ok: true,
      detail: hasModel
        ? `Connected. ${ids.length || "?"} model(s) available.`
        : `Connected, but "${target.model}" not in the list. Available: ${ids.slice(0, 8).join(", ")}${ids.length > 8 ? "…" : ""}`,
    };
  } catch {
    return { ok: false, detail: `Could not reach ${base}. Check URL/key/server.` };
  }
}
