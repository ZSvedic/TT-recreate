// Cucumber runner — one profile per invocation: headless | cli | web.
// Runs the app features in spec/test-cases/ plus every package feature,
// filtered by the profile tag. TAMEDTABLE_FEATURES=a,b narrows the file set.
import { join } from 'node:path';
import { loadConfiguration, loadSupport, runCucumber } from '@cucumber/cucumber/api';

const profile = process.argv[2];
if (!['headless', 'cli', 'web'].includes(profile ?? '')) {
  console.error('usage: bun tests/run-cucumber.ts <headless|cli|web>');
  process.exit(1);
}
process.env.TAMEDTABLE_CASSETTE ??= 'replay';
process.env.TAMEDTABLE_PROFILE = profile;
// Hermetic wire assertions: a sandbox-level ANTHROPIC_BASE_URL (Claude Code
// sets one) must not repoint the engine's Anthropic endpoint under test.
delete process.env.ANTHROPIC_BASE_URL;
// Replay never touches the network — lift the RPM cap so cassette hits
// (and capture-stub fetches) add no idle delay (spec/code-contract.md).
if (process.env.TAMEDTABLE_CASSETTE === 'replay') process.env.TAMEDTABLE_RPM = '0';

const only = process.env.TAMEDTABLE_FEATURES?.split(',').map((s) => s.trim()).filter(Boolean);
// TAMEDTABLE_SCOPE=app: app features only (spec/test-cases), no package demos.
const all = process.env.TAMEDTABLE_SCOPE === 'app'
  ? ['../spec/test-cases/*.feature']
  : ['../spec/test-cases/*.feature', '../spec/packages/*/*.feature'];
const paths = only
  ? only.flatMap((n) => [`../spec/test-cases/${n}.feature`, `../spec/packages/${n}/${n}.feature`])
  : all;

const { runConfiguration } = await loadConfiguration({
  provided: {
    paths,
    import: [join(import.meta.dir, 'steps.ts'), join(import.meta.dir, '..', 'packages/*/*.steps.ts')],
    tags: `@${profile} and not @perf and not @needs-recording`,
    format: ['progress'],
    parallel: 0,
  },
});
const support = await loadSupport(runConfiguration);
const { success } = await runCucumber({ ...runConfiguration, support });
process.exit(success ? 0 : 1);
