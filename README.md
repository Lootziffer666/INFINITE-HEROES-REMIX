<div align="center">

# 🎵 The Bard's Song 🎵
### A multi-issue comic-saga creator where *you* are the star

</div>

Turn photos of your party into an ongoing, character-consistent comic book
series. Built for families and tabletop groups — imagine your D&D campaign
retold as a real comic where every hero looks like a real player.

## ✨ What it does

- **Multi-issue sagas** — create Issue #1, #2, #3... Each new issue opens with a
  "Previously..." recap and remembers the canon of every issue before it.
- **GM Campaign Mode** — a full Game Master workspace (see below).
- **Full party roster** — add as many Heroes, Allies and Villains as you like
  (not just one of each). Perfect for a whole adventuring party.
- **Classic D&D ability scores** — STR / DEX / CON / INT / WIS / CHA, plus a
  class and backstory that flavour how each character is written.
- **Persistent character sheets** — player name, status (alive / fallen /
  retired), notes — carried across issues.
- **Cameos & cross-overs** — export characters as portable cards, or pull a hero
  straight from another saga so casts can guest-star across your comics.
- **Character consistency** — each character's portrait is reused as a
  reference image on every panel and across every issue, so faces stay stable.
- **Locked visual style** — pick one art style for the whole saga so issues
  look like they belong together.
- **Narrator personas (the "story bot")** — pick the voice that writes your
  comic, including the deadpan, escalating **"Lootzescalation"** persona.
- **Multi-LLM** — write the story with Gemini, OpenAI (or any OpenAI-compatible
  cloud like OpenRouter/Groq), or a fully local model.
- **Branching choices** — "What do you do?" decision pages steer the story, and
  the next pages are written *after* you choose.
- **Audio** — optional read-aloud narration and a background music underscore.
- **Safe Mode (default ON)** — see below.
- **Export** — download any issue as a PDF.
- **Saved automatically** — your sagas live in your browser (IndexedDB), so you
  can close the tab and come back later.

## 🎲 GM Campaign Mode

Turn on **Game Master Mode** and "Open Campaign Studio" instead of generating a
story right away. In the studio you can:

- Manage your **real group's player characters** (with the player's name and a
  live status: alive / fallen / retired).
- **Prep campaigns**: a premise plus scenes, each with a *plan*, the NPCs
  involved, and 🔒 *secret GM notes* that never appear in the comic.
- After the session, record **what actually happened** in each scene and set the
  **result** (Victory / Defeat / Bittersweet / Ongoing) and any **fallen heroes**.
- Press **"⚒️ Forge the True Story"** to generate a comic issue that faithfully
  dramatizes what your party really lived through — so the comics tell the
  *true* story, win or lose.
- With **Permadeath** on, characters who fell in a campaign stay fallen across
  the whole saga.

## 🤖 The Story Bot (narrator personas)

In *Step 2 · World* choose a **Narrator / Story Bot**. Give the saga a short
seed (a setting or premise) and the persona escalates it into a comic:

- **Classic Narrator** — balanced comic narration following your chosen tone.
- **Lootzescalation** — dry, offended, forensic first-person protocol. A banal
  start collapses, via watertight-but-insane domino logic, into a system
  catastrophe, lands on a sober core, and ends with an absurdly trivial demand.

## 🧠 Multi-LLM: Cloud, OpenAI-compatible, or Local

In *Step 3 · Engine & Safety* pick who writes the story (artwork stays on Gemini):

- **Gemini (Cloud)** — uses your app's Gemini key.
- **OpenAI / Compatible** — OpenAI or any OpenAI-compatible cloud (OpenRouter,
  Groq, Together, …). Set base URL + API key + model.
- **Local LLM (Private)** — an OpenAI-compatible endpoint on your own machine.

