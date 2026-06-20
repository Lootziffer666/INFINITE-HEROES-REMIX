# Repo Audit — The Bard's Song

_Audit date: 2026-06-19_

A full review of the multi-issue comic-saga creator: build health, dependency
security, per-module logic, and a prioritised list of gaps with recommended
extensions. Fixes applied during this audit are marked **✅ Fixed**.

---

## 1. Verdict

The app is in good shape and **builds cleanly**. Architecture is well-separated
(`types` model, `engine`, `llm`, `safety`, `storage`, `audio`, `cameo`,
`personas` + screen components). No blocking issues remain.

| Check | Result |
|-------|--------|
| `tsc --noEmit` | ✅ clean |
| `vite build` | ✅ succeeds |
| `npm audit` | ✅ 0 vulnerabilities (was 1 critical) |
| Dead code / dangling refs | ✅ none |

> ⚠️ **Not verifiable here:** live model calls (Gemini image/text, OpenAI,
> ElevenLabs) were not exercised because no API keys are available in the audit
> sandbox. Logic and request shapes were reviewed statically. A manual smoke
> test with real keys is recommended before release.

---

## 2. Fixes applied in this audit

- ✅ **Critical dependency vuln**: `jspdf@3.0.3` had a critical advisory
  (path traversal / PDF injection / DoS). Upgraded to `jspdf@^4.2.1`
  (our usage — `addImage`/`addPage`/`save` — is unaffected by the breaking
  changes). `npm audit` now reports 0 vulnerabilities. Bumped in both
  `package.json` and the runtime `index.html` importmap.
- ✅ **Unused dependency removed**: `recharts` was declared but never imported.
  Removed from `package.json` and the importmap.
- ✅ **Backward-compatible load normalisation**: sagas saved by older builds
  predate the OpenAI provider fields, audio config, persona and campaigns.
  `storage.loadSeries` now merges in defaults so switching an old saga to the
  OpenAI provider (etc.) can't produce `undefined` URLs/fields.
- ✅ **Provider-aware auth dialog**: a text-generation error from a local/OpenAI
  provider no longer pops the *Gemini* API-key dialog. The beat pipeline now
  separates the (provider-specific) writing phase from the (always-Gemini)
  drawing phase so errors are attributed correctly.
- ✅ **Edit an existing saga**: there was no route back to Setup for a non-GM
  saga after creation (you could only read it). Added an ✎ edit button on the
  library cards. The launch button is now context-aware (“Save & Read” for an
  existing saga) so editing never creates a duplicate Issue #1.
- ✅ **Cleanups**: removed a misleading cover “PRINTING… x/2” counter, an unused
  `StatusPill` component, and unused imports.

---

## 3. Gap-closure pass (follow-up, 2026-06-19)

Most audited gaps are now closed. Status below.

### ✅ Closed

- **Automated tests** — added Vitest + jsdom + `fake-indexeddb`. 34 tests across
  `safety`, `cameo`, `engine.buildCampaignCanon`, `llm.extractJson`, and a
  full `storage` round-trip suite (split-store, targeted saves, delete,
  legacy normalisation). `npm test`.
- **Persistence scalability** — page artwork now lives in a separate IndexedDB
  `pages` store keyed by issue id. The hot save path (`saveActiveIssue`)
  rewrites only the current issue's pages + lightweight metadata; metadata-only
  edits use `persistMeta`. Backward compatible: legacy v1 records (inline faces)
  still load and migrate on next save.
- **Multi-issue browsing** — the reader toolbar now has an issue switcher
  (shown when a saga has >1 issue) to jump between back-issues; campaign-forged
  issues are marked with a ★.
- **Bundle size** — `manualChunks` splits `@google/genai`, `jspdf`, and React
  into separate chunks. Main app chunk dropped from ~958 KB to ~277 KB and the
  >500 KB warning is gone.
- **Audio autoplay** — the ambient context now calls `resume()` on start; music
  start is idempotent (StrictMode-safe).
- **Portrait MIME sniffing** — reference images now detect JPEG/PNG/GIF/WebP
  from the base64 magic prefix instead of assuming JPEG.
- **`isAuthError` tightening** — provider errors (`LLM HTTP …`) are no longer
  misread as a Gemini API-key problem.

### ◻ Still open (lower priority)

- **Lyria real-time music** — still an honest ambient fallback; full streaming
  client (WebSocket + AudioWorklet) is a dedicated follow-up.
