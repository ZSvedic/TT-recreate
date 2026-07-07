# Recreation status — 2026-07-07 (session 5: close all remaining gaps)

Progress: **0 of 21 checklist items green** (audit = item 0, done below).

## Task 0 — spec-vs-implementation audit (done)

Method: every `spec/packages/*/behavior.md`, every `spec/behavior.md` section,
and every `spec/code-contract.md` claim diffed against `src/` and the test
suite. Claims that match a deliberate logged decision in `temp/decisions.md`
(plain-DOM instead of React, `Bun.build` instead of Vite, hand-rolled
Zod / fast-json-patch / AI-SDK substitutes, content-matched cassettes) are
marked *decision*, not gaps.

| Spec claim | Implemented? | Tested? | Task |
|---|---|---|---|
| model-config `storage.ts` (StoragePort over localStorage, `tamedtable.config`, `tamedtable.apiKey` migration); controller boots via `resolveConfig(env, stored)`; demo shared persistence | no | no | 1 |
| resolveConfig rule 7: cross-provider primary model coerced to `defaultModel(provider)` | no | no | 17 |
| Anthropic + OpenAI live HTTP clients (patch turn, cells, generateText; provider auth headers; error mapping) | no (Gemini only) | no | 2 |
| `TAMEDTABLE_RPM` enforced on live calls | no (accepted only) | no | 3 |
| models.json two sections (`models` + `defaults`), per-model prices mirroring `benchmarks/models.jsonl`, `DEFAULTS` export | no (flat array, no prices) | partial | 4 |
| Settings: per-row per-Mtok price, per-card env hint under key field, byok/change-models help links, role explainer/intro copy | no | no | 4 |
| Chat: "Loaded \<file\> — N rows, M columns." note; header "N transformation(s)"; request-detail panel wired in shell | no (component exists, shell passes no debug) | no | 5 |
| Tour spotlights: Driver.js-style overlay per anchor, "Voilà" terminal step, mobile Type-sheet auto-raise; gherkin-tour `TourUi` (`./ui`), `TourCursor`, `TourDriver.cancel/currentStepNumber/stepCount` | no (tour bar only) | no | 6 |
| Mobile: page-as-scroller, frozen header/index, scroll-room floor, Add-to-home-screen Settings section | no (table region scrolls) | no | 7 |
| Voice: 30 s auto-send cap; continuous hands-free toggle in shell; Esc paths in shell | no (controller surface only) | partial | 8 |
| Voice recording converted to 16 kHz WAV before send | no (raw webm/mp4) | no | 8/14 |
| voice-input package: `browser-voice` entry (browserVoicePort), `audioMediaType`, `ContinuousVoicePort` + `browser-vad` entry, `VOICE_INSTRUCTION` drift guard, demo capability panel | no (port lives in web/, no VAD) | no | 14 |
| Browser `{sql}`/parquet/arrow via duckdb-wasm | no (stub throws) | no | 9 |
| Link check workflow green | failing since Jul 3 | — | 10 |
| pr-preview coexists with Actions-flow deploy | no (predates it) | — | 11 |
| bench package `@tamedtable/bench` (pricing table test, sweep runner, charts) | no | no | 12 |
| Cassettes replay on strict fingerprints without content matcher | no (matcher required) | — | 13 |
| file-io: `parseTable`, `FilePort`/`SaveOutcome`, `BrowserFilePort` (`browser-fs`), `loadCodec` load-on-demand | no | no | 15 |
| ui-kit: toast `action`/`onAction`, `space` export; spec names (`brand`, `toastDurationMs`, `TOAST_FLOOR_MS`/`TOAST_CEILING_MS`, `TYPING_MS_PER_CHAR`, `sampleKind`, `buildPageList`, `pageSlice` arg order, `controller-diagnostics.ts`) | no / renamed | partial | 16 |
| CLI `execute` writes parquet/arrow output (codecs support it; CLI exits 4) | no | no | 17 |
| Empty page: mark, "What table can I tame?", three open buttons, "Or start one of the tours" (desktop + phone) | no (drop-zone copy) | no | 18 |
| Toolbar tooltips name CLI equivalents (`Undo (:undo)` …) | no | no | 18 |
| Save data dropdown: one "Save as …" per supported format; Save flow dropdown: "Save as Flow…" entry | partial (CSV/JSONL only; no Save-as-Flow) | partial | 18 |
| Diagnostics actions rendered in Settings; error-toast "Copy report" action | no (logic tested, UI absent) | partial | 19 |
| URL dialog: inline errors, stays open, no toast; `http://` unencrypted hint | no (toast path) | partial | 20 |
| Everything else in behavior.md / code-contract / package specs (data model, engine, CLI, formats, diagnostics logic, tutorial replay, pagination, history, settings accordion, toasts, demos) | yes | yes | — |

Checklist (M = 21): tasks 1–13 from the mission plus audit tasks 14–20,
final gate. Each goes red → green with its own timebox; this table is
updated at every PR.

## Session-4 state (unchanged baseline)

`cd src && bun run test` green: 7 unit, 163 @headless, 116 @cli, 187 @web.
Site live at <https://zsvedic.github.io/TT-recreate/>.
