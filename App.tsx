/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from "react";
import jsPDF from "jspdf";
import {
  AudioConfig,
  ComicFace,
  DECISION_PAGES,
  defaultAudio,
  defaultProvider,
  Issue,
  MAX_STORY_PAGES,
  Series,
  SeriesSummary,
  TONES,
  LANGUAGES,
  uid,
} from "./types";
import { Setup } from "./Setup";
import { Book } from "./Book";
import { Home } from "./Home";
import { GMStudio } from "./GMStudio";
import { useApiKey } from "./useApiKey";
import { ApiKeyDialog } from "./ApiKeyDialog";
import {
  buildCampaignCanon,
  EngineContext,
  generateBeat,
  generatePanelImage,
  generatePortrait,
  isAuthError,
  summarizeIssue,
} from "./engine";
import {
  deleteSeries,
  listSeries,
  loadSeries,
  saveSeries,
} from "./storage";
import { narrate, startMusic, stopMusic, stopNarration } from "./audio";

type Screen = "home" | "setup" | "reader" | "gm";

const newSeries = (): Series => ({
  id: uid(),
  title: "Untitled Saga",
  cast: [],
  settings: {
    style: "Classic Comic",
    setting: "A bustling fantasy city on the edge of adventure",
    audience: "kids",
    language: LANGUAGES[0].code,
    tone: TONES[6],
    novelMode: false,
  },
  safeMode: true,
  provider: defaultProvider(),
  issues: [],
  gmMode: false,
  permadeath: false,
  campaigns: [],
  audio: defaultAudio(),
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

// Build the page layout for a fresh issue. True-story (campaign) issues skip
// the branching decision pages so the comic tells exactly what happened.
const buildIssueFaces = (issueNumber: number, withDecisions: boolean): ComicFace[] => {
  const hasRecap = issueNumber > 1;
  const faces: ComicFace[] = [];
  let idx = 0;
  faces.push({ id: `i${issueNumber}-cover`, type: "cover", choices: [], isLoading: true, pageIndex: idx++ });
  if (hasRecap)
    faces.push({ id: `i${issueNumber}-recap`, type: "recap", choices: [], isLoading: true, pageIndex: idx++ });
  for (let b = 1; b <= MAX_STORY_PAGES; b++) {
    faces.push({
      id: `i${issueNumber}-p${b}`,
      type: "story",
      choices: [],
      isLoading: false,
      pageIndex: idx++,
      beatNum: b,
      isDecisionPage: withDecisions && DECISION_PAGES.includes(b),
    });
  }
  faces.push({ id: `i${issueNumber}-back`, type: "back_cover", choices: [], isLoading: true, pageIndex: idx++ });
  return faces;
};

const App: React.FC = () => {
  const { validateApiKey, setShowApiKeyDialog, showApiKeyDialog, handleApiKeyDialogContinue } = useApiKey();

  const [screen, setScreen] = useState<Screen>("home");
  const [library, setLibrary] = useState<SeriesSummary[]>([]);
  const [series, setSeries] = useState<Series>(newSeries());
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const [comicFaces, setComicFaces] = useState<ComicFace[]>([]);
  const [currentSheetIndex, setCurrentSheetIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Refs for use inside async generation closures.
  const seriesRef = useRef<Series>(series);
  const facesRef = useRef<ComicFace[]>([]);
  const activeIssueRef = useRef<string | null>(null);
  const generatingBeats = useRef<Set<number>>(new Set());

  seriesRef.current = series;
  activeIssueRef.current = activeIssueId;

  const audioCfg: AudioConfig = series.audio ?? defaultAudio();

  useEffect(() => {
    setLibrary(listSeries());
  }, []);

  // ----- Audio: music underscore while reading -----
  useEffect(() => {
    if (screen === "reader" && audioCfg.music !== "off") startMusic(audioCfg);
    else stopMusic();
    return () => stopMusic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, audioCfg.music]);

  // ----- Audio: narrate the page you just turned to -----
  useEffect(() => {
    if (screen !== "reader") {
      stopNarration();
      return;
    }
    if (audioCfg.tts === "off") {
      stopNarration();
      return;
    }
    const ordered = [...comicFaces].sort((a, b) => (a.pageIndex || 0) - (b.pageIndex || 0));
    const face = ordered[currentSheetIndex * 2];
    const text = `${face?.narrative?.caption || ""}. ${face?.narrative?.dialogue || ""}`.trim();
    if (text.length > 2) narrate(text, audioCfg, series.settings.language);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSheetIndex, screen]);

  useEffect(() => () => { stopNarration(); stopMusic(); }, []);

  // ----- Engine context -----
  const buildCtx = (issueNumber: number): EngineContext => {
    const s = seriesRef.current;
    const issue = s.issues.find((i) => i.id === activeIssueRef.current);
    const campaign = issue?.sourceCampaignId
      ? s.campaigns?.find((c) => c.id === issue.sourceCampaignId)
      : undefined;
    const priorSynopses = s.issues
      .filter((i) => i.number < issueNumber && i.synopsis)
      .sort((a, b) => a.number - b.number)
      .map((i) => i.synopsis as string);
    return {
      series: s,
      priorSynopses,
      issueNumber,
      campaignCanon: campaign ? buildCampaignCanon(s, campaign) : undefined,
    };
  };

  const handleAuth = (e: unknown, isGeminiCall = true) => {
    // Only the Gemini key dialog is relevant for Gemini calls. Errors from a
    // local/OpenAI text provider shouldn't pop the Gemini paywall dialog.
    if (isGeminiCall && isAuthError(e)) setShowApiKeyDialog(true);
  };

  // ----- Face state helpers -----
  const updateFace = (id: string, updates: Partial<ComicFace>) => {
    setComicFaces((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
    const i = facesRef.current.findIndex((f) => f.id === id);
    if (i !== -1) facesRef.current[i] = { ...facesRef.current[i], ...updates };
  };

  const persist = async (extra?: Partial<Issue>) => {
    const s = seriesRef.current;
    const issueId = activeIssueRef.current;
    if (!issueId) {
      await saveSeries(s);
      setLibrary(listSeries());
      return;
    }
    const issues = s.issues.map((i) =>
      i.id === issueId
        ? { ...i, faces: [...facesRef.current], updatedAt: Date.now(), ...extra }
        : i,
    );
    const updated = { ...s, issues };
    seriesRef.current = updated;
    setSeries(updated);
    await saveSeries(updated);
    setLibrary(listSeries());
  };

  // ----- Generation -----
  const currentIssue = (): Issue | undefined =>
    seriesRef.current.issues.find((i) => i.id === activeIssueRef.current);
  const currentIssueNumber = (): number => currentIssue()?.number ?? 1;

  const beatHistory = (beforeBeat: number) =>
    facesRef.current
      .filter((f) => f.type === "story" && f.narrative && (f.beatNum || 0) < beforeBeat)
      .map((f) => ({
        pageIndex: f.beatNum || 0,
        beat: f.narrative!,
        resolvedChoice: f.resolvedChoice,
      }));

  const generateStoryBeat = async (face: ComicFace) => {
    const beatNum = face.beatNum!;
    const ctx = buildCtx(currentIssueNumber());
    const textIsGemini = seriesRef.current.provider.textProvider === "gemini";
    updateFace(face.id, { isLoading: true });
    // Phase 1: write the beat (may use a non-Gemini text provider).
    let beat;
    try {
      beat = await generateBeat(ctx, {
        history: beatHistory(beatNum),
        pageNum: beatNum,
        isDecisionPage: !!face.isDecisionPage,
      });
    } catch (e) {
      handleAuth(e, textIsGemini);
      updateFace(face.id, { isLoading: false, error: true });
      return;
    }
    updateFace(face.id, { narrative: beat, choices: beat.choices });
    // Phase 2: draw the panel (always Gemini).
    try {
      const url = await generatePanelImage(ctx, beat, "story");
      updateFace(face.id, { imageUrl: url, isLoading: false, error: !url });
    } catch (e) {
      handleAuth(e, true);
      updateFace(face.id, { isLoading: false, error: true });
    }
  };

  const generateFrom = async (start: number) => {
    for (let b = start; b <= MAX_STORY_PAGES; b++) {
      if (generatingBeats.current.has(b)) continue;
      const face = facesRef.current.find((f) => f.type === "story" && f.beatNum === b);
      if (!face) continue;
      if (face.imageUrl) {
        if (face.isDecisionPage && !face.resolvedChoice) break;
        continue;
      }
      generatingBeats.current.add(b);
      try {
        await generateStoryBeat(face);
      } finally {
        generatingBeats.current.delete(b);
      }
      await persist();
      if (face.isDecisionPage) break;
    }
    await maybeFinishIssue();
    await persist();
  };

  const generateCover = async () => {
    const ctx = buildCtx(currentIssueNumber());
    const cover = facesRef.current.find((f) => f.type === "cover");
    if (!cover) return;
    try {
      const url = await generatePanelImage(ctx, { scene: "", choices: [] }, "cover");
      updateFace(cover.id, { imageUrl: url, isLoading: false, error: !url });
    } catch (e) {
      handleAuth(e);
      updateFace(cover.id, { isLoading: false, error: true });
    }
  };

  const generateRecap = async () => {
    const ctx = buildCtx(currentIssueNumber());
    const recap = facesRef.current.find((f) => f.type === "recap");
    if (!recap) return;
    const text = ctx.priorSynopses.length
      ? ctx.priorSynopses[ctx.priorSynopses.length - 1]
      : "Our heroes' journey continues...";
    try {
      const url = await generatePanelImage(ctx, { scene: "", choices: [] }, "recap");
      updateFace(recap.id, { imageUrl: url, recapText: text, isLoading: false });
    } catch (e) {
      handleAuth(e);
      updateFace(recap.id, { recapText: text, isLoading: false, error: true });
    }
  };

  const maybeFinishIssue = async () => {
    const stories = facesRef.current.filter((f) => f.type === "story");
    const allDone = stories.length > 0 && stories.every((f) => f.imageUrl || f.error);
    if (!allDone) return;

    const back = facesRef.current.find((f) => f.type === "back_cover");
    const ctx = buildCtx(currentIssueNumber());

    const issue = currentIssue();
    if (issue && !issue.synopsis) {
      try {
        const synopsis = await summarizeIssue(
          ctx,
          stories
            .filter((f) => f.narrative)
            .map((f) => ({
              pageIndex: f.beatNum || 0,
              beat: f.narrative!,
              resolvedChoice: f.resolvedChoice,
            })),
        );
        if (synopsis) await persist({ synopsis, status: "complete" });
      } catch (e) {
        handleAuth(e, seriesRef.current.provider.textProvider === "gemini");
      }
    }

    if (back && !back.imageUrl && !back.error) {
      try {
        const url = await generatePanelImage(ctx, { scene: "", choices: [] }, "back_cover");
        updateFace(back.id, { imageUrl: url, isLoading: false, error: !url });
      } catch (e) {
        handleAuth(e);
        updateFace(back.id, { isLoading: false, error: true });
      }
    }
  };

  // ----- Launching issues -----
  const launchIssue = async (issueNumber: number, withDecisions: boolean) => {
    const faces = buildIssueFaces(issueNumber, withDecisions);
    facesRef.current = faces;
    generatingBeats.current.clear();
    setComicFaces(faces);
    setCurrentSheetIndex(0);
    setScreen("reader");
    setIsTransitioning(false);

    generateCover();
    if (issueNumber > 1) generateRecap();
    await generateFrom(1);
  };

  const startNewSaga = async () => {
    const s = seriesRef.current;
    if (s.cast.filter((c) => c.role === "hero").length === 0) {
      alert("Add at least one Hero before starting.");
      return;
    }
    // GM mode: prep campaigns first, forge comics later.
    if (s.gmMode) {
      await saveSeries(s);
      setLibrary(listSeries());
      setActiveIssueId(null);
      activeIssueRef.current = null;
      setScreen("gm");
      return;
    }
    // Editing an existing saga (already has issues): save and resume reading
    // the latest issue rather than creating a duplicate Issue #1.
    if (s.issues.length > 0) {
      await saveSeries(s);
      setLibrary(listSeries());
      const latest = [...s.issues].sort((a, b) => b.number - a.number)[0];
      openIssue(s, latest.id);
      return;
    }
    const hasKey = await validateApiKey();
    if (!hasKey) return;
    setIsTransitioning(true);
    const issueId = uid();
    const issue: Issue = {
      id: issueId, number: 1, title: `${s.title} — Issue #1`,
      faces: [], choiceLog: [], status: "generating",
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    const updated: Series = { ...s, issues: [issue] };
    seriesRef.current = updated;
    setSeries(updated);
    setActiveIssueId(issueId);
    activeIssueRef.current = issueId;
    await saveSeries(updated);
    setTimeout(() => launchIssue(1, true), 1000);
  };

  const nextIssueNumber = (s: Series) => Math.max(0, ...s.issues.map((i) => i.number)) + 1;

  const startNextIssue = async () => {
    const hasKey = await validateApiKey();
    if (!hasKey) return;
    const s = seriesRef.current;
    const number = nextIssueNumber(s);
    const issueId = uid();
    const issue: Issue = {
      id: issueId, number, title: `${s.title} — Issue #${number}`,
      faces: [], choiceLog: [], status: "generating",
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    const updated: Series = { ...s, issues: [...s.issues, issue] };
    seriesRef.current = updated;
    setSeries(updated);
    setActiveIssueId(issueId);
    activeIssueRef.current = issueId;
    await saveSeries(updated);
    launchIssue(number, true);
  };

  // ----- GM: forge a true-story issue from a campaign -----
  const forgeCampaignIssue = async (campaignId: string) => {
    const hasKey = await validateApiKey();
    if (!hasKey) return;
    const s = seriesRef.current;
    const campaign = s.campaigns?.find((c) => c.id === campaignId);
    if (!campaign) return;
    const number = nextIssueNumber(s);
    const issueId = uid();
    const issue: Issue = {
      id: issueId, number,
      title: `${campaign.title} (Issue #${number})`,
      faces: [], choiceLog: [], status: "generating",
      sourceCampaignId: campaignId,
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    // Apply permadeath: campaign casualties become fallen on the roster.
    const cast = s.permadeath
      ? s.cast.map((c) => (campaign.casualties.includes(c.id) ? { ...c, status: "fallen" as const } : c))
      : s.cast;
    const campaigns = (s.campaigns ?? []).map((c) =>
      c.id === campaignId ? { ...c, forgedIssueIds: [...c.forgedIssueIds, issueId] } : c,
    );
    const updated: Series = { ...s, cast, campaigns, issues: [...s.issues, issue] };
    seriesRef.current = updated;
    setSeries(updated);
    setActiveIssueId(issueId);
    activeIssueRef.current = issueId;
    await saveSeries(updated);
    launchIssue(number, false); // true-story: no branching
  };

  const openIssue = (s: Series, issueId: string) => {
    const issue = s.issues.find((i) => i.id === issueId);
    if (!issue) return;
    seriesRef.current = s;
    setSeries(s);
    setActiveIssueId(issueId);
    activeIssueRef.current = issueId;
    const faces = issue.faces.length
      ? issue.faces
      : buildIssueFaces(issue.number, !issue.sourceCampaignId);
    facesRef.current = faces.map((f) => ({ ...f }));
    setComicFaces(facesRef.current);
    setCurrentSheetIndex(0);
    setScreen("reader");
    const firstMissing = facesRef.current.find((f) => f.type === "story" && !f.imageUrl && !f.error);
    if (firstMissing) generateFrom(firstMissing.beatNum || 1);
  };

  // ----- Reader interactions -----
  const handleChoice = async (beatNum: number, choice: string) => {
    updateFace(`i${currentIssueNumber()}-p${beatNum}`, { resolvedChoice: choice });
    const next = beatNum + 1;
    await persist();
    if (next <= MAX_STORY_PAGES) generateFrom(next);
  };

  const regenerateFace = async (beatNum: number, caption: string, dialogue: string) => {
    const face = facesRef.current.find((f) => f.beatNum === beatNum);
    if (!face || !face.narrative) return;
    const newBeat = { ...face.narrative, caption, dialogue };
    updateFace(face.id, { isLoading: true, narrative: newBeat });
    try {
      const url = await generatePanelImage(buildCtx(currentIssueNumber()), newBeat, "story");
      updateFace(face.id, { imageUrl: url, isLoading: false });
      await persist();
    } catch (e) {
      handleAuth(e);
      updateFace(face.id, { isLoading: false });
    }
  };

  const handleSheetClick = (index: number) => {
    const sheetCount = Math.ceil(comicFaces.length / 2);
    if (index < currentSheetIndex) setCurrentSheetIndex(index);
    else if (index === currentSheetIndex && index < sheetCount) setCurrentSheetIndex((p) => p + 1);
  };

  // ----- Audio toggles (reader toolbar) -----
  const toggleNarration = () => {
    const cur = series.audio ?? defaultAudio();
    const tts = cur.tts === "off" ? (cur.elevenApiKey ? "elevenlabs" : "local") : "off";
    const updated = { ...series, audio: { ...cur, tts } as AudioConfig };
    seriesRef.current = updated;
    setSeries(updated);
    if (tts === "off") stopNarration();
  };
  const toggleMusic = () => {
    const cur = series.audio ?? defaultAudio();
    const music = cur.music === "off" ? "ambient" : "off";
    const updated = { ...series, audio: { ...cur, music } as AudioConfig };
    seriesRef.current = updated;
    setSeries(updated);
  };

  // ----- Library / navigation actions -----
  const goHome = async () => {
    if (activeIssueRef.current) await persist();
    stopNarration();
    stopMusic();
    setScreen("home");
    setLibrary(listSeries());
  };

  const goStudio = async () => {
    if (activeIssueRef.current) await persist();
    stopNarration();
    stopMusic();
    setActiveIssueId(null);
    activeIssueRef.current = null;
    setScreen("gm");
  };

  const createSaga = () => {
    const fresh = newSeries();
    seriesRef.current = fresh;
    setSeries(fresh);
    setActiveIssueId(null);
    activeIssueRef.current = null;
    setScreen("setup");
  };

  const openSaga = async (id: string) => {
    const s = await loadSeries(id);
    if (!s) { alert("Could not load that saga."); return; }
    seriesRef.current = s;
    setSeries(s);
    if (s.gmMode) {
      setActiveIssueId(null);
      activeIssueRef.current = null;
      setScreen("gm");
      return;
    }
    const latest = [...s.issues].sort((a, b) => b.number - a.number)[0];
    if (latest) openIssue(s, latest.id);
    else { setActiveIssueId(null); activeIssueRef.current = null; setScreen("setup"); }
  };

  // Edit an existing saga's roster/world/engine settings (route back to Setup).
  const editSaga = async (id: string) => {
    const s = await loadSeries(id);
    if (!s) { alert("Could not load that saga."); return; }
    seriesRef.current = s;
    setSeries(s);
    setActiveIssueId(null);
    activeIssueRef.current = null;
    setScreen("setup");
  };

  const removeSaga = async (id: string) => {
    await deleteSeries(id);
    setLibrary(listSeries());
  };

  const onGeneratePortrait = async (description: string): Promise<string | null> => {
    const hasKey = await validateApiKey();
    if (!hasKey) return null;
    try {
      return await generatePortrait(buildCtx(1), description);
    } catch (e) {
      handleAuth(e);
      alert("Portrait generation failed. Check your API key, or upload a photo instead.");
      return null;
    }
  };

  // GMStudio / Setup change handler. Updates state immediately and persists on
  // a short debounce so per-keystroke edits don't hammer IndexedDB.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSeriesChange = (s: Series) => {
    seriesRef.current = s;
    setSeries(s);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveSeries(seriesRef.current).then(() => setLibrary(listSeries()));
    }, 700);
  };

  // ----- Export -----
  const downloadPDF = () => {
    const W = 480, H = 720;
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: [W, H] });
    const pages = facesRef.current
      .filter((f) => f.imageUrl && !f.isLoading)
      .sort((a, b) => (a.pageIndex || 0) - (b.pageIndex || 0));
    pages.forEach((face, i) => {
      if (i > 0) doc.addPage([W, H], "portrait");
      if (face.imageUrl) doc.addImage(face.imageUrl, "JPEG", 0, 0, W, H);
    });
    doc.save(`${seriesRef.current.title.replace(/\s+/g, "-")}-Issue-${currentIssueNumber()}.pdf`);
  };

  // ----- Derived UI flags -----
  const activeIssue = series.issues.find((i) => i.id === activeIssueId);
  const issueComplete =
    comicFaces.length > 0 &&
    comicFaces.filter((f) => f.type === "story").every((f) => f.imageUrl || f.error);
  const inGmIssue = !!activeIssue?.sourceCampaignId;

  return (
    <div className="comic-scene">
      {showApiKeyDialog && <ApiKeyDialog onContinue={handleApiKeyDialogContinue} />}

      {screen === "home" && (
        <Home library={library} onCreate={createSaga} onOpen={openSaga} onEdit={editSaga} onDelete={removeSaga} />
      )}

      {screen === "setup" && (
        <Setup
          series={series}
          isTransitioning={isTransitioning}
          onChange={onSeriesChange}
          onGeneratePortrait={onGeneratePortrait}
          onLaunch={startNewSaga}
          onBack={goHome}
          crossoverSources={library.filter((s) => s.id !== series.id).map((s) => ({ id: s.id, title: s.title }))}
          loadCrossoverCast={async (id) => (await loadSeries(id))?.cast ?? []}
        />
      )}

      {screen === "gm" && (
        <GMStudio
          series={series}
          onChange={onSeriesChange}
          onForge={forgeCampaignIssue}
          onOpenIssue={(issueId) => openIssue(seriesRef.current, issueId)}
          onBack={goHome}
          onEditRoster={() => setScreen("setup")}
        />
      )}

      {screen === "reader" && (
        <>
          <div className="reader-toolbar">
            <button className="comic-btn bg-white text-black px-3 py-1 text-sm" onClick={inGmIssue ? goStudio : goHome}>
              {inGmIssue ? "← Studio" : "← Library"}
            </button>
            <span className="reader-title font-comic">
              {series.title} · {activeIssue?.sourceCampaignId ? activeIssue.title : `Issue #${activeIssue?.number ?? 1}`}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={toggleNarration} title="Narration (read aloud)"
                className={`comic-btn px-2 py-1 text-sm ${audioCfg.tts !== "off" ? "bg-green-400" : "bg-white"} text-black`}>
                {audioCfg.tts !== "off" ? "🔊" : "🔇"}
              </button>
              <button onClick={toggleMusic} title="Background music"
                className={`comic-btn px-2 py-1 text-sm ${audioCfg.music !== "off" ? "bg-green-400" : "bg-white"} text-black`}>
                ♪
              </button>
              {!inGmIssue && (
                <button className="comic-btn bg-yellow-400 text-black px-3 py-1 text-sm disabled:opacity-50"
                  onClick={startNextIssue} disabled={!issueComplete}
                  title={issueComplete ? "Continue the saga" : "Finish this issue first"}>
                  + Next Issue
                </button>
              )}
            </div>
          </div>

          <Book
            comicFaces={comicFaces}
            currentSheetIndex={currentSheetIndex}
            isStarted={true}
            isSetupVisible={false}
            onSheetClick={handleSheetClick}
            onChoice={handleChoice}
            onOpenBook={() => setCurrentSheetIndex(1)}
            onDownload={downloadPDF}
            onReset={inGmIssue ? goStudio : startNextIssue}
            onRegenerateFace={regenerateFace}
          />
        </>
      )}
    </div>
  );
};

export default App;
