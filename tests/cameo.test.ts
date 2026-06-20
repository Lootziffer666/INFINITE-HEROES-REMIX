/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from "vitest";
import { parseCameoData, sanitizeGuest } from "../cameo";

const validChar = {
  role: "hero",
  name: "Aria",
  portrait: "/9j/4AAQSkZJRArealbase64ish",
  description: "silver-haired elf ranger",
  stats: { strength: 12, dexterity: 18, constitution: 10, intelligence: 11, wisdom: 14, charisma: 9 },
};

describe("parseCameoData", () => {
  it("parses a single cameo card and assigns a fresh id + origin", () => {
    const card = { schema: "infinite-heroes/cameo", version: 1, originTitle: "Saga A", character: validChar };
    const out = parseCameoData(JSON.stringify(card));
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Aria");
    expect(out[0].cameoFrom).toBe("Saga A");
    expect(out[0].id).toBeTruthy();
    expect(out[0].status).toBe("alive");
  });

  it("parses a crossover pack of multiple characters", () => {
    const pack = {
      schema: "infinite-heroes/crossover",
      version: 1,
      originTitle: "Saga B",
      characters: [validChar, { ...validChar, name: "Boran", role: "ally" }],
    };
    const out = parseCameoData(JSON.stringify(pack));
    expect(out).toHaveLength(2);
    expect(out.map((c) => c.name)).toEqual(["Aria", "Boran"]);
    expect(out.every((c) => c.cameoFrom === "Saga B")).toBe(true);
  });

  it("accepts a bare character object", () => {
    const out = parseCameoData(JSON.stringify(validChar));
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Aria");
  });

  it("normalises a data: URI portrait to bare base64", () => {
    const out = parseCameoData(JSON.stringify({ ...validChar, portrait: "data:image/png;base64,iVBORabc" }));
    expect(out[0].portrait).toBe("iVBORabc");
  });

  it("clamps out-of-range stats and falls back to a valid role", () => {
    const out = parseCameoData(
      JSON.stringify({ ...validChar, role: "wizard-supreme", stats: { ...validChar.stats, strength: 999, dexterity: -4 } }),
    );
    expect(out[0].role).toBe("ally"); // invalid role -> default
    expect(out[0].stats.strength).toBe(20);
    expect(out[0].stats.dexterity).toBe(1);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseCameoData("{not json")).toThrow();
  });

  it("throws when there is no portrait", () => {
    expect(() => parseCameoData(JSON.stringify({ ...validChar, portrait: "" }))).toThrow();
  });
});

describe("sanitizeGuest", () => {
  it("gives a fresh id and records origin", () => {
    const g = sanitizeGuest(validChar, "Origin Saga");
    expect(g.cameoFrom).toBe("Origin Saga");
    expect(g.status).toBe("alive");
    expect(g.id).toBeTruthy();
  });

  it("clamps overly long text fields", () => {
    const g = sanitizeGuest({ ...validChar, description: "x".repeat(2000) });
    expect(g.description.length).toBeLessThanOrEqual(600);
  });
});
