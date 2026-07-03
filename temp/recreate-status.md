# Recreation status — 2026-07-03 (session 3: demos, browser shell, gh-pages)

## Done (green, offline, no API key)

`cd src && bun run test` runs four gates, all green:

| Gate | Result |
|---|---|
| `bun test packages` (unit) | 7 pass |
| Cucumber `@headless` | **163 scenarios passed** |
| Cucumber `@cli` | **116 scenarios passed** |
| Cucumber `@web` (full: app + package demos) | **183 scenarios passed** |

Sessions 1–2 built the engine, CLI, and `WebController` (see git history).
Session 3 added:

- **Package demos** — every library package (`table-view`, `ui-kit`,
  `toolbar`, `model-config`, `chat-panel` (new), `voice-input`, `file-io`,
  `gherkin-tour`) ships `demo.html` + `demo.ts` + a plain-DOM `dom.ts`
  component where warranted, plus `<name>.steps.ts` driving the demo in
  headless Chromium (44 @web demo scenarios). `run-cucumber.ts` imports the
  `packages/*/*.steps.ts` glob; CI restored the Playwright cache/install
  steps and runs the full `bun run test`.
- **Content matcher moved into `@tamedtable/cassette`** (`matcher.ts`) so
  the browser's key-free tour replay shares the Node recorder's matching.
- **Browser shell** — `src/packages/web/app.ts`, a plain-DOM view over
  `WebController`: empty state with the three Open actions, table view +
  pager + footer, chat sidebar, toolbar split-buttons, settings (BYOK
  provider cards), toasts, Tours panel, tour bar with step controls, deep
  links `/app/?feature=<file>&scenario=<name>`. `bun run build` (Bun.build)
  emits `dist/` honoring `TAMEDTABLE_WEB_BASE`; node builtins are shimmed
  (see temp/decisions.md).
- **gh-pages** — `build-site.sh` assembles marketing root + `app/` +
  `demos/<name>/` + static `tutorials/`, `samples/`, `cassettes/` for
  project pages (`SITE_BASE=/TT-recreate/`, no CNAME); `deploy.yml` triggers
  on push to main again.

## Remaining

- **Pages needs one manual click** — everything is built and the deploy
  workflow is green up to publishing, but *creating* the Pages site needs
  repo admin, which `GITHUB_TOKEN` does not have here (both the REST call
  and `actions/configure-pages` `enablement` got 403 "Resource not
  accessible by integration"). Owner: Settings → Pages → Source **GitHub
  Actions**, then re-run the "Deploy site to GitHub Pages" workflow (or push
  to main). The site content was verified end to end against the deployed
  `gh-pages` bytes: the deep link
  `/app/?feature=filter.feature&scenario=Filter by Country` replays the tour
  key-free (10 rows → 4 USA rows, 1 filter transformation). The `gh-pages`
  branch from deploy run #3 holds a full site copy and becomes unused under
  the Actions flow.
- `pr-preview.yml` predates the Actions-flow deploy and needs rework before
  PR previews return (deploy-pages replaces the whole site per deploy; the
  old design kept previews as subdirs of the gh-pages branch).
- `bench` package, `test:smoke` / `test:e2e` scripts (the original's
  smoke/e2e gates; the deploy workflow currently deploys after CI without a
  dedicated smoke step).
- Browser-only surfaces beyond the recreation shell: mobile shell, history
  timeline/jumpTo UI, richer TourUi (spotlights), mic capture ports (voice
  tours replay from clips; live mic is not wired).
- Live (`TAMEDTABLE_CASSETTE=off`) runs wired for Gemini only;
  `TAMEDTABLE_RPM` accepted but not enforced.
- SQL/parquet/arrow are unavailable in the browser build (DuckDB is stubbed);
  sql.feature tours would miss in the browser.

## Open decisions

- Whether to re-record cassettes against this implementation's request bytes
  (`bun run test:record`, needs `GEMINI_API_KEY`) so strict fingerprint
  replay works everywhere without the content matcher.
