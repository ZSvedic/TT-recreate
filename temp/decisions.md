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
- **Only the Gemini provider is wired for live calls** (all cassettes record
  with Gemini defaults). Anthropic/OpenAI resolution logic exists in
  model-config; their HTTP clients are not implemented.
- **`TAMEDTABLE_RPM` is accepted but not enforced** — replay never touches the
  network; a live rate limiter is out of scope for the recreation.
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
