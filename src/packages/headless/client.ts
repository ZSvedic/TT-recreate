// #LlmClient — provider HTTP clients over plain fetch (Gemini generateContent,
// Anthropic Messages, OpenAI Chat Completions). Request bodies are
// deterministic JSON so the cassette recorder can fingerprint and replay them.
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface ClientOptions {
  apiKey: string;
  baseURL?: string;
  fetch?: FetchLike;
  maxRetries?: number;
  /** TAMEDTABLE_RPM gate — awaited before every HTTP attempt. */
  limiter?: { acquire(): Promise<void> };
}

export interface ModelUsage { inputTokens: number; outputTokens: number }

export interface ModelReply {
  functionCall?: { name: string; args: Record<string, unknown> };
  text: string;
  usage: ModelUsage;
}

export interface PatchToolCall {
  system: string;
  user: string;
  audio?: { data: Uint8Array; mediaType: string };
  withTranscript?: boolean;
}

const PATCH_TOOL = {
  name: 'apply_spec_patch',
  description: 'Apply a list of RFC 6902 operations to the current table spec. Each operation value is a JSON-encoded string.',
  parameters: {
    type: 'object',
    properties: {
      operations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            op: { type: 'string', enum: ['add', 'replace', 'remove'] },
            path: { type: 'string' },
            value: { type: 'string', description: 'JSON-encoded value' },
          },
          required: ['op', 'path'],
        },
      },
    },
    required: ['operations'],
  },
};

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** The provider-agnostic surface the engine talks to. */
export interface LlmClient {
  patchTurn(model: string, call: PatchToolCall, temperatureOk: boolean): Promise<ModelReply>;
  cellBatch(model: string, system: string, prompts: string[], temperatureOk: boolean): Promise<ModelReply>;
  cellSingle(model: string, prompt: string, temperatureOk: boolean): Promise<ModelReply>;
  generateText(model: string, system: string, user: string, temperatureOk: boolean): Promise<ModelReply>;
}

/** POST with retry on 429/5xx, throwing the shared HTTP-error shape. */
async function postJson(
  opts: ClientOptions, url: string, headers: Record<string, string>, body: Record<string, unknown>,
): Promise<unknown> {
  const doFetch = opts.fetch ?? fetch;
  const payload = JSON.stringify(body);
  const retries = opts.maxRetries ?? 2;
  let res: Response | null = null;
  for (let attempt = 0; ; attempt++) {
    await opts.limiter?.acquire();
    res = await doFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: payload,
    });
    if (res.ok || attempt >= retries || (res.status < 500 && res.status !== 429)) break;
  }
  if (!res.ok) throw new Error(`model call failed: HTTP ${res.status} ${await res.text().then((t) => t.slice(0, 200))}`);
  return res.json();
}

export class GeminiClient implements LlmClient {
  constructor(private opts: ClientOptions) {}

  private url(model: string): string {
    const base = this.opts.baseURL ?? 'https://generativelanguage.googleapis.com/v1beta';
    return `${base}/models/${model}:generateContent`;
  }

  private async post(model: string, body: Record<string, unknown>): Promise<ModelReply> {
    const json = await postJson(this.opts, this.url(model), { 'x-goog-api-key': this.opts.apiKey }, body) as any;
    const parts: any[] = json.candidates?.[0]?.content?.parts ?? [];
    const fc = parts.find((p) => p.functionCall)?.functionCall;
    const text = parts.filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('');
    const um = json.usageMetadata ?? {};
    return {
      functionCall: fc ? { name: fc.name, args: fc.args ?? {} } : undefined,
      text,
      usage: {
        inputTokens: um.promptTokenCount ?? 0,
        outputTokens: (um.candidatesTokenCount ?? 0) + (um.thoughtsTokenCount ?? 0),
      },
    };
  }

  private generationConfig(model: string, temperatureOk: boolean): Record<string, unknown> {
    return temperatureOk ? { temperature: 0 } : {};
  }

  /** The spec-editor patch turn: system prompt + spec/user text + patch tool. */
  async patchTurn(model: string, call: PatchToolCall, temperatureOk: boolean): Promise<ModelReply> {
    const tool = structuredClone(PATCH_TOOL) as typeof PATCH_TOOL & { parameters: any };
    if (call.withTranscript) {
      tool.parameters.properties.transcript = { type: 'string', description: 'Verbatim transcript of the attached audio.' };
    }
    const parts: unknown[] = [{ text: call.user }];
    if (call.audio) parts.push({ inlineData: { mimeType: call.audio.mediaType, data: toBase64(call.audio.data) } });
    return this.post(model, {
      systemInstruction: { parts: [{ text: call.system }] },
      contents: [{ role: 'user', parts }],
      tools: [{ functionDeclarations: [tool] }],
      toolConfig: { functionCallingConfig: { mode: 'ANY' } },
      generationConfig: this.generationConfig(model, temperatureOk),
    });
  }

  /** A multi-row cell batch: batch system prompt + numbered tasks. */
  async cellBatch(model: string, system: string, prompts: string[], temperatureOk: boolean): Promise<ModelReply> {
    const user = prompts.map((p, i) => `Task ${i + 1}:\n${p}`).join('\n\n');
    return this.post(model, {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: this.generationConfig(model, temperatureOk),
    });
  }

  /** A single per-row cell call: the rendered prompt alone. */
  async cellSingle(model: string, prompt: string, temperatureOk: boolean): Promise<ModelReply> {
    return this.post(model, {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: this.generationConfig(model, temperatureOk),
    });
  }

  /** One generateText call — the :save-py Python translation. */
  async generateText(model: string, system: string, user: string, temperatureOk: boolean): Promise<ModelReply> {
    return this.post(model, {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: this.generationConfig(model, temperatureOk),
    });
  }
}

