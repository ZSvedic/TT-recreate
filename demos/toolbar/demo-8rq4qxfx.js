// packages/toolbar/index.ts
function sampleLabel(name) {
  return name.toLowerCase().endsWith(".csv") ? "CSV" : "JSONL";
}

// packages/toolbar/dom.ts
function button(label, disabled, onClick) {
  const btn = document.createElement("button");
  btn.setAttribute("data-tb-action", label);
  btn.textContent = label;
  btn.disabled = disabled;
  btn.addEventListener("click", onClick);
  return btn;
}
function splitButton(key, label, disabled, onPrimary, menu) {
  const wrap = document.createElement("span");
  wrap.style.cssText = "position:relative;display:inline-flex";
  wrap.appendChild(button(label, disabled, onPrimary));
  const caret = document.createElement("button");
  caret.setAttribute("data-tb-menu-toggle", key);
  caret.textContent = "▾";
  caret.disabled = disabled;
  const list = document.createElement("div");
  list.setAttribute("data-tb-menu", key);
  list.style.cssText = "position:absolute;top:100%;left:0;background:#fff;" + "border:1px solid var(--tb-line,#DCDCDC);display:none;flex-direction:column;z-index:1";
  for (const item of menu) {
    const entry = document.createElement("button");
    entry.setAttribute("data-tb-menu-item", item.label);
    entry.textContent = item.label;
    entry.addEventListener("click", () => {
      list.style.display = "none";
      item.onClick();
    });
    list.appendChild(entry);
  }
  caret.addEventListener("click", () => {
    list.style.display = list.style.display === "none" ? "flex" : "none";
  });
  wrap.appendChild(caret);
  wrap.appendChild(list);
  return wrap;
}
function mountToolbar(container, p) {
  container.innerHTML = "";
  const bar = document.createElement("div");
  bar.setAttribute("data-tb-toolbar", "");
  bar.style.cssText = "display:flex;align-items:center;gap:8px;padding:8px;" + "border-bottom:1px solid var(--tb-line,#DCDCDC)";
  const brand = document.createElement("span");
  brand.setAttribute("data-tb-brand", "");
  brand.textContent = "TamedTable";
  brand.style.cssText = "font-weight:700;color:var(--tb-ink,#281C60)";
  bar.appendChild(brand);
  const info = document.createElement("span");
  info.setAttribute("data-tb-info", "");
  info.style.cssText = "font-family:monospace;font-size:12px;flex:1";
  info.textContent = p.loaded ? `${p.fileName} · ${p.rowCount} rows × ${p.colCount} cols` : "";
  bar.appendChild(info);
  const gate = p.busy;
  bar.appendChild(splitButton("open", "Open sample…", gate, p.onOpenSample, [
    { label: "Open local…", onClick: p.onOpenLocal },
    { label: "Open URL…", onClick: p.onOpenUrl }
  ]));
  bar.appendChild(splitButton("save-data", "Save data", gate || !p.loaded, p.onSaveData, p.saveDataMenu));
  bar.appendChild(splitButton("save-flow", "Save flow", gate || !p.loaded, p.onSaveFlow, p.saveFlowMenu));
  bar.appendChild(button("Undo", gate || !p.canUndo, p.onUndo));
  bar.appendChild(button("Redo", gate || !p.canRedo, p.onRedo));
  const theme = document.createElement("button");
  theme.setAttribute("data-tb-theme", "");
  theme.textContent = "Theme";
  theme.addEventListener("click", p.onToggleTheme);
  bar.appendChild(theme);
  bar.appendChild(button("Settings", false, p.onOpenSettings));
  bar.appendChild(button("Tours", false, p.onOpenTutorial));
  container.appendChild(bar);
}
function mountUrlDialog(container, p) {
  container.innerHTML = "";
  if (!p.open)
    return;
  const dialog = document.createElement("div");
  dialog.setAttribute("data-tb-dialog", "");
  dialog.style.cssText = "border:1px solid var(--tb-line,#DCDCDC);padding:12px;" + "display:flex;gap:8px;align-items:center";
  const input = document.createElement("input");
  input.setAttribute("data-tb-url-input", "");
  input.placeholder = "https://…";
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape")
      p.onClose();
  });
  dialog.appendChild(input);
  const load = document.createElement("button");
  load.setAttribute("data-tb-url-submit", "");
  load.textContent = "Load";
  load.addEventListener("click", () => p.onSubmit(input.value));
  dialog.appendChild(load);
  const close = document.createElement("button");
  close.setAttribute("data-tb-url-close", "");
  close.textContent = "Cancel";
  close.addEventListener("click", p.onClose);
  dialog.appendChild(close);
  container.appendChild(dialog);
  input.focus();
}
function mountSampleDialog(container, p) {
  container.innerHTML = "";
  if (!p.open)
    return;
  const dialog = document.createElement("div");
  dialog.setAttribute("data-tb-sample-dialog", "");
  dialog.style.cssText = "border:1px solid var(--tb-line,#DCDCDC);padding:12px;" + "display:flex;flex-direction:column;gap:4px";
  for (const sample of p.samples) {
    const row = document.createElement("button");
    row.setAttribute("data-tb-sample", sample.url);
    row.style.cssText = "display:flex;gap:8px;text-align:left";
    const badge = document.createElement("span");
    badge.setAttribute("data-tb-sample-kind", "");
    badge.textContent = sampleLabel(sample.name);
    row.appendChild(badge);
    row.appendChild(document.createTextNode(sample.name));
    row.addEventListener("click", () => p.onPick(sample.url));
    dialog.appendChild(row);
  }
  const close = document.createElement("button");
  close.setAttribute("data-tb-sample-close", "");
  close.textContent = "Cancel";
  close.addEventListener("click", p.onClose);
  dialog.appendChild(close);
  container.appendChild(dialog);
}

