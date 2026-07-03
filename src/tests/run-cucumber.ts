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

const only = process.env.TAMEDTABLE_FEATURES?.split(',').map((s) => s.trim()).filter(Boolean);
const paths = only
  ? only.flatMap((n) => [`../spec/test-cases/${n}.feature`, `../spec/packages/${n}/${n}.feature`])
  : ['../spec/test-cases/*.feature', '../spec/packages/*/*.feature'];

const { runConfiguration } = await loadConfiguration({
  provided: {
    paths,
    import: [join(import.meta.dir, 'steps.ts')],
    tags: `@${profile} and not @perf and not @needs-recording`,
    format: ['progress'],
    parallel: 0,
  },
});
const support = await loadSupport(runConfiguration);
const { success } = await runCucumber({ ...runConfiguration, support });
process.exit(success ? 0 : 1);
