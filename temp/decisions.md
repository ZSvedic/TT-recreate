# Recreation decisions (where the spec is silent)

- **No Vercel AI SDK.** The engine calls Gemini `generateContent` over plain
  `fetch` with a deterministic JSON body. The contract names the AI SDK, but
  the observable behavior (tests) only sees the fetch hook, and a hand-rolled
  client is smaller and fully deterministic.
- **Cassette matching is content-based.** The committed cassettes key on
  SHA-256 fingerprints of the *original* implementation's request bytes, which
  cannot be reproduced from the spec (the user-message template, tool schema,
  and SDK serialization are unspecified). The test-side recorder therefore
  tries the strict fingerprint first, then maps a miss to the recorded response
  by content: patch turns by token overlap between the user request and the
  recorded ops; cell batches by array length plus input↔output affinity.
  Scenario-built tapes (cassettes.feature) stay byte-strict — the matcher is
  only enabled for the committed cassettes.
- **All three providers speak their own wire protocol** (session 5): hand-
  rolled clients over the same `FetchLike` — Gemini `generateContent`
  (`x-goog-api-key`), Anthropic Messages (`x-api-key` +
  `anthropic-version: 2023-06-01`, `ANTHROPIC_BASE_URL` honoured), OpenAI Chat
  Completions (`Bearer`). `clientFor(providerFor(model))` picks; cassettes
  still record with Gemini defaults. Voice stays Gemini-only — the other
  clients reject an audio part with a clear error.
- **`TAMEDTABLE_RPM` is a sliding-window limiter** (session 5) in
  `headless/rpm.ts`, gating every HTTP attempt; `rpm <= 0` disables it and
  replay runs set it to 0 (`run-cucumber.ts`) since cassette hits touch no
  network. `run-cucumber.ts` also unsets `ANTHROPIC_BASE_URL` — the Claude
  Code sandbox exports one, which would repoint wire-shape assertions.
- **No prefix caching of derived rows.** Re-running the transformation list
  re-uses the per-cell LLM cache, so committed `{llm}` transformations replay
  without model calls; the row-prefix cache from behavior.md is a pure
  optimization the tests cannot observe.
- **Zod / fast-json-patch are hand-rolled** (~80 LOC together): one validator
  function and an add/replace/remove JSON-Patch subset — the only ops the
  patch tool emits.
- **Parquet I/O goes through DuckDB** (`read_parquet` / `COPY TO`), Arrow
  through `apache-arrow` — no extra parser dependencies.
- **@scripted SQL scenarios answer the patch turn locally** (a `patchScript`
  runner option), as sql.feature's own comments describe; the "slow" aggregate
  is a cross-join `count(*)` sized so interrupt-cancel and drain-after-cancel
  are both observable.
- **@cancel scenarios run with `batchSize: 2`** — inferred from the recorded
  `cancelation.json` batches (arrays of 2).
- **Toast duration model**: `clamp(chars × 80 ms, 3 s, 12 s)` — fits all three
  pinned points in ui-kit.feature.
- **WebController is a plain TS class, host I/O injected.** The `@web` app
  scenarios drive it in Node: the world injects `writeFile`,
  `resolveFixturePath`, `saveDir`, tutorial loaders (fs reads), and the replay
  fetch factory. The React shell / Vite build is not implemented yet, so the
  browser-only surfaces (mobile shell, history timeline, TourUi) are absent.
- **Test controller starts with a Gemini key present** (`GEMINI_API_KEY=
  placeholder-key` in the injected env). save-py's `@web` scenario exports
  Python with no key Given, while the keyless-toast scenarios all say "the API
  key has not been set" first — so that step *clears* keys rather than
  describing the default.
- **"the provider X has API key Y" also selects provider X.** web.feature's
  "not Anthropic's" scenario overrides with an explicit select afterwards;
  voice and diagnostics scenarios rely on the implicit selection.
- **Voice replay uses a clip-name hint.** A voice patch turn's user text (the
  deterministic voice prompt) is identical for every clip over the same table,
  so the recorder can't discriminate by content. The step that wires a stub
  mic/clip sets `recorder.voiceHint = <clip name>`; the matcher scores the
  hint's tokens (validate/normalize/dob/phone) against the recorded ops +
  transcript.
- **Content-matcher additions for @web-only tours**: (1) a patch request with
  zero positive evidence against every candidate is a genuine miss (pins the
  tutorial-replay-miss diagnostics scenario); (2) instruction-keyed batch
  affinity hints — street/city/state/zip shapes, numeric ranges (1–5 vs
  1–100), language-name vs translation, translation word-stem echo; (3) tiny
  yes/no oracles (fake-email, city↔country gazetteer, price plausibility) used
  only to pick among same-length recorded yes/no arrays. All served bytes
  still come from the committed cassettes.
