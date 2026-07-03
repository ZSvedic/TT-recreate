// #LlmClient — Gemini generateContent over plain fetch. The request body is
// deterministic JSON so the cassette recorder can fingerprint and replay it.
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface ClientOptions {
  apiKey: string;
  baseURL?: string;
  fetch?: FetchLike;
  maxRetries?: number;
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

export class GeminiClient {
  constructor(private opts: ClientOptions) {}

  private url(model: string): string {
    const base = this.opts.baseURL ?? 'https://generativelanguage.googleapis.com/v1beta';
    return `${base}/models/${model}:generateContent`;
  }

  private async post(model: string, body: Record<string, unknown>): Promise<ModelReply> {
    const doFetch = this.opts.fetch ?? fetch;
    const payload = JSON.stringify(body);
    const retries = this.opts.maxRetries ?? 2;
    let res: Response | null = null;
    for (let attempt = 0; ; attempt++) {
      res = await doFetch(this.url(model), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.opts.apiKey },
        body: payload,
      });
      if (res.ok || attempt >= retries || (res.status < 500 && res.status !== 429)) break;
    }
    if (!res.ok) throw new Error(`model call failed: HTTP ${res.status} ${await res.text().then((t) => t.slice(0, 200))}`);
    const json = await res.json() as any;
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
