// ../marketing/tokens.json
var tokens_default = {
  brand: {
    ink: "#281C60",
    accent: "#96BED7",
    line: "#DCDCDC",
    white: "#FFFFFF",
    ground: "#ECF0F7",
    linen: "#F6F2EB"
  },
  typography: {
    ui: '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
    mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
    brand: '"Outfit", "Inter", ui-sans-serif, system-ui, sans-serif',
    size: {
      micro: 10.5,
      xs: 11.5,
      sm: 12.5,
      base: 13,
      md: 14,
      lg: 16,
      xl: 20
    }
  },
  space: {
    px1: 1,
    px2: 2,
    px4: 4,
    px6: 6,
    px8: 8,
    px10: 10,
    px12: 12,
    px14: 14,
    px16: 16,
    px20: 20,
    px24: 24,
    px32: 32,
    rowH: 28,
    headerH: 32,
    topbarH: 40,
    radiusSm: 4,
    radius: 6,
    radiusLg: 10
  },
  themes: {
    light: {
      name: "light",
      bg: "oklch(0.962 0.014 250)",
      surface: "oklch(1.00 0 0)",
      surface2: "oklch(0.975 0.010 250)",
      surface3: "oklch(0.940 0.015 250)",
      overlay: "oklch(0.20 0.10 287 / 0.45)",
      ink: "oklch(0.26 0.13 287)",
      ink2: "oklch(0.42 0.10 287)",
      ink3: "oklch(0.58 0.06 287)",
      ink4: "oklch(0.74 0.03 287)",
      inkOnAcc: "oklch(0.26 0.13 287)",
      inkOnInk: "oklch(0.97 0.012 89)",
      line: "oklch(0.89 0 0)",
      line2: "oklch(0.84 0 0)",
      ring: "oklch(0.77 0.06 240 / 0.55)",
      accent: "oklch(0.77 0.06 240)",
      accentHover: "oklch(0.72 0.07 240)",
      accentSoft: "oklch(0.94 0.025 240)",
      ok: "oklch(0.55 0.11 150)",
      okSoft: "oklch(0.94 0.04 150)",
      err: "oklch(0.54 0.18 25)",
      errSoft: "oklch(0.95 0.04 25)",
      rec: "#dc2626",
      onRec: "#ffffff",
      cellHi: "oklch(0.86 0.08 240)",
      cellHi2: "oklch(0.93 0.04 240)",
      shadow: "0 1px 2px rgba(40,28,96,.05), 0 4px 16px rgba(40,28,96,.07)",
      shadowLg: "0 10px 32px rgba(40,28,96,.14), 0 1px 0 rgba(40,28,96,.04)",
      dockBg: "oklch(0.26 0.13 287)",
      dockInk: "oklch(1 0 0 / 0.86)",
      dockBorder: "oklch(0.26 0.13 287)"
    },
    dark: {
      name: "dark",
      bg: "oklch(0.16 0.06 287)",
      surface: "oklch(0.20 0.08 287)",
      surface2: "oklch(0.23 0.09 287)",
      surface3: "oklch(0.27 0.10 287)",
      overlay: "oklch(0.10 0.05 287 / 0.65)",
      ink: "oklch(0.96 0.010 89)",
      ink2: "oklch(0.78 0.012 240)",
      ink3: "oklch(0.62 0.020 240)",
      ink4: "oklch(0.48 0.025 240)",
      inkOnAcc: "oklch(0.26 0.13 287)",
      inkOnInk: "oklch(0.26 0.13 287)",
      line: "oklch(0.32 0.05 287)",
      line2: "oklch(0.38 0.06 287)",
      ring: "oklch(0.77 0.06 240 / 0.65)",
      accent: "oklch(0.77 0.06 240)",
      accentHover: "oklch(0.82 0.07 240)",
      accentSoft: "oklch(0.32 0.07 240)",
      ok: "oklch(0.74 0.13 150)",
      okSoft: "oklch(0.30 0.06 150)",
      err: "oklch(0.70 0.17 25)",
      errSoft: "oklch(0.30 0.10 25)",
      rec: "#dc2626",
      onRec: "#ffffff",
      cellHi: "oklch(0.46 0.10 240)",
      cellHi2: "oklch(0.34 0.07 240)",
      shadow: "0 1px 2px rgba(0,0,0,.40), 0 6px 18px rgba(0,0,0,.40)",
      shadowLg: "0 12px 40px rgba(0,0,0,.55), 0 1px 0 rgba(255,255,255,.04)",
      dockBg: "#0c0c11",
      dockInk: "#ffffff",
      dockBorder: "oklch(1 0 0 / 0.10)"
    }
  }
};