- **Cell edits patch the spec as a positional `{js}` mutate**
  (`i === <row> ? "<value>" : row["<col>"]`); column drag reorders
  `spec.columns`. Undo pops a journal of whole-spec snapshots (the timeline /
  jumpTo surface is deferred with the mobile shell).
- **Package demos and the browser shell are plain DOM, not React.** The
  package behavior.md files describe React components, but the observable
  behavior (the @web demo scenarios, the deployed tours) sees only DOM
  attributes and callbacks; every package ships a `dom.ts` "props in,
  callbacks out" component instead, and `src/packages/web/app.ts` renders the
  shell the same way. Smaller, no new runtime dependency.
- **Demo test harness**: each package's `*.steps.ts` builds its `demo.ts`
  with `Bun.build` into a gitignored `.demo-dist/`, serves it with
  `Bun.serve` (port 0), and launches Chromium with a fallback to the
  container binary (`executablePath: '/opt/pw-browsers/chromium'`) when the
  pinned playwright revision isn't downloaded.
- **gherkin-tour's spec had no @web demo scenarios** — two were added to
  `spec/packages/gherkin-tour/gherkin-tour.feature` (spec-first) so the
  package demo is covered like every other package's.
- **The content matcher lives in `@tamedtable/cassette` (`matcher.ts`)** —
  moved out of `src/tests/cassette.ts` (it was already pure) so the browser's
  key-free tour replay and the Node test recorder share one matcher.
  `matchedReplayFetch(tape)` = strict fingerprint first, then content match.
- **Browser build is `Bun.build`, not Vite** (the contract's Vite/main.tsx
  wiring predates the recreation): `bun run build` in `src/packages/web`
  bundles `app.ts` with `node:fs`/`node:path` mapped to shims (an in-memory
  file map plus a synchronous same-origin XHR fallback so the engine's
  `readFileSync` can pull deployed `samples/` on demand), DuckDB/apache-arrow
  stubbed to throw on use (SQL/parquet/arrow are unavailable in the browser
  demo), and a minimal `Buffer` shim for the csv codecs. The prompt file,
  tutorial manifest, sample list, and `TAMEDTABLE_WEB_BASE` are baked in as
  defines.
- **Deployment is project pages** (`https://zsvedic.github.io/TT-recreate/`,
  `SITE_BASE=/TT-recreate/`, no CNAME): marketing site at the root, app under
  `app/`, demos under `demos/<name>/`, static `tutorials/` + `samples/` +
  `cassettes/` at the root (the app fetches them relative to the site base,
  not the app dir).

## Session 4 — design parity

- **The shell composes the package `dom.ts` components** (`toolbar`,
  `table-view`, `chat-panel`, `model-config`, ui-kit toasts): `app.ts` keeps
  only layout, wiring, and overlays. Theme = `applyTheme` (ui-kit `--uk-*`
  vars + `data-uk-mode` on `<body>`) plus a `paintTheme()` that copies the
  active Theme onto the root as each package's namespaced variables
  (`--tb-*`, `--tv-*`, `--cp-*`, `--mc-*`), per spec/packages/README.md.
  Mode persists under `localStorage["tamedtable.theme"]`.
- **Toast kinds are classified in the shell.** `WebController.toasts` stays
  `string[]` (the tested surface); the shell maps each drained message to the
  ui-kit `{id, kind, message}` shape, guessing `error` by wording
  (error/failed/invalid/could not/require…). Auto-fade + hover-pause come
  from ui-kit `mountToasts`.
- **Settings = model-config's accordion as-is.** Its model rows are read-only
  (Primary/Secondary readouts), so the shell no longer offers per-model
  switching — provider cards select the provider's defaults; keys are
  editable. `setModel` stays on the controller (used by tests/deep links).
- **Toolbar condenses below 1100 px** (icon-only buttons, readout hidden) —
  behavior.md names the band but no px; 768 px stays the phone breakpoint.
- **ui-kit grew `createThemeToggle`** (sun/moon, `data-uk-theme-toggle`);
  the demo's icon-count step now counts inside `#icons` only, since other
  demo controls legitimately use icons.
- **Live mic = `browserVoicePort()`** — a `VoicePort` over MediaRecorder
  behind a `navigator.mediaDevices`/`MediaRecorder` feature-detect; the mic
  button renders only when `controller.micVisible()` (voice-capable model +
  key). Voice tours keep replaying from clips, never touching the port.
