// Node/Bun only — reads the model-config env vars from process.env.
export function readConfigFromEnv(): Record<string, string | undefined> {
  const { ANTHROPIC_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY, TAMEDTABLE_MODEL, TAMEDTABLE_CELL_MODEL } = process.env;
  return { ANTHROPIC_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY, TAMEDTABLE_MODEL, TAMEDTABLE_CELL_MODEL };
}