// packages/toolbar/demo.ts
var samples = [
  { name: "customers-input.csv", url: "https://example.com/customers-input.csv" },
  { name: "videos.jsonl", url: "https://example.com/videos.jsonl" }
];
var theme = "light";
var urlOpen = false;
var sampleOpen = false;
var out = document.getElementById("out");
var log = (msg) => {
  out.textContent += `${msg}
`;
};
function render() {
  document.body.setAttribute("data-theme", theme);
  mountToolbar(document.getElementById("toolbar"), {
    loaded: true,
    busy: false,
    fileName: "customers-input.csv",
    rowCount: 95,
    colCount: 3,
    canUndo: true,
    canRedo: true,
    onOpenSample: () => {
      sampleOpen = true;
      log("open sample picker");
      render();
    },
    onOpenLocal: () => log("open local"),
    onOpenUrl: () => {
      urlOpen = true;
      log("open url dialog");
      render();
    },
    onSaveData: () => log("save data"),
    onSaveFlow: () => log("save flow"),
    onUndo: () => log("undo"),
    onRedo: () => log("redo"),
    onToggleTheme: () => {
      theme = theme === "light" ? "dark" : "light";
      log("toggle theme");
      render();
    },
    onOpenSettings: () => log("open settings"),
    onOpenTutorial: () => log("open tutorial"),
    saveDataMenu: [
      { label: "Save as JSONL…", onClick: () => log("save as jsonl") }
    ],
    saveFlowMenu: [
      { label: "Save as Flow…", onClick: () => log("save as flow") },
      { label: "Save as Python…", onClick: () => log("save as python") }
    ]
  });
  mountUrlDialog(document.getElementById("url-dialog"), {
    open: urlOpen,
    onSubmit: (url) => {
      urlOpen = false;
      log(`open url ${url}`);
      render();
    },
    onClose: () => {
      urlOpen = false;
      render();
    }
  });
  mountSampleDialog(document.getElementById("sample-dialog"), {
    open: sampleOpen,
    samples,
    onPick: (url) => {
      sampleOpen = false;
      log(`open sample ${url}`);
      render();
    },
    onClose: () => {
      sampleOpen = false;
      render();
    }
  });
}
log("ready");
render();
