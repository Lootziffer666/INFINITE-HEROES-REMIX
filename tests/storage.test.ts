/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  deleteSeries,
  listSeries,
  loadSeries,
  normalize,
  persistMeta,
  saveActiveIssue,
  saveSeries,
} from "../storage";
import {
  ComicFace,
  Issue,
  Series,
  defaultAudio,
  defaultProvider,
  defaultStats,
} from "../types";

const face = (id: string, type: ComicFace["type"], imageUrl?: string): ComicFace => ({
  id,
  type,
  choices: [],
  isLoading: false,
  imageUrl,
});

const makeIssue = (id: string, number: number): Issue => ({
  id,
  number,
  title: `Issue #${number}`,
  faces: [face(`${id}-cover`, "cover", "data:image/jpeg;base64,COVER"), face(`${id}-p1`, "story", "data:image/jpeg;base64,P1")],
  choiceLog: [],
  status: "complete",
  createdAt: 0,
  updatedAt: 0,
});

const makeSeries = (id: string): Series => ({
  id,
  title: `Saga ${id}`,
  cast: [{ id: "c1", role: "hero", name: "Aria", portrait: "x", description: "", stats: defaultStats() }],
  settings: { style: "Classic Comic", setting: "town", audience: "kids", language: "en-US", tone: "WHOLESOME", novelMode: false },
  safeMode: true,
  provider: defaultProvider(),
  issues: [makeIssue(`${id}-i1`, 1)],
  campaigns: [],
  audio: defaultAudio(),
  createdAt: 0,
  updatedAt: 0,
});

describe("storage round-trip", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("saves and reloads a series with its page images intact", async () => {
    const s = makeSeries("rt1");
    await saveSeries(s);
    const loaded = await loadSeries("rt1");
    expect(loaded).not.toBeNull();
    expect(loaded!.issues).toHaveLength(1);
    expect(loaded!.issues[0].faces).toHaveLength(2);
    expect(loaded!.issues[0].faces[0].imageUrl).toContain("COVER");
  });

  it("indexes the saga (with cover) for the library grid", async () => {
    await saveSeries(makeSeries("rt2"));
    const lib = listSeries();
    const entry = lib.find((e) => e.id === "rt2");
    expect(entry).toBeTruthy();
    expect(entry!.coverUrl).toContain("COVER");
    expect(entry!.issueCount).toBe(1);
  });

  it("persistMeta does not erase already-stored page images", async () => {
    const s = makeSeries("rt3");
    await saveSeries(s);
    // Simulate a metadata-only edit (e.g. renaming the saga) with faces still
    // present in memory.
    s.title = "Renamed Saga";
    await persistMeta(s);
    const loaded = await loadSeries("rt3");
    expect(loaded!.title).toBe("Renamed Saga");
    expect(loaded!.issues[0].faces[0].imageUrl).toContain("COVER"); // pages survived
  });

  it("saveActiveIssue updates only the targeted issue's pages", async () => {
    const s = makeSeries("rt4");
    s.issues.push(makeIssue("rt4-i2", 2));
    await saveSeries(s);
    // Mutate issue 2's first page and save just that issue.
    s.issues[1].faces[0] = face("rt4-i2-cover", "cover", "data:image/jpeg;base64,NEWCOVER");
    await saveActiveIssue(s, "rt4-i2");
    const loaded = await loadSeries("rt4");
    expect(loaded!.issues[0].faces[0].imageUrl).toContain("COVER"); // issue 1 untouched
    expect(loaded!.issues[1].faces[0].imageUrl).toContain("NEWCOVER"); // issue 2 updated
  });

  it("deletes a series and its pages", async () => {
    await saveSeries(makeSeries("rt5"));
    await deleteSeries("rt5");
    expect(await loadSeries("rt5")).toBeNull();
    expect(listSeries().find((e) => e.id === "rt5")).toBeUndefined();
  });
});

describe("normalize", () => {
  it("fills provider/audio/persona/campaign defaults for legacy sagas", () => {
    const legacy = {
      id: "old",
      title: "Old",
      cast: [],
      settings: { style: "x", setting: "y", audience: "kids", language: "en-US", tone: "t", novelMode: false },
      safeMode: true,
      provider: { textProvider: "gemini", localBaseUrl: "u", localModel: "m" } as any,
      issues: [],
      createdAt: 0,
      updatedAt: 0,
    } as unknown as Series;
    const n = normalize(legacy);
    expect(n.provider.openaiBaseUrl).toBeTruthy(); // filled from defaults
    expect(n.audio).toBeTruthy();
    expect(n.campaigns).toEqual([]);
    expect(n.settings.persona).toBe("classic");
  });
});
