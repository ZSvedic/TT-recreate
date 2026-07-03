// #ModelConfig — provider/key/model resolution. Zero dependencies; no process.
import modelsJson from './models.json';

export type Provider = 'anthropic' | 'gemini' | 'openai';

export interface ModelDef {
  id: string; name: string; desc: string; provider: Provider;
  voiceInput: boolean; temperature?: boolean; default?: boolean; secondaryDefault?: boolean;
}

export interface ResolvedConfig {
  provider: Provider;
  anthropicKey: string | null;
  geminiKey: string | null;
  openaiKey: string | null;
  model: string;
  cellModel: string;
}

export interface StoragePort {
  read(): Partial<ResolvedConfig>;
  write(c: Partial<ResolvedConfig>): void;
  clear(): void;
}

export const ALL_MODELS: readonly ModelDef[] = modelsJson as ModelDef[];

export function providerFor(modelId: string): Provider {
  if (modelId.startsWith('claude-')) return 'anthropic';
  if (modelId.startsWith('gpt-') || modelId.startsWith('o')) return 'openai';
  return 'gemini';
}

export function defaultModel(provider: Provider): string {
  return ALL_MODELS.find((m) => m.provider === provider && m.default)!.id;
}

export function defaultCellModel(provider: Provider): string {
  return ALL_MODELS.find((m) => m.provider === provider && m.secondaryDefault)!.id;
}

/** False for models that removed sampling params, and for unknown ids. */
export function acceptsTemperature(modelId: string): boolean {
  if (modelId.startsWith('gemini-')) return true;
  const def = ALL_MODELS.find((m) => m.id === modelId);
  return def ? def.temperature !== false : false;
}

export function keyFor(config: ResolvedConfig): string | null {
  const key = config.provider === 'anthropic' ? config.anthropicKey
    : config.provider === 'gemini' ? config.geminiKey : config.openaiKey;
  return key || null;
}

export function resolveConfig(
  env: Record<string, string | undefined>,
  stored: Partial<ResolvedConfig>,
): ResolvedConfig {
  const anthropicKey = env.ANTHROPIC_API_KEY ?? stored.anthropicKey ?? null;
  const geminiKey = env.GEMINI_API_KEY ?? stored.geminiKey ?? null;
  const openaiKey = env.OPENAI_API_KEY ?? stored.openaiKey ?? null;
  // Gemini > OpenAI > Anthropic when several env keys are set; env beats stored.
  const provider: Provider = env.GEMINI_API_KEY ? 'gemini'
    : env.OPENAI_API_KEY ? 'openai'
    : env.ANTHROPIC_API_KEY ? 'anthropic'
    : stored.provider ?? 'gemini';
  const model = env.TAMEDTABLE_MODEL ?? stored.model ?? defaultModel(provider);
  let cellModel = env.TAMEDTABLE_CELL_MODEL ?? stored.cellModel ?? defaultCellModel(provider);
  if (providerFor(cellModel) !== providerFor(model)) cellModel = defaultCellModel(providerFor(model));
  // Only the selected provider's key survives resolution.
  return {
    provider,
    anthropicKey: provider === 'anthropic' ? anthropicKey : null,
    geminiKey: provider === 'gemini' ? geminiKey : null,
    openaiKey: provider === 'openai' ? openaiKey : null,
    model,
    cellModel,
  };
}