// packages/ui-kit/index.ts
var BRAND = {
  ink: tokens_default.brand.ink,
  accent: tokens_default.brand.accent,
  line: tokens_default.brand.line
};
var lightTheme = tokens_default.themes.light;
var darkTheme = tokens_default.themes.dark;
var TOAST_MIN_MS = 3000;
var TOAST_MAX_MS = 12000;
var TOAST_MS_PER_CHAR = 80;
function toastDuration(message) {
  return Math.min(TOAST_MAX_MS, Math.max(TOAST_MIN_MS, message.length * TOAST_MS_PER_CHAR));
}

// packages/ui-kit/icons.ts
var ICONS = {
  check: { filled: false, body: '<path d="m3 8 3.5 3.5L13 5"/>' },
  chevLeft: { filled: false, body: '<path d="M10 4 6 8l4 4"/>' },
  chevRight: { filled: false, body: '<path d="M6 4l4 4-4 4"/>' },
  chevron: { filled: false, body: '<path d="m4 6 4 4 4-4"/>' },
  clock: { filled: false, body: '<path d="M8 2.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z M8 5.3V8l2 1.3"/>' },
  code: { filled: false, body: '<path d="M6 5 3 8l3 3 M10 5l3 3-3 3"/>' },
  copy: { filled: false, body: '<path d="M6 6h7v7H6Z M10 6V3.5A.5.5 0 0 0 9.5 3h-6a.5.5 0 0 0-.5.5v6a.5.5 0 0 0 .5.5H6"/>' },
  err: { filled: false, body: '<path d="M8 2 14 13H2L8 2Z M8 7v3 M8 12v.01"/>' },
  eye: { filled: false, body: '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/>' },
  eyeOff: { filled: false, body: '<path d="M6.2 6.2A2 2 0 0 0 9.8 9.8 M3 3l10 10 M5.2 5.3C2.9 6.6 1.5 8 1.5 8S4 12.5 8 12.5c1 0 1.9-.2 2.7-.6 M10.8 10.7C13 9.4 14.5 8 14.5 8S12 3.5 8 3.5"/>' },
  file: { filled: false, body: '<path d="M9 2H4.5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V5z M9 2v3h3"/>' },
  folder: { filled: false, body: '<path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6a1 1 0 0 1 .7.3l1 1H12.5A1.5 1.5 0 0 1 14 5.8v5.7A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5z"/>' },
  grip: { filled: false, body: '<path d="M6 4v8 M10 4v8"/>' },
  keyboard: { filled: false, body: '<path d="M2 4.75h12A1.25 1.25 0 0 1 15.25 6v4A1.25 1.25 0 0 1 14 11.25H2A1.25 1.25 0 0 1 .75 10V6A1.25 1.25 0 0 1 2 4.75Z M3.4 7.4h.01 M5.7 7.4h.01 M8 7.4h.01 M10.3 7.4h.01 M12.6 7.4h.01 M5.2 9.6h5.6"/>' },
  link: { filled: false, body: '<path d="M6.6 9.4 9.4 6.6 M7.2 5 8.2 4a2.5 2.5 0 0 1 3.5 3.5l-1 1 M8.8 11l-1 1a2.5 2.5 0 0 1-3.5-3.5l1-1"/>' },
  menu: { filled: false, body: '<path d="M2.5 4.5h11 M2.5 8h11 M2.5 11.5h11"/>' },
  mic: { filled: false, body: '<path d="M8 2.5a2 2 0 0 1 2 2v3.5a2 2 0 0 1-4 0V4.5a2 2 0 0 1 2-2Z M4.5 8a3.5 3.5 0 0 0 7 0 M8 11.5V14 M6 14h4"/>' },
  moon: { filled: false, body: '<path d="M13.2 9.4A5.5 5.5 0 0 1 6.6 2.8 5.5 5.5 0 1 0 13.2 9.4Z"/>' },
  ok: { filled: false, body: '<path d="m3 8 3.5 3.5L13 5"/>' },
  play: { filled: true, body: '<path d="M5 3.4 12.5 8 5 12.6Z"/>' },
  redo: { filled: false, body: '<path d="m11 5 2.5 2.5L11 10 M13.5 7.5H6a3.5 3.5 0 1 0 0 7h3"/>' },
  save: { filled: false, body: '<path d="M3 3h7l3 3v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z M5 3v3h5V3 M5 13v-4h6v4"/>' },
  send: { filled: false, body: '<path d="m2.5 8 11-5-3 12-3-5-5-2Z"/>' },
  sparkle: { filled: false, body: '<path d="M8 2.5 9.2 5.8 12.5 7 9.2 8.2 8 11.5 6.8 8.2 3.5 7 6.8 5.8Z"/>' },
  stop: { filled: true, body: '<path d="M5 5h6v6H5z"/>' },
  sun: { filled: false, body: '<path d="M8 5.4a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2Z M8 1.4v1.8 M8 12.8v1.8 M1.4 8h1.8 M12.8 8h1.8 M3.4 3.4l1.3 1.3 M11.3 11.3l1.3 1.3 M3.4 12.6l1.3-1.3 M11.3 4.7l1.3-1.3"/>' },
  tour: { filled: false, body: '<path d="M8 2.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z M10.3 5.7 9 9 5.7 10.3 7 7z"/>' },
  undo: { filled: false, body: '<path d="M5 5 2.5 7.5 5 10 M2.5 7.5h7.5a3.5 3.5 0 1 1 0 7H7"/>' },
  upload: { filled: false, body: '<path d="M8 10V3 M5 6l3-3 3 3 M2.5 11.5v1A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5v-1"/>' },
  wave: { filled: false, body: '<path d="M2.5 6.5v3 M5.25 4v8 M8 2v12 M10.75 4v8 M13.5 6.5v3"/>' },
  wrench: { filled: false, body: '<path d="M9.8 4.2a.67.67 0 0 0 0 .94l1.06 1.06a.67.67 0 0 0 .94 0l2.51-2.51a4 4 0 0 1-5.29 5.29l-4.61 4.61a1.41 1.41 0 0 1-2-2l4.61-4.61a4 4 0 0 1 5.29-5.29L9.8 4.2Z"/>' },
  x: { filled: false, body: '<path d="m4 4 8 8 M12 4l-8 8"/>' }
};
var ICON_NAMES = Object.keys(ICONS);