const MAX_TOKENS = 8192; // Anthropic/OpenAI require an output cap; Gemini does not.

export class AnthropicClient implements LlmClient {
  constructor(private opts: ClientOptions) {}

  private async post(body: Record<string, unknown>): Promise<ModelReply> {
    const base = this.opts.baseURL ?? 'https://api.anthropic.com/v1';
    const json = await postJson(this.opts, `${base}/messages`, {
      'x-api-key': this.opts.apiKey,
      'anthropic-version': '2023-06-01',
    }, body) as any;
    const blocks: any[] = json.content ?? [];
    const toolUse = blocks.find((b) => b.type === 'tool_use');
    const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('');
    return {
      functionCall: toolUse ? { name: toolUse.name, args: toolUse.input ?? {} } : undefined,
      text,
      usage: {
        inputTokens: json.usage?.input_tokens ?? 0,
        outputTokens: json.usage?.output_tokens ?? 0,
      },
    };
  }

  private common(model: string, temperatureOk: boolean): Record<string, unknown> {
    return { model, max_tokens: MAX_TOKENS, ...(temperatureOk ? { temperature: 0 } : {}) };
  }

  async patchTurn(model: string, call: PatchToolCall, temperatureOk: boolean): Promise<ModelReply> {
    if (call.audio) throw new Error('voice input is not supported by Anthropic models — select a voice-capable model');
    const tool = structuredClone(PATCH_TOOL) as typeof PATCH_TOOL & { parameters: any };
    if (call.withTranscript) {
      tool.parameters.properties.transcript = { type: 'string', description: 'Verbatim transcript of the attached audio.' };
    }
    return this.post({
      ...this.common(model, temperatureOk),
      system: call.system,
      messages: [{ role: 'user', content: call.user }],
      tools: [{ name: tool.name, description: tool.description, input_schema: tool.parameters }],
      tool_choice: { type: 'tool', name: tool.name },
    });
  }

  async cellBatch(model: string, system: string, prompts: string[], temperatureOk: boolean): Promise<ModelReply> {
    const user = prompts.map((p, i) => `Task ${i + 1}:\n${p}`).join('\n\n');
    return this.post({
      ...this.common(model, temperatureOk),
      system,
      messages: [{ role: 'user', content: user }],
    });
  }

  async cellSingle(model: string, prompt: string, temperatureOk: boolean): Promise<ModelReply> {
    return this.post({
      ...this.common(model, temperatureOk),
      messages: [{ role: 'user', content: prompt }],
    });
  }

  async generateText(model: string, system: string, user: string, temperatureOk: boolean): Promise<ModelReply> {
    return this.post({
      ...this.common(model, temperatureOk),
      system,
      messages: [{ role: 'user', content: user }],
    });
  }
}

export class OpenAIClient implements LlmClient {
  constructor(private opts: ClientOptions) {}

  private async post(body: Record<string, unknown>): Promise<ModelReply> {
    const base = this.opts.baseURL ?? 'https://api.openai.com/v1';
    const json = await postJson(this.opts, `${base}/chat/completions`, {
      authorization: `Bearer ${this.opts.apiKey}`,
    }, body) as any;
    const message = json.choices?.[0]?.message ?? {};
    const call = message.tool_calls?.[0]?.function;
    let args: Record<string, unknown> = {};
    if (call?.arguments) {
      try { args = JSON.parse(call.arguments); } catch { /* left empty — the turn is rejected and retried */ }
    }
    return {
      functionCall: call ? { name: call.name, args } : undefined,
      text: typeof message.content === 'string' ? message.content : '',
      usage: {
        inputTokens: json.usage?.prompt_tokens ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
      },
    };
  }

  private common(model: string, temperatureOk: boolean): Record<string, unknown> {
    return { model, ...(temperatureOk ? { temperature: 0 } : {}) };
  }

  async patchTurn(model: string, call: PatchToolCall, temperatureOk: boolean): Promise<ModelReply> {
    if (call.audio) throw new Error('voice input is not supported by OpenAI models — select a voice-capable model');
    const tool = structuredClone(PATCH_TOOL) as typeof PATCH_TOOL & { parameters: any };
    if (call.withTranscript) {
      tool.parameters.properties.transcript = { type: 'string', description: 'Verbatim transcript of the attached audio.' };
    }
    return this.post({
      ...this.common(model, temperatureOk),
      messages: [
        { role: 'system', content: call.system },
        { role: 'user', content: call.user },
      ],
      tools: [{ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } }],
      tool_choice: { type: 'function', function: { name: tool.name } },
    });
  }

  async cellBatch(model: string, system: string, prompts: string[], temperatureOk: boolean): Promise<ModelReply> {
    const user = prompts.map((p, i) => `Task ${i + 1}:\n${p}`).join('\n\n');
    return this.post({
      ...this.common(model, temperatureOk),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
  }

  async cellSingle(model: string, prompt: string, temperatureOk: boolean): Promise<ModelReply> {
    return this.post({
      ...this.common(model, temperatureOk),
      messages: [{ role: 'user', content: prompt }],
    });
  }

  async generateText(model: string, system: string, user: string, temperatureOk: boolean): Promise<ModelReply> {
    return this.post({
      ...this.common(model, temperatureOk),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
  }
}

/** Pick the wire protocol by the primary model's provider. */
export function clientFor(provider: 'gemini' | 'openai' | 'anthropic', opts: ClientOptions): LlmClient {
  if (provider === 'anthropic') return new AnthropicClient(opts);
  if (provider === 'openai') return new OpenAIClient(opts);
  return new GeminiClient(opts);
}
