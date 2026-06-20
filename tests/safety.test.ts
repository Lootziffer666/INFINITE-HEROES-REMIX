/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from "vitest";
import {
  moderateInput,
  moderateFields,
  sanitizeOutput,
  writerGuardrails,
  artistGuardrails,
} from "../safety";

describe("moderateInput", () => {
  it("passes clean text", () => {
    expect(moderateInput("a brave knight on a quest", true).level).toBe("clean");
  });

  it("blocks always-blocked terms regardless of safe mode", () => {
    expect(moderateInput("how to make a bomb", false).level).toBe("block");
    expect(moderateInput("how to make a bomb", true).level).toBe("block");
  });

  it("blocks adult terms only in safe mode", () => {
    expect(moderateInput("an explicit nude scene", true).level).toBe("block");
    expect(moderateInput("an explicit nude scene", false).level).not.toBe("block");
  });

  it("warns (not blocks) on mild violence in safe mode", () => {
    const r = moderateInput("they kill the goblin king", true);
    expect(r.level).toBe("warn");
    expect(r.ok).toBe(true);
  });

  it("treats empty input as clean", () => {
    expect(moderateInput("", true).level).toBe("clean");
    expect(moderateInput(undefined, true).level).toBe("clean");
  });
});

describe("moderateFields", () => {
  it("returns the first block across fields", () => {
    const r = moderateFields(["fine", "nude content", "fine"], true);
    expect(r.level).toBe("block");
  });

  it("returns a warn when there is no block", () => {
    const r = moderateFields(["a peaceful village", "a knife in the dark"], true);
    expect(r.level).toBe("warn");
  });

  it("is clean when everything is clean", () => {
    expect(moderateFields(["hello", "world"], true).level).toBe("clean");
  });
});

describe("sanitizeOutput", () => {
  it("softens profanity in safe mode", () => {
    const out = sanitizeOutput("what the fuck", true);
    expect(out).not.toMatch(/fuck/i);
  });

  it("leaves text untouched when safe mode is off", () => {
    expect(sanitizeOutput("damn", false)).toBe("damn");
  });

  it("handles undefined", () => {
    expect(sanitizeOutput(undefined, true)).toBeUndefined();
  });
});

describe("guardrails", () => {
  it("uses strict guardrails for kids/safe mode", () => {
    expect(writerGuardrails("kids", true)).toMatch(/STRICT/);
    expect(artistGuardrails("kids", true)).toMatch(/all-ages|wholesome/i);
  });

  it("relaxes (but never fully) for mature with safe mode off", () => {
    expect(writerGuardrails("mature", false)).toMatch(/MATURE/);
  });
});
