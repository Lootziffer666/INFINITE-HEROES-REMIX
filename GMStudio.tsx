/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * GMStudio.tsx
 * ------------
 * The Game Master workspace. Prep a campaign (premise + scenes + secret GM
 * notes), record what ACTUALLY happened at the table, set the result and any
 * fallen heroes, then "forge" a true-story comic issue from it.
 */

import React, { useState } from "react";
import {
  Campaign,
  CampaignResult,
  CampaignScene,
  Character,
  CharacterStatus,
  RESULT_LABELS,
  ROLE_LABELS,
  Series,
  STATUS_LABELS,
  uid,
} from "./types";

interface GMStudioProps {
  series: Series;
  onChange: (s: Series) => void;
  onForge: (campaignId: string) => void;
  onOpenIssue: (issueId: string) => void;
  onBack: () => void;
  onEditRoster: () => void;
}

const blankCampaign = (n: number): Campaign => ({
  id: uid(),
  title: `Campaign ${n}`,
  premise: "",
  scenes: [],
  result: "ongoing",
  resultNotes: "",
  casualties: [],
  forgedIssueIds: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

const blankScene = (n: number): CampaignScene => ({
  id: uid(),
  title: `Scene ${n}`,
  plan: "",
  npcs: [],
  gmNotes: "",
  outcome: "",
  status: "planned",
});

export const GMStudio: React.FC<GMStudioProps> = (props) => {
  const { series } = props;
  const campaigns = series.campaigns ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(campaigns[0]?.id ?? null);
  const selected = campaigns.find((c) => c.id === selectedId) ?? null;

  const setCampaigns = (next: Campaign[]) => props.onChange({ ...series, campaigns: next });
  const updateCampaign = (id: string, patch: Partial<Campaign>) =>
    setCampaigns(campaigns.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: Date.now() } : c)));
  const updateScene = (cid: string, sid: string, patch: Partial<CampaignScene>) => {
    const c = campaigns.find((x) => x.id === cid);
    if (!c) return;
    updateCampaign(cid, { scenes: c.scenes.map((s) => (s.id === sid ? { ...s, ...patch } : s)) });
  };

  const addCampaign = () => {
    const c = blankCampaign(campaigns.length + 1);
    setCampaigns([...campaigns, c]);
    setSelectedId(c.id);
  };
  const deleteCampaign = (id: string) => {
    if (!confirm("Delete this campaign? Forged comics are kept.")) return;
    const next = campaigns.filter((c) => c.id !== id);
    setCampaigns(next);
    setSelectedId(next[0]?.id ?? null);
  };

  const setStatus = (charId: string, status: CharacterStatus) =>
    props.onChange({
      ...series,
      cast: series.cast.map((c) => (c.id === charId ? { ...c, status } : c)),
    });

  const toggleCasualty = (cid: string, charId: string) => {
    const c = campaigns.find((x) => x.id === cid);
    if (!c) return;
    const has = c.casualties.includes(charId);
    updateCampaign(cid, {
      casualties: has ? c.casualties.filter((x) => x !== charId) : [...c.casualties, charId],
    });
    if (series.permadeath) setStatus(charId, has ? "alive" : "fallen");
  };

  const pcs = series.cast.filter((c) => c.role === "hero");
  const forgedIssues = (c: Campaign) =>
    c.forgedIssueIds.map((id) => series.issues.find((i) => i.id === id)).filter(Boolean) as Series["issues"];

  const StatusPill: React.FC<{ c: Character }> = ({ c }) => {
    const st = (c.status ?? "alive") as CharacterStatus;
    const color = st === "alive" ? "bg-green-300" : st === "fallen" ? "bg-red-300" : "bg-gray-300";
    return <span className={`text-[10px] font-bold border border-black px-1 ${color}`}>{STATUS_LABELS[st]}</span>;
  };

  return (
    <div className="fixed inset-0 z-[150] overflow-y-auto bg-[#1a1206] text-white">
      <div className="min-h-full p-4 md:p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
          <button onClick={props.onBack} className="comic-btn bg-white text-black px-3 py-1 text-sm">← Library</button>
          <div className="text-center">
            <h1 className="font-comic text-4xl text-amber-400" style={{ textShadow: "2px 2px 0 black" }}>GM CAMPAIGN STUDIO</h1>
            <p className="text-amber-200/70 text-sm">{series.title}</p>
          </div>
          <button onClick={props.onEditRoster} className="comic-btn bg-amber-400 text-black px-3 py-1 text-sm">Edit Party / Settings</button>
        </div>

        <div className="grid md:grid-cols-[280px_1fr] gap-5">
          {/* LEFT: party + campaign list */}
          <div className="space-y-5">
            {/* Party */}
            <div className="bg-black/40 border-2 border-amber-700 p-3">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-comic text-xl text-amber-300">THE PARTY</h2>
                <label className="flex items-center gap-1 text-xs cursor-pointer">
                  <input type="checkbox" checked={!!series.permadeath} onChange={(e) => props.onChange({ ...series, permadeath: e.target.checked })} />
                  Permadeath
                </label>
              </div>
              {pcs.length === 0 && <p className="text-xs text-amber-200/60">No player characters yet. Use "Edit Party".</p>}
              <div className="space-y-2">
                {pcs.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 bg-black/30 p-1.5 border border-amber-900">
                    {c.portrait ? <img src={`data:image/jpeg;base64,${c.portrait}`} className="w-9 h-9 object-cover border border-black" /> : <div className="w-9 h-9 bg-gray-700" />}
                    <div className="flex-1 min-w-0">
                      <div className="font-comic leading-none truncate">{c.name}</div>
                      <div className="text-[10px] text-amber-200/70 truncate">{c.player ? `Played by ${c.player}` : c.charClass}</div>
                    </div>
                    <select value={c.status ?? "alive"} onChange={(e) => setStatus(c.id, e.target.value as CharacterStatus)}
                      className="bg-black text-white text-[10px] border border-amber-700">
                      {(["alive", "fallen", "retired"] as CharacterStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Campaign list */}
            <div className="bg-black/40 border-2 border-amber-700 p-3">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-comic text-xl text-amber-300">CAMPAIGNS</h2>
                <button onClick={addCampaign} className="comic-btn bg-green-500 text-black text-xs px-2 py-1">+ New</button>
              </div>
              {campaigns.length === 0 && <p className="text-xs text-amber-200/60">Create your first campaign to begin prepping.</p>}
              <div className="space-y-1">
                {campaigns.map((c) => (
                  <button key={c.id} onClick={() => setSelectedId(c.id)}
                    className={`w-full text-left px-2 py-1 border ${selectedId === c.id ? "bg-amber-400 text-black border-black" : "bg-black/30 border-amber-900"}`}>
                    <div className="font-comic leading-none">{c.title}</div>
                    <div className="text-[10px] opacity-70">{RESULT_LABELS[c.result]} · {c.scenes.length} scenes</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT: campaign editor */}
          <div>
            {!selected ? (
              <div className="bg-black/40 border-2 border-amber-700 p-10 text-center text-amber-200/70">
                <p className="font-comic text-2xl mb-2">Select or create a campaign</p>
                <p className="text-sm">Prep your scenes, run your session, jot what really happened — then forge it into a comic.</p>
              </div>
            ) : (
              <div className="bg-black/40 border-2 border-amber-700 p-4 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <input value={selected.title} onChange={(e) => updateCampaign(selected.id, { title: e.target.value })}
                    className="bg-transparent border-b-2 border-amber-700 font-comic text-2xl text-amber-300 flex-1" />
                  <button onClick={() => deleteCampaign(selected.id)} className="comic-btn bg-red-400 text-black text-xs px-2 py-1">Delete</button>
                </div>

                <div>
                  <label className="text-xs uppercase text-amber-300 font-bold">Premise</label>
                  <textarea value={selected.premise} onChange={(e) => updateCampaign(selected.id, { premise: e.target.value })}
                    className="w-full bg-black/40 border border-amber-800 p-2 text-sm h-16 resize-none" placeholder="The hook that pulls the party in..." />
                </div>

                {/* Scenes */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs uppercase text-amber-300 font-bold">Scenes / Encounters</label>
                    <button onClick={() => updateCampaign(selected.id, { scenes: [...selected.scenes, blankScene(selected.scenes.length + 1)] })}
                      className="comic-btn bg-green-500 text-black text-xs px-2 py-0.5">+ Scene</button>
                  </div>
                  <div className="space-y-3">
                    {selected.scenes.map((s, i) => (
                      <div key={s.id} className="border border-amber-800 bg-black/30 p-2">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-comic text-amber-400">{i + 1}.</span>
                          <input value={s.title} onChange={(e) => updateScene(selected.id, s.id, { title: e.target.value })}
                            className="flex-1 bg-transparent border-b border-amber-800 font-comic" />
                          <select value={s.status} onChange={(e) => updateScene(selected.id, s.id, { status: e.target.value as any })}
                            className="bg-black text-xs border border-amber-700">
                            <option value="planned">Planned</option>
                            <option value="played">Played</option>
                          </select>
                          <button onClick={() => updateCampaign(selected.id, { scenes: selected.scenes.filter((x) => x.id !== s.id) })}
                            className="text-red-400 text-xs px-1">✕</button>
                        </div>
                        <textarea value={s.plan} onChange={(e) => updateScene(selected.id, s.id, { plan: e.target.value })}
                          className="w-full bg-black/40 border border-amber-900 p-1.5 text-xs h-12 resize-none mb-1" placeholder="PLAN: what you intend to happen" />
                        <input value={s.npcs.join(", ")} onChange={(e) => updateScene(selected.id, s.id, { npcs: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })}
                          className="w-full bg-black/40 border border-amber-900 p-1.5 text-xs mb-1" placeholder="NPCs / cast involved (comma separated)" />
                        <textarea value={s.gmNotes} onChange={(e) => updateScene(selected.id, s.id, { gmNotes: e.target.value })}
                          className="w-full bg-black/40 border border-purple-900 p-1.5 text-xs h-10 resize-none mb-1" placeholder="🔒 Secret GM notes (never shown in the comic)" />
                        <textarea value={s.outcome} onChange={(e) => updateScene(selected.id, s.id, { outcome: e.target.value })}
                          className={`w-full border p-1.5 text-xs h-14 resize-none ${s.status === "played" ? "bg-green-950 border-green-700" : "bg-black/40 border-amber-900"}`}
                          placeholder="WHAT ACTUALLY HAPPENED (the true story the comic will tell)" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Result */}
                <div className="grid sm:grid-cols-2 gap-3 border-t border-amber-800 pt-3">
                  <div>
                    <label className="text-xs uppercase text-amber-300 font-bold">Campaign Result</label>
                    <select value={selected.result} onChange={(e) => updateCampaign(selected.id, { result: e.target.value as CampaignResult })}
                      className="w-full bg-black/40 border border-amber-800 p-2 text-sm">
                      {(Object.keys(RESULT_LABELS) as CampaignResult[]).map((r) => <option key={r} value={r}>{RESULT_LABELS[r]}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs uppercase text-amber-300 font-bold">Fallen Heroes {series.permadeath ? "(permadeath on)" : ""}</label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {pcs.map((c) => (
                        <button key={c.id} onClick={() => toggleCasualty(selected.id, c.id)}
                          className={`text-xs border px-1.5 py-0.5 ${selected.casualties.includes(c.id) ? "bg-red-500 text-white border-black" : "bg-black/40 border-amber-800"}`}>
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <textarea value={selected.resultNotes} onChange={(e) => updateCampaign(selected.id, { resultNotes: e.target.value })}
                  className="w-full bg-black/40 border border-amber-800 p-2 text-sm h-14 resize-none" placeholder="The true ending, in your words..." />

                {/* Forge */}
                <div className="flex flex-wrap items-center gap-3 border-t border-amber-800 pt-3">
                  <button onClick={() => props.onForge(selected.id)} disabled={pcs.length === 0}
                    className="comic-btn bg-red-600 text-white px-5 py-3 font-comic text-xl uppercase disabled:bg-gray-600">
                    ⚒️ Forge the True Story
                  </button>
                  <p className="text-xs text-amber-200/60 flex-1 min-w-[180px]">Turns this campaign into a comic issue that faithfully retells what your group lived through.</p>
                </div>

                {forgedIssues(selected).length > 0 && (
                  <div className="border-t border-amber-800 pt-3">
                    <label className="text-xs uppercase text-amber-300 font-bold">Forged Comics</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {forgedIssues(selected).map((iss) => (
                        <button key={iss.id} onClick={() => props.onOpenIssue(iss.id)} className="comic-btn bg-amber-400 text-black text-xs px-3 py-1">
                          📖 {iss.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