Example with [Ollama](https://ollama.com):

```bash
ollama pull llama3.1
ollama serve            # exposes an OpenAI-compatible API on :11434
```
Base URL `http://localhost:11434/v1`, model `llama3.1`, then **Test connection**.

## 🔊 Audio (optional)

- **Narration** — *Local* uses your browser's built-in voices (free, offline);
  *ElevenLabs* uses a high-quality cloud voice (needs key + voice id).
- **Music** — *Ambient* is a gentle, free, offline procedural underscore;
  *Lyria* is an experimental seam that currently falls back to ambient.
- Toggle both live from the reader toolbar (🔊 / ♪).

## 🛡️ Safety (made for kids)

Safe Mode is **on by default** and works in three layers:

1. **Input moderation** — everything you type (names, descriptions, world,
   premise) is screened. Disallowed content is blocked with a gentle message.
2. **Prompt guardrails** — the writer and artist are explicitly instructed to
   stay all-ages: no sexual content, no gore, no profanity; conflict is solved
   with cleverness, teamwork and heart.
3. **Output sanitisation** — a final scrub softens any stray rough language
   before it ever reaches the page.

The "Mature" rating is locked while Safe Mode is on. Safety is a heuristic
layer paired with the model's own filters — supervise young creators.

## 🧠 Story engine: Cloud or Local

In **Step 3 · Engine & Safety** you can choose who writes the story:

- **Gemini (Cloud)** — default. Highest quality.
- **Local LLM (Private)** — point it at any OpenAI-compatible endpoint and the
  story text is generated on your own hardware. Artwork still uses Gemini.

Example with [Ollama](https://ollama.com):

```bash
ollama pull llama3.1
ollama serve            # exposes an OpenAI-compatible API on :11434
```

Then set:
- Base URL: `http://localhost:11434/v1`
- Model: `llama3.1`

and press **Test connection**.

## 🚀 Run locally

**Prerequisites:** Node.js

1. `npm install`
2. Put your Gemini API key in `.env.local` as `GEMINI_API_KEY=...`
   (image generation always uses Gemini).
3. `npm run dev`
4. `npm test` runs the unit suite (safety, cameo, storage, engine, llm).

## 🗂️ Project structure

| File | Responsibility |
|------|----------------|
| `types.ts` | Data model: Character, Series, Issue, Campaign, settings, constants |
| `personas.ts` | Narrator personas / "story bot" voices (incl. Lootzescalation) |
| `safety.ts` | Input moderation, prompt guardrails, output scrub |
| `storage.ts` | IndexedDB persistence + lightweight library index |
| `llm.ts` | Multi-LLM text provider (Gemini / OpenAI-compatible / local) |
| `audio.ts` | Narration (TTS) + ambient music underscore |
| `engine.ts` | Generation: portraits, beats, panels, covers, recaps, campaign canon |
| `App.tsx` | Controller: Home / Setup / GM Studio / Reader + saga flow |
| `Home.tsx` | Library of saved sagas |
| `Setup.tsx` | Party roster + world + engine/safety/audio wizard |
| `GMStudio.tsx` | Game Master campaign prep + true-story forging |
| `Book.tsx` / `Panel.tsx` | The 3D flip-book reader |

## 🌟 Cameos & Cross-Overs

Characters are portable, self-contained cards, so heroes can guest-star across
your comics:

- **Export a cameo** (⤓ on any roster card) → a `.cameo.json` file.
- **Export the whole party** (⤓ Export Party) → a `.crossover.json` pack.
- **Import** a cameo or crossover file into any saga (★ Import Cameo).
- **Cross-over** (⚡) — pull characters **straight from another saved saga** in
  your library, no file needed. Guests are tagged with their origin saga, get a
  ★ GUEST badge, and the story treats them as special crossover appearances.

Imported files are treated as untrusted: only known fields are read, portraits
are size-capped, and all text passes through Safe Mode moderation.

## 🗺️ Roadmap

- **Cross-user cameos** — sharing cards/packs between different people's
  libraries (the file format already supports it; a sharing flow is next).
- **Prefab / purchasable D&D campaigns** — let GMs import ready-made campaign
  packs (a `Campaign` plus its NPC cards), building on the cameo/crossover
  import pattern.
- **Continued character sheets & character creator** — deeper progression.
- **Lyria real-time music** — full streaming underscore.


## 📄 License

Licensed under the **Apache License 2.0** — see [`LICENSE`](./LICENSE) and
[`NOTICE`](./NOTICE). This project began as a remix of a Google AI Studio
template (Apache-2.0) and has been substantially modified and extended.
Commercial use is permitted under the license; note that using the Gemini /
OpenAI / ElevenLabs APIs is additionally subject to those providers' own terms.


See [`ACCEPTABLE_USE.md`](./ACCEPTABLE_USE.md) for the content & acceptable-use
policy (you are responsible for your inputs/prompts; the App bundles no
third-party IP and is not affiliated with any game publisher).