// packages/ui-kit/dom.ts
function applyTheme(el, mode, theme) {
  el.setAttribute("data-uk-mode", mode);
  for (const [key, value] of Object.entries(theme))
    el.style.setProperty(`--uk-${key}`, value);
  el.style.background = "var(--uk-bg)";
  el.style.color = "var(--uk-ink)";
}
var VARIANT_CSS = {
  ghost: "background:transparent;color:var(--uk-ink,#281C60);border:1px solid transparent",
  chrome: "background:var(--uk-surface2,#f4f4f4);color:var(--uk-ink,#281C60);border:1px solid var(--uk-line,#DCDCDC)",
  primary: "background:var(--uk-ink,#281C60);color:var(--uk-inkOnInk,#fff);border:1px solid var(--uk-ink,#281C60)",
  danger: "background:var(--uk-err,#B3261E);color:#fff;border:1px solid var(--uk-err,#B3261E)"
};
function createButton(p) {
  const btn = document.createElement("button");
  const variant = p.variant ?? "ghost";
  btn.setAttribute("data-uk-button", variant);
  btn.textContent = p.label;
  btn.style.cssText = `${VARIANT_CSS[variant]};padding:4px 12px;border-radius:6px;cursor:pointer;font:inherit`;
  if (p.title)
    btn.title = p.title;
  btn.disabled = p.disabled ?? false;
  if (p.onClick)
    btn.addEventListener("click", p.onClick);
  return btn;
}
function createIcon(name, size = 16) {
  const glyph = ICONS[name];
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("data-uk-icon", name);
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", glyph.filled ? "currentColor" : "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.5");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.innerHTML = glyph.body;
  return svg;
}
function createSplitButton(p) {
  const wrap = document.createElement("span");
  wrap.style.cssText = "position:relative;display:inline-flex";
  const main = createButton({ label: p.label, onClick: p.onClick, variant: "chrome", disabled: p.disabled, title: p.title });
  main.setAttribute("data-uk-split-main", "");
  wrap.appendChild(main);
  const caret = createButton({ label: "▾", variant: "chrome", disabled: p.disabled, title: p.caretTitle });
  caret.setAttribute("data-uk-split-caret", "");
  wrap.appendChild(caret);
  let menu = null;
  const close = () => {
    menu?.remove();
    menu = null;
    document.removeEventListener("click", onOutside);
    document.removeEventListener("keydown", onEscape);
  };
  const onOutside = (e) => {
    if (!wrap.contains(e.target))
      close();
  };
  const onEscape = (e) => {
    if (e.key === "Escape")
      close();
  };
  caret.addEventListener("click", () => {
    if (menu)
      return close();
    menu = document.createElement("div");
    menu.style.cssText = "position:absolute;top:100%;right:0;min-width:160px;z-index:10;" + "background:var(--uk-surface,#fff);border:1px solid var(--uk-line,#DCDCDC);border-radius:6px;" + "box-shadow:var(--uk-shadow,0 2px 8px rgba(0,0,0,.15));padding:4px";
    for (const item of p.menu) {
      const btn = document.createElement("button");
      btn.setAttribute("data-uk-menu-item", item.label);
      btn.textContent = item.label;
      btn.disabled = item.disabled ?? false;
      btn.style.cssText = "display:block;width:100%;text-align:left;padding:4px 8px;font:inherit;" + "background:transparent;color:var(--uk-ink,#281C60);border:none;cursor:pointer";
      btn.addEventListener("click", () => {
        close();
        item.onClick();
      });
      menu.appendChild(btn);
    }
    wrap.appendChild(menu);
    document.addEventListener("click", onOutside);
    document.addEventListener("keydown", onEscape);
  });
  return wrap;
}
var LEAVE_MS = 200;
function mountToasts(container, toasts, onDismiss) {
  const holder = container;
  for (const t of holder.__ukTimers ?? [])
    clearTimeout(t);
  holder.__ukTimers = [];
  container.innerHTML = "";
  container.style.cssText = toasts.length === 0 ? "" : "position:fixed;bottom:16px;right:16px;display:flex;flex-direction:column;gap:8px;z-index:20";
  for (const toast of toasts) {
    const el = document.createElement("div");
    el.setAttribute("data-uk-toast", toast.kind);
    el.style.cssText = "display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:6px;" + "transition:opacity 0.2s;" + (toast.kind === "error" ? "background:var(--uk-errSoft,#fde7e7);color:var(--uk-err,#B3261E);border:1px solid var(--uk-err,#B3261E)" : "background:var(--uk-surface,#fff);color:var(--uk-ink,#281C60);border:1px solid var(--uk-line,#DCDCDC)");
    const msg = document.createElement("span");
    msg.textContent = toast.message;
    el.appendChild(msg);
    const dismiss = document.createElement("button");
    dismiss.setAttribute("data-uk-toast-dismiss", "");
    dismiss.textContent = "×";
    dismiss.title = "Dismiss";
    dismiss.style.cssText = "background:transparent;border:none;color:inherit;cursor:pointer;font:inherit";
    dismiss.addEventListener("click", () => onDismiss(toast.id));
    el.appendChild(dismiss);
    const schedule = () => window.setTimeout(() => {
      el.setAttribute("data-uk-toast-leaving", "");
      el.style.opacity = "0";
      holder.__ukTimers.push(window.setTimeout(() => onDismiss(toast.id), LEAVE_MS));
    }, toastDuration(toast.message));
    let timer = schedule();
    holder.__ukTimers.push(timer);
    el.addEventListener("mouseenter", () => clearTimeout(timer));
    el.addEventListener("mouseleave", () => {
      el.removeAttribute("data-uk-toast-leaving");
      el.style.opacity = "";
      timer = schedule();
      holder.__ukTimers.push(timer);
    });
    container.appendChild(el);
  }
}