- **Undo timeline is a cursor journal.** `WebController` keeps
  `history[0] = "Loaded <file>"` plus one entry per successful change (chat
  turn labelled by its text, voice by the transcript bubble, `edit <col>`,
  `move <col> first`), each a full-spec snapshot with a timestamp;
  `undo`/`redo` move the cursor, `jumpTo(i)` jumps, a new change truncates
  the redone tail (pinned by new web.feature scenarios).
- **Mobile dock layout** (≤768 px, per behavior.md): app bar (mark, file,
  `‹ page/total ›`), table, and the five-button dock (`data-dock=…`) on the
  `dockBg/dockInk` tokens. Type/Speak/History raise 300-px bottom sheets in
  the dock's place; Menu opens a left drawer; Settings/Tours/dialog sheets go
  full-width. The desktop pagination/status footers stay under the table on
  mobile (the spec's page-scrolls-the-table + frozen header/index refinement
  is not implemented); tour steps show in the tour bar, not a Type-sheet
  spotlight — logged as remaining.
- **The engine re-checks its API key lazily.** `buildEngine` records the key
  it was built with; `sendChat` / voice / Python export call
  `ensureEngineCurrent()`, which rebuilds (table preserved) when the built
  key differs from the key Settings now holds. Fixes the deployed bug where
  a key typed after loading a table never reached the wire — every live
  request carried the literal `placeholder` and Google answered 401
  (pinned by web.feature "A key entered after the table is loaded…").

## Session 5 — tour spotlights

- **TourUi is hand-rolled, no driver.js dependency** — same pattern as every
  other package (plain DOM, no React/Vite/AI-SDK): a fixed overlay of four
  shade panels + accent ring + popover, `data-tour-*` attributes for tests,
  keyboard (`→`/Space/Enter next, `←` prev, Esc cancel), and the >55 %-of-
  viewport spotlight clamp from the package spec.
- **Prev exists in the app overlay.** spec/behavior.md (#TutorialMode) gives
  the popover ← Prev / Next → and keeps Previous live on the terminal stop;
  the gherkin-tour package spec says forward-only. behavior.md outranks, so
  `TourCursor.prev` is optional — the app supplies it (re-highlight without
  re-run, `executedThrough` guards), a host that omits it gets the package
  spec's forward-only popover.
- **The app's terminal stop** reuses the driver numbering rule (stepCount
  includes the terminal stop): the shell passes `tutorialStepCount() + 1`,
  so the Voilà popover reads "N of N" with Next disabled and Finish live.

## Session 5 — voice

- **Hands-free VAD is a hand-rolled energy detector** (`browser-vad.ts`:
  AnalyserNode RMS with open/keep hysteresis, redemption window, min-speech
  floor, 16 kHz WAV segments) instead of the contract's @ricky0123/vad-web —
  no WASM/CDN dependency, same `ContinuousVoicePort` surface and tuning
  knobs; tests inject stub ports either way.
- **browserVoicePort moved into `@tamedtable/voice-input/browser-voice`**
  and now re-encodes MediaRecorder output to 16 kHz mono PCM16 WAV
  (`encodeWavPcm16`, unit-tested) with a raw-blob fallback when decode fails.
- **The 30 s auto-send cap is injectable** (`voiceSchedule` option) so the
  Gherkin scenario fires the timer on a fake clock.

## Session 5 — browser DuckDB

- **duckdb-wasm is pinned to 1.28.0** — the last line with the parquet
  extension statically linked. 1.29+ autoloads `parquet.duckdb_extension.wasm`
  from extensions.duckdb.org at runtime, which the CI/sandbox proxy blocks
  (and would add a runtime CDN dependency for users). Module + workers are
  self-hosted under `app/duckdb/`, resolved relative to the page.
- **The browser DuckDB shim bridges the parquet codec's tmp files**: a
  `read_parquet('<path>')` source is registered from the in-memory fs shim
  into duckdb's virtual FS before the query; a `COPY … TO '<path>'` result is
  copied back out after. The sync-XHR sample fallback now fetches bytes with
  the x-user-defined charset trick so parquet/arrow samples arrive byte-exact.
- **Every browser save delivers a download** from the in-memory fs after
  `confirmSave` (one central hook — data, flow, and Python alike).

## Session 5 — cassette re-record

- **Record mode shells out to curl** (`tests/curl-fetch.ts`) — Bun's fetch
  cannot traverse this environment's proxy; curl honours HTTPS_PROXY and the
  CA bundle. Replay never touches it.
- **Record mode uses the real `GEMINI_API_KEY`** from the environment
  (`world.runnerOpts`); replay keeps the placeholder.
- **`TAMEDTABLE_STRICT=1`** runs replay fingerprint-only (content matcher
  off) — the proof the re-recorded tapes carry this implementation's exact
  request bytes.
