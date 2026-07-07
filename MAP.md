# Code and feature map

Every major feature and code area carries a `#PascalCase` hashtag — as a
comment in the code and as an anchor in the specs. Search the tag in GitHub
(or your editor) to jump to every related file. To add an area: tag the code,
then add a row here.

## Data model and engine

| Tag | What it is | Code |
|---|---|---|
| `#TablePlan` | Spec types, validator, JSON-Patch subset | [src/packages/table-plan/index.ts](src/packages/table-plan/index.ts) |
| `#Core` | Load/save, env loading, re-exports | [src/packages/core/index.ts](src/packages/core/index.ts) |
| `#Engine` | Transformation runtime | [src/packages/core/engine.ts](src/packages/core/engine.ts) |
| `#SqlExpr` | `{sql}` expressions over DuckDB | [src/packages/core/sql.ts](src/packages/core/sql.ts) |
| `#Aggregate` `#LookupJoin` `#ColSplit` `#Validate` `#PivotData` | The structural verbs | [src/packages/core/engine.ts](src/packages/core/engine.ts) |
| `#FormatCodecs` `#FormatOut` | Format registry, CSV/JSONL/Parquet/Arrow output | [src/packages/table-plan/index.ts](src/packages/table-plan/index.ts), [src/packages/core/index.ts](src/packages/core/index.ts) |
| `#FileIO` | Codecs, URL fetch, flow serialization | [src/packages/file-io/index.ts](src/packages/file-io/index.ts) |

## Model calls

| Tag | What it is | Code |
|---|---|---|
| `#Headless` | Request loop: patch turn → validate → replay → commit | [src/packages/headless/index.ts](src/packages/headless/index.ts) |
| `#LlmClient` | Provider HTTP clients (Gemini/Anthropic/OpenAI) + RPM limiter | [src/packages/headless/client.ts](src/packages/headless/client.ts), [src/packages/headless/rpm.ts](src/packages/headless/rpm.ts) |
| `#LLMCells` | Per-row cell batching, cache, chunk dispatch | [src/packages/headless/index.ts](src/packages/headless/index.ts) |
| `#SystemPrompts` | Prompt loading from spec/prompt-app-edit.md | [src/packages/headless/prompts.ts](src/packages/headless/prompts.ts) |
| `#CancelOp` | Cancel within 2 s, drain after | [src/packages/headless/index.ts](src/packages/headless/index.ts) |
| `#PyExport` | Flow → standalone Python script | [src/packages/headless/index.ts](src/packages/headless/index.ts) |
| `#Cassettes` | Record/replay recorder + content matcher | [src/packages/cassette/](src/packages/cassette/), [src/tests/cassette.ts](src/tests/cassette.ts) |
| `#ConfigEnv` | Env vars, `.env` loading | [src/packages/core/index.ts](src/packages/core/index.ts) |
| `#ModelConfig` | Provider/key/model resolution, chooser UI, localStorage | [src/packages/model-config/](src/packages/model-config/) |

## CLI

| Tag | What it is | Code |
|---|---|---|
| `#Cli` `#BatchExec` | Entry, subcommands, exit codes | [src/packages/cli/index.ts](src/packages/cli/index.ts) |
| `#Repl` | REPL session | [src/packages/cli/session.ts](src/packages/cli/session.ts) |
| `#ReplCmds` `#CliFlags` | Colon commands, help screens | [src/packages/cli/help.ts](src/packages/cli/help.ts) |
| `#ReplView` | Viewport rendering | [src/packages/cli/render.ts](src/packages/cli/render.ts) |

## Web

| Tag | What it is | Code |
|---|---|---|
| `#WebUI` | `WebController` + the browser shell | [src/packages/web/](src/packages/web/) |
| `#History` | Undo timeline (cursor journal) | [src/packages/web/controller.ts](src/packages/web/controller.ts) |
| `#Diagnostics` | Rolling event log, redaction, bug report | [src/packages/web/controller-diagnostics.ts](src/packages/web/controller-diagnostics.ts) |
| `#ChatPanel` | Chat sidebar component | [src/packages/chat-panel/](src/packages/chat-panel/) |
| `#TableView` | Grid, pagination, status footer | [src/packages/table-view/](src/packages/table-view/) |
| `#Toolbar` | Top bar, open/save split-buttons, dialogs | [src/packages/toolbar/](src/packages/toolbar/) |
| `#UiKit` | Theme, icons, buttons, toasts | [src/packages/ui-kit/](src/packages/ui-kit/) |
| `#GherkinTour` | Tour parser + driver | [src/packages/gherkin-tour/](src/packages/gherkin-tour/) |
| `#VoicePort` | Voice prompt + recording ports | [src/packages/voice-input/](src/packages/voice-input/) |
