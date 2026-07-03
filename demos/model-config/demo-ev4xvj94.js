// packages/model-config/models.json
var models_default = [
  { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash", desc: "Fast, voice-capable default", provider: "gemini", voiceInput: true, temperature: true, default: true },
  { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite", desc: "Cheapest per-row cell model", provider: "gemini", voiceInput: true, temperature: true, secondaryDefault: true },
  { id: "claude-sonnet-4-6", name: "Sonnet 4.6", desc: "Anthropic default", provider: "anthropic", voiceInput: false, temperature: true, default: true },
  { id: "claude-haiku-4-5", name: "Haiku 4.5", desc: "Anthropic cell model", provider: "anthropic", voiceInput: false, temperature: true, secondaryDefault: true },
  { id: "gpt-5.5", name: "GPT-5.5", desc: "OpenAI default", provider: "openai", voiceInput: false, temperature: false, default: true },
  { id: "gpt-5.4-mini", name: "GPT-5.4 mini", desc: "OpenAI cell model", provider: "openai", voiceInput: false, temperature: false, secondaryDefault: true }
];

// packages/model-config/index.ts
var ALL_MODELS = models_default;
function providerFor(modelId) {
  if (modelId.startsWith("claude-"))
    return "anthropic";
  if (modelId.startsWith("gpt-") || modelId.startsWith("o"))
    return "openai";
  return "gemini";
}
function defaultModel(provider) {
  return ALL_MODELS.find((m) => m.provider === provider && m.default).id;
}
function defaultCellModel(provider) {
  return ALL_MODELS.find((m) => m.provider === provider && m.secondaryDefault).id;
}
function resolveConfig(env, stored) {
  const anthropicKey = env.ANTHROPIC_API_KEY ?? stored.anthropicKey ?? null;
  const geminiKey = env.GEMINI_API_KEY ?? stored.geminiKey ?? null;
  const openaiKey = env.OPENAI_API_KEY ?? stored.openaiKey ?? null;
  const provider = env.GEMINI_API_KEY ? "gemini" : env.OPENAI_API_KEY ? "openai" : env.ANTHROPIC_API_KEY ? "anthropic" : stored.provider ?? "gemini";
  const model = env.TAMEDTABLE_MODEL ?? stored.model ?? defaultModel(provider);
  let cellModel = env.TAMEDTABLE_CELL_MODEL ?? stored.cellModel ?? defaultCellModel(provider);
  if (providerFor(cellModel) !== providerFor(model))
    cellModel = defaultCellModel(providerFor(model));
  return {
    provider,
    anthropicKey: provider === "anthropic" ? anthropicKey : null,
    geminiKey: provider === "gemini" ? geminiKey : null,
    openaiKey: provider === "openai" ? openaiKey : null,
    model,
    cellModel
  };
}

// packages/model-config/dom.ts
var CARDS = [
  { provider: "gemini", label: "Google", keyUrl: "https://aistudio.google.com/apikey" },
  { provider: "openai", label: "OpenAI", keyUrl: "https://platform.openai.com/api-keys" },
  { provider: "anthropic", label: "Anthropic", keyUrl: "https://console.anthropic.com/settings/keys" }
];
function helpLink(attr, href, text) {
  const a = document.createElement("a");
  a.setAttribute(attr, "");
  a.href = href;
  a.target = "_blank";
  a.rel = "noreferrer";
  a.textContent = text;
  a.style.cssText = "display:block;margin:6px 0;color:var(--mc-accent,#4759B2)";
  return a;
}
function modelRow(role, id, models) {
  const def = models.find((m) => m.id === id);
  const row = document.createElement("div");
  row.setAttribute("data-mc-model", id);
  row.setAttribute("data-mc-role", role);
  row.style.cssText = "display:flex;gap:8px;padding:2px 0;font-family:var(--mc-font-mono,monospace);font-size:13px";
  const label = document.createElement("span");
  label.textContent = `${role === "primary" ? "Primary" : "Secondary"}: ${id}`;
  row.appendChild(label);
  if (def?.voiceInput) {
    const tag = document.createElement("span");
    tag.textContent = "\uD83C\uDF99 voice";
    tag.style.cssText = "color:var(--mc-ok,#2E7D32);background:var(--mc-ok-soft,#E8F5E9);border-radius:var(--mc-radius-sm,4px);padding:0 4px";
    row.appendChild(tag);
  }
  return row;
}
function mountModelChooser(container, p) {
  const holder = container;
  holder.__mcProps = p;
  holder.__mcReveal ??= {};
  container.innerHTML = "";
  container.style.cssText = "font-family:var(--mc-font-ui,system-ui,sans-serif);color:var(--mc-ink,#281C60);max-width:480px";
  const intro = document.createElement("p");
  intro.textContent = "Pick a provider. The Primary model answers chat turns; the Secondary model fills table cells.";
  intro.style.cssText = "color:var(--mc-ink3,#666);font-size:13px";
  container.appendChild(intro);
  if (p.byokHelpUrl)
    container.appendChild(helpLink("data-mc-byok", p.byokHelpUrl, "New here? How to get an API key ↗"));
  for (const card of CARDS) {
    const box = document.createElement("section");
    box.setAttribute("data-mc-card", card.provider);
    box.style.cssText = "border:1px solid var(--mc-line,#DCDCDC);border-radius:var(--mc-radius,8px);margin:8px 0;background:var(--mc-surface,#FFF)";
    const head = document.createElement("button");
    head.setAttribute("data-mc-head", "");
    head.textContent = card.label + (p.provider === card.provider ? " ✓" : "");
    head.style.cssText = "display:block;width:100%;text-align:left;padding:8px 12px;border:0;cursor:pointer;font-size:15px;" + `background:${p.provider === card.provider ? "var(--mc-accent-soft,#EEF1FB)" : "var(--mc-surface2,#FAFAFA)"};` + "border-radius:var(--mc-radius,8px);color:inherit";
    head.addEventListener("click", () => holder.__mcProps.onProviderClick(card.provider));
    box.appendChild(head);
    if (p.expandedProvider === card.provider) {
      const body = document.createElement("div");
      body.style.cssText = "padding:8px 12px;border-top:1px solid var(--mc-line2,#EEE)";
      const keyRow = document.createElement("div");
      keyRow.style.cssText = "display:flex;gap:4px;margin-bottom:6px";
      const input = document.createElement("input");
      input.setAttribute("data-mc-key", card.provider);
      input.type = holder.__mcReveal[card.provider] ? "text" : "password";
      input.placeholder = "API key";
      input.value = p.keys[card.provider] ?? "";
      input.style.cssText = "flex:1;padding:4px 6px;border:1px solid var(--mc-line,#DCDCDC);border-radius:var(--mc-radius-sm,4px);font-family:var(--mc-font-mono,monospace)";
      input.addEventListener("input", () => holder.__mcProps.onKeyChange(card.provider, input.value));
      keyRow.appendChild(input);
      const reveal = document.createElement("button");
      reveal.setAttribute("data-mc-reveal", card.provider);
      reveal.type = "button";
      reveal.textContent = "\uD83D\uDC41";
      reveal.style.cssText = "cursor:pointer;border:1px solid var(--mc-line,#DCDCDC);border-radius:var(--mc-radius-sm,4px);background:var(--mc-surface3,#F3F3F3)";
      reveal.addEventListener("click", () => {
        holder.__mcReveal[card.provider] = !holder.__mcReveal[card.provider];
        mountModelChooser(container, holder.__mcProps);
      });
      keyRow.appendChild(reveal);
      body.appendChild(keyRow);
      const link = document.createElement("a");
      link.setAttribute("data-mc-keyurl", card.provider);
      link.href = card.keyUrl;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = "Get API key ↗";
      link.style.cssText = "display:block;margin:4px 0;color:var(--mc-accent,#4759B2);font-size:13px";
      body.appendChild(link);
      body.appendChild(modelRow("primary", p.primaryModel, p.models));
      body.appendChild(modelRow("secondary", p.secondaryModel, p.models));
      box.appendChild(body);
    }
    container.appendChild(box);
  }
  if (p.changeModelsHelpUrl) {
    container.appendChild(helpLink("data-mc-changemodels", p.changeModelsHelpUrl, "How to change primary and secondary models? ↗"));
  }
}

// packages/model-config/demo.ts
var provider = resolveConfig({}, {}).provider;
var expanded = null;
var keys = { anthropic: "", gemini: "", openai: "" };
var out = document.getElementById("out");
var log = (msg) => {
  out.textContent += `${msg}
`;
};
function render() {
  const resolved = resolveConfig({}, {
    provider,
    anthropicKey: keys.anthropic || null,
    geminiKey: keys.gemini || null,
    openaiKey: keys.openai || null,
    model: defaultModel(provider),
    cellModel: defaultCellModel(provider)
  });
  mountModelChooser(document.getElementById("chooser"), {
    models: ALL_MODELS,
    provider,
    keys,
    primaryModel: resolved.model,
    secondaryModel: resolved.cellModel,
    expandedProvider: expanded,
    byokHelpUrl: "BYOK-setup.html",
    changeModelsHelpUrl: "FAQ.html#change-models",
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
    }
  });
  document.getElementById("resolved").textContent = JSON.stringify(resolved, null, 2);
}
log("ready");
render();
