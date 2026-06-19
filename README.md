<div align="center">

# ⚡ INFINITE HEROES ⚡
### A multi-issue comic-saga creator where *you* are the star

</div>

Turn photos of your party into an ongoing, character-consistent comic book
series. Built for families and tabletop groups — imagine your D&D campaign
retold as a real comic where every hero looks like a real player.

## ✨ What it does

- **Multi-issue sagas** — create Issue #1, #2, #3... Each new issue opens with a
  "Previously..." recap and remembers the canon of every issue before it.
- **Full party roster** — add as many Heroes, Allies and Villains as you like
  (not just one of each). Perfect for a whole adventuring party.
- **Classic D&D ability scores** — STR / DEX / CON / INT / WIS / CHA, plus a
  class and backstory that flavour how each character is written.
- **Character consistency** — each character's portrait is reused as a
  reference image on every panel and across every issue, so faces stay stable.
- **Locked visual style** — pick one art style for the whole saga so issues
  look like they belong together.
- **Branching choices** — "What do you do?" decision pages steer the story, and
  the next pages are written *after* you choose.
- **Safe Mode (default ON)** — see below.
- **Local-LLM option** — write the story privately on your own machine.
- **Export** — download any issue as a PDF.
- **Saved automatically** — your sagas live in your browser (IndexedDB), so you
  can close the tab and come back later.

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

## 🗂️ Project structure

| File | Responsibility |
|------|----------------|
| `types.ts` | Data model: Character, Series, Issue, settings, constants |
| `safety.ts` | Input moderation, prompt guardrails, output scrub |
| `storage.ts` | IndexedDB persistence + lightweight library index |
| `llm.ts` | Text-provider abstraction (Gemini / local OpenAI-compatible) |
| `engine.ts` | Generation: portraits, beats, panels, covers, recaps |
| `App.tsx` | Controller: Home / Setup / Reader screens + saga flow |
| `Home.tsx` | Library of saved sagas |
| `Setup.tsx` | Party roster + world + engine/safety wizard |
| `Book.tsx` / `Panel.tsx` | The 3D flip-book reader |
