# Recreation status — 2026-07-05 (session 4: design parity, mobile, history, smoke)

## Done (green, offline, no API key)

`cd src && bun run test` runs four gates, all green:

| Gate | Result |
|---|---|
| `bun test packages` (unit) | 7 pass |
| Cucumber `@headless` | **163 scenarios passed** |
| Cucumber `@cli` | **116 scenarios passed** |
| Cucumber `@web` (full: app + package demos) | **187 scenarios passed** |

Sessions 1–3 built the engine, CLI, `WebController`, package demos, the
plain-DOM shell, and the Pages deploy (see git history). Session 4 added:

- **Design parity with `marketing/claude-design-app`** — the shell
  (`src/packages/web/app.ts`) now composes the package `dom.ts` components
  (toolbar, table-view, chat-panel, model-config, ui-kit toasts), all
  restyled to the prototype and themed from `tokens.json` via namespaced CSS
  variables (`paintTheme()` in app.ts). Light/dark toggle persists under
  `localStorage["tamedtable.theme"]`; ui-kit grew `createThemeToggle`; toasts
  auto-fade with hover-pause (ui-kit `mountToasts`). Toolbar condenses below
  1100 px. Settings and Tours are right-hand sheets; the Open-from-URL and
  sample dialogs are prototype-styled toolbar components.
- **History timeline** — `WebController` keeps a cursor journal (baseline
  `Loaded <file>` + a labelled snapshot per chat/voice/edit/reorder turn)
  with `undo`/`redo`/`jumpTo`/`historyLabels`/`historyTimes`/`historyCursor`;
  pinned by five `web.feature` scenarios (spec-first, red → green). Desktop
  toolbar Redo works.
- **Mobile dock layout** (≤768 px per behavior.md): app bar with pager, the
  five-button dark dock (Menu · Undo · History · Type · Speak), bottom sheets
  for Type / Speak / History (the undo timeline: newest first, current
  highlighted, tap-to-jump), a left Menu drawer, full-width sheets.
- **Live mic** — `browserVoicePort()` (MediaRecorder behind feature-detect)
  wired to the chat mic button and the mobile Speak sheet; shows only when
  `micVisible()` (voice-capable model + key). Voice tours still replay clips.
- **`test:smoke`** — `src/tests/smoke.ts` serves the built site under
  `/TT-recreate/` and checks in headless Chromium: homepage, every demo
  page's `#out`, and the filter-tour deep link finishing with 4 rows.
  `deploy.yml` runs it between build and upload.

Site is live at <https://zsvedic.github.io/TT-recreate/> (Actions Pages flow,
auto on push to main).

## Remaining

- `pr-preview.yml` predates the Actions-flow deploy and needs rework before
  PR previews return.
- `bench` package; `test:e2e` (the Cucumber `@web` profile + `test:smoke`
  cover the browser today).
- Mobile refinements from behavior.md not implemented: the page-as-scroller
  with frozen header/index column (the table region scrolls instead, with
  the desktop pagination/status footers), tour spotlights (steps show in the
  tour bar; the Type sheet is not auto-raised for chat steps), the
  Add-to-home-screen Settings section, the 30-second auto-send voice cap,
  continuous voice UI (the controller surface exists).
- Settings no longer offers per-model switching (model-config's rows are
  read-only Primary/Secondary readouts); `setModel` remains on the
  controller.
- Live (`TAMEDTABLE_CASSETTE=off`) runs wired for Gemini only;
  `TAMEDTABLE_RPM` accepted but not enforced.
- SQL/parquet/arrow are unavailable in the browser build (DuckDB is stubbed);
  sql.feature tours would miss in the browser.

## Open decisions

- Whether to re-record cassettes against this implementation's request bytes
  (`bun run test:record`, needs `GEMINI_API_KEY`) so strict fingerprint
  replay works everywhere without the content matcher.
