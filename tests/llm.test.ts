/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from "vitest";
import { extractJson } from "../llm";

describe("extractJson", () => {
  it("returns plain JSON unchanged", () => {
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });

  it("strips ```json fences", () => {
    const out = extractJson('```json\n{"a":1}\n```');
    expect(JSON.parse(out)).toEqual({ a: 1 });
  });

  it("isolates the JSON object from surrounding prose", () => {
    const out = extractJson('Sure! Here you go: {"caption":"hi"} hope that helps');
    expect(JSON.parse(out)).toEqual({ caption: "hi" });
  });

  it("falls back to an empty object when no JSON is present", () => {
    expect(extractJson("no json here")).toBe("{}");
    expect(extractJson("")).toBe("{}");
  });
});
