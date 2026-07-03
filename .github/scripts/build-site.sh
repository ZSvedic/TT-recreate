#!/usr/bin/env bash
# Assemble the GitHub Pages site under $OUT_DIR for the address prefix $SITE_BASE.
#
# The prefix is the single knob that distinguishes prod from a PR preview:
#   prod      SITE_BASE=/TT-recreate/           → project pages root
#   preview   SITE_BASE=/TT-recreate/pr-preview/pr-<N>/
# This recreation repo has no custom domain: it publishes as project pages at
# https://zsvedic.github.io/TT-recreate/, so every baked-in asset link carries
# the repo prefix or it 404s. Run from anywhere after `bun install` in src/.
#
# Layout produced:
#   $OUT/             ← marketing/web/ (homepage, root; CNAME excluded — no custom domain)
#   $OUT/app/         ← browser build of src/packages/web (fetch base $SITE_BASE)
#   $OUT/demos/<n>/   ← per-package demo bundles
#   $OUT/tutorials/   ← spec/test-cases/*.feature (tour sources)
#   $OUT/samples/     ← spec/test-cases fixtures: csv/jsonl + .m4a voice clips
#   $OUT/cassettes/   ← cassettes/*.json (key-free tour replay tapes)
set -euo pipefail

# Normalise to exactly one trailing slash so the concatenations below are clean.
BASE="${SITE_BASE:-/TT-recreate/}"
BASE="${BASE%/}/"
OUT="${OUT_DIR:-_site}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
# Resolve OUT to an absolute path for the demo bundler's --outdir (it runs from src/).
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
rm -rf "$OUT"
mkdir -p "$OUT/app" "$OUT/tutorials" "$OUT/samples" "$OUT/cassettes"

# Web app — the build bakes $BASE in as the same-origin fetch prefix for
# tutorials/, samples/, cassettes/ (they sit at the site root, not under app/).
( cd src/packages/web && TAMEDTABLE_WEB_BASE="${BASE}" bun run build )

# Marketing homepage at the root (CNAME stays out — no custom domain here),
# web app under /app/.
cp -rL marketing/web/. "$OUT/"
rm -f "$OUT/CNAME"
cp -r src/packages/web/dist/. "$OUT/app/"

# Static tour data: feature sources, fixtures + voice clips, replay cassettes.
cp spec/test-cases/*.feature "$OUT/tutorials/"
cp spec/test-cases/*.csv spec/test-cases/*.jsonl spec/test-cases/*.m4a "$OUT/samples/"
cp cassettes/*.json "$OUT/cassettes/"

# Standalone module demos under /demos/<name>/.
for name in chat-panel file-io gherkin-tour model-config table-view toolbar ui-kit voice-input; do
  ( cd src && bun build "packages/$name/demo.html" \
      --outdir "$OUT/demos/$name" \
      --public-path="${BASE}demos/$name/" )
done

# Retarget the marketing pages' absolute links (Open Web App, og:url, feature
# demos) onto the project-pages address at the current prefix. The source keeps
# the old github.io/TamedTable URL as a stable placeholder; this rewrites it to
# https://zsvedic.github.io$BASE… . Anchored on the full origin so
# github.com/... repo links are untouched.
mapfile -t html < <(grep -rl 'https://zsvedic.github.io/TamedTable/' "$OUT" --include='*.html' || true)
for f in "${html[@]}"; do
  [ -n "$f" ] || continue
  sed -i "s#https://zsvedic.github.io/TamedTable/#https://zsvedic.github.io${BASE}#g" "$f"
done
