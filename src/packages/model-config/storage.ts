// #ModelConfig storage — the localStorage StoragePort implementation.
// Browser only, but a safe no-op anywhere without localStorage; all helpers
// swallow storage exceptions. Config persists as one JSON blob under
// "tamedtable.config"; a legacy "tamedtable.apiKey" value migrates on first
// read (spec/packages/model-config/behavior.md § StoragePort).
import type { ResolvedConfig } from './index.ts';

const KEY = 'tamedtable.config';
const LEGACY_KEY = 'tamedtable.apiKey';

function store(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function readStoredConfig(): Partial<ResolvedConfig> {
  const s = store();
  if (!s) return {};
  try {
    const legacy = s.getItem(LEGACY_KEY);
    if (legacy !== null && s.getItem(KEY) === null) {
      s.setItem(KEY, JSON.stringify({ anthropicKey: legacy }));
      s.removeItem(LEGACY_KEY);
    }
    const raw = s.getItem(KEY);
    return raw ? (JSON.parse(raw) as Partial<ResolvedConfig>) : {};
  } catch {
    return {};
  }
}

export function writeStoredConfig(c: Partial<ResolvedConfig>): void {
  try {
    store()?.setItem(KEY, JSON.stringify(c));
  } catch { /* storage may be hidden or full */ }
}

export function clearStoredConfig(): void {
  try {
    store()?.removeItem(KEY);
  } catch { /* storage may be hidden */ }
}
