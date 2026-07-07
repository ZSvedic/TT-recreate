// #ModelConfig demo — mounts the provider accordion over plain state and shows
// the resolveConfig result live; every callback appends to the #out event log.
import { ALL_MODELS, defaultCellModel, defaultModel, resolveConfig, type Provider } from './index';
import { readStoredConfig, writeStoredConfig } from './storage';
import { mountModelChooser } from './dom';

// Shared persistence: seed from the same localStorage blob the main app uses,
// and write every change back, so keys carry over in both directions.
const stored = readStoredConfig();
let provider: Provider = resolveConfig({}, stored).provider;
let expanded: Provider | null = null;
const keys: Record<Provider, string> = {
  anthropic: stored.anthropicKey ?? '',
  gemini: stored.geminiKey ?? '',
  openai: stored.openaiKey ?? '',
};

const out = document.getElementById('out')!;
const log = (msg: string) => { out.textContent += `${msg}\n`; };

function render() {
  const resolved = resolveConfig({}, {
    provider,
    anthropicKey: keys.anthropic || null,
    geminiKey: keys.gemini || null,
    openaiKey: keys.openai || null,
    model: defaultModel(provider),
    cellModel: defaultCellModel(provider),
  });
  mountModelChooser(document.getElementById('chooser')!, {
    models: ALL_MODELS,
    provider,
    keys,
    primaryModel: resolved.model,
    secondaryModel: resolved.cellModel,
    expandedProvider: expanded,
    byokHelpUrl: 'BYOK-setup.html',
    changeModelsHelpUrl: 'FAQ.html#change-models',
    onProviderClick: (p) => {
      if (expanded === p) {
        expanded = null;
        log(`collapse ${p}`);
      } else {
        expanded = p;
        provider = p;
        log(`provider ${p}`);
      }
      render();
    },
    onKeyChange: (p, value) => {
      keys[p] = value;
      log(`key ${p}`);
      render();
    },
  });
  document.getElementById('resolved')!.textContent = JSON.stringify(resolved, null, 2);
  writeStoredConfig(resolved);
}

log('ready');
render();