- **Cross-user cameos** — the file format already supports it; only a sharing
  flow (upload/link) is missing.
- **Reader narration controls** — currently auto-reads the current page on turn;
  a play/pause-per-page control would be nicer.
- **Prefab / purchasable D&D campaigns (NEW idea, "later")** — let GMs import
  ready-made campaign packs. The `Campaign` model + the hardened cameo/crossover
  import pattern are a natural foundation (a campaign pack would be a
  `Campaign` + its NPC `Character` cards). Parked until prioritised.

---

## 4. Original gap list (for reference)

Prioritised. None are blocking; they are the sensible next investments.

### High value

1. **Persistence scalability.** The whole `Series` (every issue's base64 pages)
   is re-serialised to IndexedDB on each page completion and on debounced edits.
   For long sagas this grows O(total pages) per save.
   _Extension:_ store pages/issues as separate IndexedDB records keyed by id, or
   keep page images in a dedicated object store and only rewrite the touched
   issue.

2. **Multi-issue browsing for non-GM sagas.** Opening a saga jumps straight to
   the latest issue; there's no in-app issue picker/back-issues shelf.
   _Extension:_ an issue list (per saga) on a saga detail screen, reusing the
   library card style.

3. **Automated tests.** No test suite exists. The pure modules are very
   testable.
   _Extension:_ add Vitest unit tests for `safety.moderateInput/Fields`,
   `cameo.parseCameoData` (incl. malformed/oversized input), `llm.extractJson`,
   `engine.buildCampaignCanon`, and `storage.normalize`. (Not added now — tests
   are only added on request.)

### Medium value

4. **Lyria real-time music.** Currently an honest stub that falls back to the
   free ambient pad. _Extension:_ implement the Gemini Lyria streaming client
   (WebSocket + AudioWorklet PCM playback).

5. **Cross-user cameos.** The cameo/crossover file format already supports it;
   only a sharing flow (upload/link/QR) is missing.

6. **Bundle size.** Main chunk is ~930 KB (gzip ~265 KB) and Vite warns about
   the 500 KB threshold. _Extension:_ `manualChunks` to split `@google/genai`,
   `jspdf`, and the app, or lazy-load the PDF export path.

7. **Audio autoplay & StrictMode.** Music starts from an effect, so a browser
   may keep the `AudioContext` suspended until the first user gesture; in dev,
   StrictMode double-invokes effects. _Extension:_ call `audioCtx.resume()` on
   the first reader interaction and guard the effect against double-start.

### Low value / polish

8. **Portrait MIME type** is hard-coded to `image/jpeg` when sending reference
   images; PNG uploads still work in practice but detecting the real type is
   tidier.
9. **Reader narration** reads only the current sheet's front page on turn; a
   play/pause-per-page control and reading both visible pages would be nicer.
10. **`isAuthError`** is a heuristic string match; consider matching on
    structured error codes where the SDK exposes them.

---

## 5. Module notes

- **types.ts** — single source of truth; new fields are optional and
  default-safe, which is why old saves keep working. A few exported helpers
  (`heroes/allies/villains`, `isPlayable`, some page constants) are currently
  unused but harmless as a small public surface.
- **engine.ts** — solid prompt construction; party spotlight balancing,
  text-anchored character manifests, campaign canon, persona voice and guest
  stars are all threaded in. Falls back gracefully to a placeholder beat on
  parse failure.
- **safety.ts** — three-layer model (input moderation, prompt guardrails, output
  scrub). Heuristic by design; pairs with model-side safety. Reasonable for the
  kid-safe goal.
- **llm.ts** — clean multi-provider abstraction (Gemini / OpenAI-compatible /
  local) over one code path with optional bearer auth and a reachability probe.
- **cameo.ts** — untrusted import handling is hardened: fresh ids, portrait
  normalised to bare base64 + size cap, field-length clamps, pack-count cap, and
  caller-side Safe Mode moderation. No eval.
- **storage.ts** — IndexedDB for heavy data + a lean localStorage index with a
  quota-aware fallback; now normalises on load.
- **audio.ts** — local Web-Speech narration and a procedural ambient pad both
  work offline; ElevenLabs wired; Lyria stubbed honestly.

---

## 6. How to verify locally

```bash
npm install
npm test           # 34 unit tests (safety, cameo, engine, llm, storage)
echo "GEMINI_API_KEY=your_key" > .env.local
npm run build      # production build (chunked)
npm run dev        # manual smoke test (create a saga, generate an issue)
```
