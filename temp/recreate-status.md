# Recreation status — 2026-07-03 (session 2: web UI + CI)

## Done (green, offline, no API key)

`cd src && bun run test` runs four gates, all green:

| Gate | Result |
|---|---|
| `bun test packages` (unit) | 7 pass |
| Cucumber `@headless` | **163 scenarios passed** |
| Cucumber `@cli` | **116 scenarios passed** |
| Cucumber `@web` app scope (`test:web:app`) | **139 scenarios passed** |

Session 1 built the full engine + CLI (see git history for the details that
used to live here). Session 2 added:

- **`src/packages/web`** — `WebController` (plain TS, no React yet): provider
  cards/BYOK settings, per-provider key guards with provider-named toasts,
  descriptive 401/404/network error mapping, chat bubbles, open/save dialog
  handshakes (data / save-as / flow / Python export), sample picker + URL
  dialog (`fetchTable`), pagination/selection/status footer, cell-edit and
  column-reorder spec patches with undo, press-hold/latch/continuous voice
  over injected `VoicePort`s, tutorial manager (manifest, seven marketing
  groups, deep links, execute-once stepping, key-free cassette replay), and
  the diagnostics ring buffer with key redaction (`diagnostics.ts`).
- **`src/tests/steps-web.ts`** + world wiring — every `@web` scenario in
  `spec/test-cases/` passes; shared steps route through the controller's
  engine in the web profile.
- **Cassette matcher extensions** — see temp/decisions.md (voice hints,
  evidence-based miss detection, instruction-keyed batch affinity).
- **CI (`ci.yml`)** — bun install → typecheck → `bun run test` (which now
  includes `test:web:app`), offline, no secrets, no Playwright yet.
  `deploy.yml` switched to manual-only (web build/demos don't exist yet).

## Remaining

- **Package demo `@web` scenarios (42)** — `spec/packages/*/*.feature` demo
  scenarios need per-package `demo.html` pages driven by Playwright headless
  Chromium (pre-installed at `/opt/pw-browsers/chromium` in this environment),
  plus step defs in `src/packages/<name>/*.steps.ts` and the run-cucumber
  import glob for them. Once green, fold full `test:web` into `bun run test`
  and restore the Playwright cache/install steps in `ci.yml`.
- **React shell / Vite build** (`bun run build` in `src/packages/web`) — the
  browser app, mobile shell, history timeline, TourUi. Blocks Task C:
  `deploy.yml` + `build-site.sh` (marketing root, `/app/`, `tutorials/`,
  `samples/`, `cassettes/`, `demos/`), deep links
  `/app/?feature=<file>&scenario=<name>`, browser-side content matcher (move
  it from `src/tests/cassette.ts` into `@tamedtable/cassette` so key-free
  tours work on the deployed site).
- `chat-panel` and `bench` packages, `test:smoke` / `test:e2e`.
- Live (`TAMEDTABLE_CASSETTE=off`) runs wired for Gemini only;
  `TAMEDTABLE_RPM` accepted but not enforced.

## Open decisions

- Whether to re-record cassettes against this implementation's request bytes
  (`bun run test:record`, needs `GEMINI_API_KEY`) so strict fingerprint replay
  works without the content matcher — now more valuable, since the deployed
  site's key-free tours would otherwise need the matcher in the browser.