// packages/ui-kit/demo.ts
var app = document.getElementById("app");
var out = document.getElementById("out");
var log = (msg) => {
  out.textContent += `${msg}
`;
};
var buttons = document.getElementById("buttons");
for (const variant of ["ghost", "chrome", "primary", "danger"]) {
  buttons.appendChild(createButton({ label: variant, variant, onClick: () => log(`${variant} clicked`) }));
}
var icons = document.getElementById("icons");
for (const name of ICON_NAMES) {
  const cell = document.createElement("span");
  cell.title = name;
  cell.appendChild(createIcon(name));
  icons.appendChild(cell);
}
document.getElementById("split").appendChild(createSplitButton({
  label: "Save",
  onClick: () => log("Save clicked"),
  menu: [{ label: "Save as flow", onClick: () => log("Save as flow clicked") }]
}));
var toastHost = document.getElementById("toasts");
var toasts = [];
var nextId = 1;
var renderToasts = () => mountToasts(toastHost, toasts, dismiss);
function dismiss(id) {
  toasts = toasts.filter((t) => t.id !== id);
  log(`toast ${id} dismissed`);
  renderToasts();
}
function addToast(kind, message) {
  toasts = [...toasts, { id: nextId++, kind, message }];
  log(`${kind} toast added`);
  renderToasts();
}
var mode = "light";
function setMode(next) {
  mode = next;
  applyTheme(app, mode, mode === "dark" ? darkTheme : lightTheme);
  log(`mode ${mode}`);
}
var controls = document.getElementById("controls");
controls.appendChild(Object.assign(createButton({ label: "Add info toast", variant: "chrome", onClick: () => addToast("info", "Saved out.csv.") }), { id: "add-info" }));
controls.appendChild(Object.assign(createButton({ label: "Add error toast", variant: "chrome", onClick: () => addToast("error", "Query failed: table not found.") }), { id: "add-error" }));
controls.appendChild(Object.assign(createButton({ label: "Toggle theme", variant: "chrome", onClick: () => setMode(mode === "light" ? "dark" : "light") }), { id: "theme-toggle" }));
applyTheme(app, mode, lightTheme);
log("ready");
