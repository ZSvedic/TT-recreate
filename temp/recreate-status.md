# Recreation status — 2026-07-07 (session 5: close all remaining gaps)

Progress: **18 of 21 checklist items green** (open: cassette re-record 13, deploy/final gate; Link check 10 confirms on next main run).

## Task 0 — spec-vs-implementation audit (done)

Method: every `spec/packages/*/behavior.md`, every `spec/behavior.md` section,
and every `spec/code-contract.md` claim diffed against `src/` and the test
suite. Claims that match a deliberate logged decision in `temp/decisions.md`
(plain-DOM instead of React, `Bun.build` instead of Vite, hand-rolled
Zod / fast-json-patch / AI-SDK substitutes, content-matched cassettes) are
marked *decision*, not gaps.

| Spec claim | Implemented? | Tested? | Task |
|---|---|---|---|
| model-config `storage.ts` (StoragePort over localStorage, `tamedtable.config`, `tamedtable.apiKey` migration); controller boots via `resolveConfig(env, stored)`; demo shared persistence | **yes** | **yes** | 1 ✅ |
| resolveConfig rule 7: cross-provider primary model coerced to `defaultModel(provider)` | **yes** | **yes** | 17 ✅ |
| Anthropic + OpenAI live HTTP clients (patch turn, cells, generateText; provider auth headers; error mapping) | **yes** | **yes** | 2 ✅ |
| `TAMEDTABLE_RPM` enforced on live calls | **yes** | **yes** | 3 ✅ |
| models.json two sections (`models` + `defaults`), per-model prices mirroring `benchmarks/models.jsonl`, `DEFAULTS` export | **yes** | **yes** | 4 ✅ |
| Settings: per-row per-Mtok price, per-card env hint under key field, byok/change-models help links, role explainer/intro copy | **yes** | **yes** | 4 ✅ |
| Chat: "Loaded \<file\> — N rows, M columns." note; header "N transformation(s)"; request-detail panel wired in shell | **yes** | **yes** | 5 ✅ |
| Tour spotlights: overlay per anchor, "Voilà" terminal step, mobile Type-sheet auto-raise; gherkin-tour `TourUi` (`./ui`), `TourCursor`, `TourDriver.cancel/currentStepNumber/stepCount` | **yes** (hand-rolled overlay, no driver.js — logged) | **yes** (browser-shell harness) | 6 ✅ |
| Mobile: page-as-scroller, frozen header/index, scroll-room floor, Add-to-home-screen Settings section | **yes** | **yes** (390×844 shell scenarios) | 7 ✅ |
| Voice: 30 s auto-send cap; continuous hands-free toggle in shell; Esc paths in shell | **yes** | **yes** | 8 ✅ |
| Voice recording converted to 16 kHz WAV before send | **yes** | **yes** (unit-tested encoder) | 8/14 ✅ |
| voice-input package: `browser-voice` entry (browserVoicePort), `audioMediaType`, `ContinuousVoicePort` + `browser-vad` entry (hand-rolled energy VAD — logged), `VOICE_INSTRUCTION` drift guard, demo capability panel | **yes** | **yes** | 14 ✅ |
| Browser `{sql}`/parquet/arrow via duckdb-wasm | **yes** (pinned 1.28.0 — logged) | **yes** (browser-shell scenarios) | 9 ✅ |
| Link check workflow green | 4 of 5 links fixed on main; the fifth (`src/packages/bench`) resolves with this PR — confirm on the next main push | — | 10 🔶 |
| pr-preview coexists with Actions-flow deploy | **yes** — label-gated artifact previews (the Actions Pages flow publishes one artifact for the whole site, so per-PR subdirs cannot coexist; the preview is a downloadable `_site` build with a sticky PR comment) | — | 11 ✅ |
| bench package `@tamedtable/bench` (pricing table test, sweep runner, charts) | **yes** (sample/label/sweep/chart/report CLI) | **yes** (catalogue↔pricing guard, costUsd, offline sweep smoke) | 12 ✅ |
| Cassettes replay on strict fingerprints without content matcher | no (matcher required) | — | 13 |
| file-io: `parseTable`, `FilePort`/`SaveOutcome`, `BrowserFilePort` (`browser-fs`), `loadCodec` load-on-demand | **yes** (heavy parsers already lazy-import inside the binary codecs) | **yes** (parseTable scenarios) | 15 ✅ |
| ui-kit: toast `action`/`onAction`, `space` export; spec names (`brand`, `toastDurationMs`, `TOAST_FLOOR_MS`/`TOAST_CEILING_MS`, `TYPING_MS_PER_CHAR`, `sampleKind`, `buildPageList`, `pageSlice` arg order, `controller-diagnostics.ts`) | **yes** | **yes** | 16 ✅ |
| CLI `execute` writes parquet/arrow output | resolved as a spec inconsistency: behavior.md said ".jsonl only" while convert.feature uses `.csv` — behavior.md line fixed to `.csv` or `.jsonl`; no parquet/arrow demand exists | — | 17 ✅ |
| Empty page: mark, "What table can I tame?", three open buttons, "Or start one of the tours" (desktop + phone) | **yes** | **yes** | 18 ✅ |
| Toolbar tooltips name CLI equivalents (`Undo (:undo)` …) | **yes** | **yes** | 18 ✅ |
| Save data dropdown: one "Save as …" per supported format; Save flow dropdown: "Save as Flow…" entry | **yes** | **yes** | 18 ✅ |
| Diagnostics actions rendered in Settings; error-toast "Copy report" action | **yes** | **yes** | 19 ✅ |
| URL dialog: inline errors, stays open, no toast; `http://` unencrypted hint | **yes** | **yes** | 20 ✅ |
| Everything else in behavior.md / code-contract / package specs (data model, engine, CLI, formats, diagnostics logic, tutorial replay, pagination, history, settings accordion, toasts, demos) | yes | yes | — |

Checklist (M = 21): tasks 1–13 from the mission plus audit tasks 14–20,
final gate. Each goes red → green with its own timebox; this table is
updated at every PR.

## Session-4 state (unchanged baseline)

`cd src && bun run test` green: 7 unit, 163 @headless, 116 @cli, 187 @web.
Site live at <https://zsvedic.github.io/TT-recreate/>.
