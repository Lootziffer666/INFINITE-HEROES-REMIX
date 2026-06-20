/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from "vitest";
import { buildCampaignCanon } from "../engine";
import { Campaign, Character, Series, defaultAudio, defaultProvider, defaultStats } from "../types";

const hero = (id: string, name: string): Character => ({
  id,
  role: "hero",
  name,
  portrait: "x",
  description: "",
  stats: defaultStats(),
});

const baseSeries = (cast: Character[]): Series => ({
  id: "s1",
  title: "Test Saga",
  cast,
  settings: { style: "Classic Comic", setting: "town", audience: "kids", language: "en-US", tone: "WHOLESOME", novelMode: false },
  safeMode: true,
  provider: defaultProvider(),
  issues: [],
  campaigns: [],
  audio: defaultAudio(),
  createdAt: 0,
  updatedAt: 0,
});

describe("buildCampaignCanon", () => {
  it("includes premise, played scenes, result and named casualties", () => {
    const aria = hero("h1", "Aria");
    const boran = hero("h2", "Boran");
    const series = baseSeries([aria, boran]);
    const campaign: Campaign = {
      id: "c1",
      title: "The Sunken Crypt",
      premise: "The party seeks a lost relic.",
      scenes: [
        { id: "sc1", title: "The Gate", plan: "guards", npcs: ["Gatekeeper"], outcome: "They bluffed past the guards.", status: "played" },
        { id: "sc2", title: "The Trap", plan: "spikes", npcs: [], outcome: "", status: "planned" },
      ],
      result: "victory",
      resultNotes: "They escaped with the relic.",
      casualties: ["h2"],
      forgedIssueIds: [],
      createdAt: 0,
      updatedAt: 0,
    };

    const canon = buildCampaignCanon(series, campaign);
    expect(canon).toContain("The Sunken Crypt");
    expect(canon).toContain("The party seeks a lost relic.");
    expect(canon).toContain("They bluffed past the guards.");
    expect(canon).toContain("Victory");
    expect(canon).toContain("They escaped with the relic.");
    // Casualty id resolves to the character's name.
    expect(canon).toContain("Boran");
  });

  it("uses planned scenes when none are played yet", () => {
    const series = baseSeries([hero("h1", "Aria")]);
    const campaign: Campaign = {
      id: "c2",
      title: "Prep Only",
      premise: "",
      scenes: [{ id: "s", title: "Opening", plan: "meet in a tavern", npcs: [], status: "planned" }],
      result: "ongoing",
      casualties: [],
      forgedIssueIds: [],
      createdAt: 0,
      updatedAt: 0,
    };
    const canon = buildCampaignCanon(series, campaign);
    expect(canon).toContain("meet in a tavern");
  });
});
