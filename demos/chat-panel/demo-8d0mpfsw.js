// packages/chat-panel/index.ts
function isErrorText(text) {
  return text.startsWith("Error:");
}
function displayText(text) {
  return isErrorText(text) ? text.slice("Error:".length).trim() : text;
}
function formatRequestDetail(d) {
  const lines = [`request: ${d.request}`];
  const summary = [
    d.model ? `model ${d.model}` : "",
    d.inputTokens != null ? `${d.inputTokens} tokens in` : "",
    d.outputTokens != null ? `${d.outputTokens} tokens out` : "",
    d.elapsedMs != null ? `${d.elapsedMs} ms` : ""
  ].filter(Boolean);
  if (summary.length > 0)
    lines.push(summary.join(" · "));
  for (const turn of d.turns ?? []) {
    lines.push(turn.summary);
    for (const op of turn.ops ?? [])
      lines.push(`  ${op}`);
  }
  for (const sample of d.cellSamples ?? [])
    lines.push(`sample: ${sample}`);
  return lines.join(`
`);
}

// packages/chat-panel/dom.ts
var HOLD_THRESHOLD_MS = 250;
var micDownAt = null;
function mountMicButton(container, p) {
  container.innerHTML = "";
  if (p.status === "latched") {
    const cancel = document.createElement("button");
    cancel.setAttribute("data-testid", "mic-cancel");
    cancel.textContent = "✕";
    cancel.addEventListener("click", () => p.onCancel());
    const dot = document.createElement("span");
    dot.setAttribute("data-cp-mic-dot", "");
    dot.textContent = "●";
    dot.style.cssText = "color:#C0392B;animation:cp-pulse 1s infinite";
    const send = document.createElement("button");
    send.setAttribute("data-testid", "mic-send");
    send.textContent = "✓";
    send.addEventListener("click", () => p.onStop());
    container.append(cancel, dot, send);
    container.addEventListener("keydown", (e) => {
      if (e.key === "Escape")
        p.onCancel();
    });
    return;
  }
  const btn = document.createElement("button");
  btn.setAttribute("data-testid", "mic-button");
  btn.textContent = p.status === "sending" ? "◌" : "\uD83C\uDFA4";
  if (p.status === "recording") {
    btn.style.cssText = "background:#C0392B;color:#fff;box-shadow:0 0 0 3px rgba(192,57,43,.4)";
  }
  btn.addEventListener("pointerdown", () => {
    if (p.status === "sending")
      return;
    micDownAt = Date.now();
    p.onStart();
  });
  btn.addEventListener("pointerup", () => {
    if (micDownAt === null)
      return;
    const held = Date.now() - micDownAt >= HOLD_THRESHOLD_MS;
    micDownAt = null;
    if (held)
      p.onStop();
    else
      p.onLatch();
  });
  btn.addEventListener("pointercancel", () => {
    micDownAt = null;
    p.onCancel();
  });
  btn.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      micDownAt = null;
      p.onCancel();
    }
  });
  container.appendChild(btn);
}
function mountChatPanel(container, p) {
  const prevInput = container.querySelector("[data-cp-input]");
  const draft = p.prefill ?? prevInput?.value ?? "";
  const expanded = new Set(Array.from(container.querySelectorAll("[data-cp-detail]"), (el) => el.getAttribute("data-cp-detail")));
  container.innerHTML = "";
  container.style.fontFamily = "var(--cp-font, system-ui, sans-serif)";
  const header = document.createElement("div");
  header.style.cssText = "display:flex;gap:8px;align-items:center;border-bottom:1px solid var(--cp-line,#DCDCDC);padding:4px 0";
  const title = document.createElement("span");
  title.setAttribute("data-cp-count", "");
  title.textContent = `Requests · ${p.requestCount}${p.streaming ? " · running" : ""}`;
  header.appendChild(title);
  const help = document.createElement("button");
  help.setAttribute("data-cp-help", "");
  help.textContent = "?";
  const helpList = document.createElement("ul");
  helpList.setAttribute("data-cp-help-lines", "");
  helpList.style.display = "none";
  for (const line of p.helpLines ?? []) {
    const li = document.createElement("li");
    li.textContent = line;
    helpList.appendChild(li);
  }
  help.addEventListener("click", () => {
    helpList.style.display = helpList.style.display === "none" ? "" : "none";
  });
  header.append(help, helpList);
  container.appendChild(header);
  const list = document.createElement("div");
  list.setAttribute("data-cp-list", "");
  if (p.messages.length === 0 && p.emptyState) {
    const empty = document.createElement("p");
    empty.setAttribute("data-cp-empty", "");
    empty.textContent = p.emptyState;
    list.appendChild(empty);
  }
  for (const msg of p.messages) {
    const wrap = document.createElement("div");
    wrap.setAttribute("data-cp-message", msg.role);
    if (msg.role === "user") {
      wrap.style.cssText = "background:var(--cp-accent,#96BED7);border-radius:8px;padding:6px 10px;margin:6px 0 6px 24px";
      wrap.textContent = msg.text;
    } else {
      const error = isErrorText(msg.text);
      wrap.style.cssText = "padding:6px 0;margin:6px 24px 6px 0";
      const dot = document.createElement("span");
      dot.textContent = error ? "⚠ " : "● ";
      dot.style.color = error ? "#C0392B" : "#2E8B57";
      const body = document.createElement("span");
      body.textContent = displayText(msg.text);
      if (error) {
        wrap.setAttribute("data-cp-error", "");
        body.style.color = "#C0392B";
      }
      wrap.append(dot, body);
      if (msg.debug) {
        const debug = msg.debug;
        const detailFor = () => wrap.querySelector("[data-cp-detail]");
        const expand = () => {
          const detail = document.createElement("pre");
          detail.setAttribute("data-cp-detail", msg.id);
          detail.style.cssText = "font-size:12px;color:var(--cp-ink-3,#555);white-space:pre-wrap";
          detail.textContent = formatRequestDetail(debug);
          wrap.appendChild(detail);
        };
        const toggle = document.createElement("button");
        toggle.setAttribute("data-cp-detail-toggle", msg.id);
        toggle.textContent = "request detail";
        toggle.addEventListener("click", () => {
          const open = detailFor();
          if (open)
            open.remove();
          else
            expand();
        });
        const copy = document.createElement("button");
        copy.setAttribute("data-testid", "copy-debug");
        copy.textContent = "copy";
        copy.addEventListener("click", () => {
          navigator.clipboard?.writeText(formatRequestDetail(debug));
        });
        wrap.append(document.createElement("br"), toggle, copy);
        if (expanded.has(msg.id))
          expand();
      }
    }
    list.appendChild(wrap);
  }
  if (p.streaming) {
    const running = document.createElement("div");
    running.setAttribute("data-cp-running", "");
    running.textContent = "Running…";
    running.style.cssText = "color:var(--cp-ink-3,#555);animation:cp-pulse 1s infinite";
    list.appendChild(running);
  }
  container.appendChild(list);
  const inputRow = document.createElement("div");
  inputRow.style.cssText = "display:flex;gap:6px;align-items:flex-end;border-top:1px solid var(--cp-line,#DCDCDC);padding-top:6px";
  const input = document.createElement("textarea");
  input.setAttribute("data-cp-input", "");
  input.rows = 2;
  input.style.flex = "1";
  input.value = draft;
  inputRow.appendChild(input);
  if (p.micSlot) {
    const slot = document.createElement("span");
    slot.setAttribute("data-cp-mic-slot", "");
    p.micSlot(slot);
    inputRow.appendChild(slot);
  }
  const send = () => {
    const text = input.value.trim();
    if (text === "")
      return;
    input.value = "";
    p.onSend(text);
  };
  if (p.streaming) {
    const stop = document.createElement("button");
    stop.setAttribute("data-cp-stop", "");
    stop.textContent = "■";
    stop.addEventListener("click", () => p.onCancel());
    inputRow.appendChild(stop);
  } else {
    const sendBtn = document.createElement("button");
    sendBtn.setAttribute("data-cp-send", "");
    sendBtn.textContent = "➤";
    sendBtn.disabled = draft.trim() === "";
    sendBtn.addEventListener("click", send);
    input.addEventListener("input", () => {
      sendBtn.disabled = input.value.trim() === "";
    });
    inputRow.appendChild(sendBtn);
  }
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!p.streaming)
        send();
    }
  });
  container.appendChild(inputRow);
}

// packages/chat-panel/demo.ts
var nextId = 1;
var messages = [];
var streaming = false;
var prefill = null;
var micStatus = "idle";
var out = document.getElementById("out");
var log = (msg) => {
  out.textContent += `${msg}
`;
};
var DETAIL = {
  request: "normalize the phone column",
  model: "demo-model",
  inputTokens: 120,
  outputTokens: 40,
  elapsedMs: 850,
  turns: [{ summary: "turn 1: committed", ops: ["set_cells phone ×3"] }],
  cellSamples: ["+1 (555) 010-0100"]
};
function push(role, text, debug) {
  messages.push({ id: String(nextId++), role, text, debug });
}
function render() {
  mountChatPanel(document.getElementById("panel"), {
    messages,
    streaming,
    requestCount: messages.filter((m) => m.role === "user").length,
    prefill,
    onSend: (text) => {
      prefill = null;
      push("user", text);
      push("assistant", `Did: ${text}`);
      log(`send ${text}`);
      render();
    },
    onCancel: () => {
      streaming = false;
      log("cancel");
      render();
    },
    emptyState: "Load a table to begin…",
    helpLines: ["Double-click a cell to edit it", "Enter sends, Shift+Enter for a newline"],
    micSlot: (el) => mountMicButton(el, {
      status: micStatus,
      onStart: () => {
        micStatus = "recording";
        log("voice start");
        render();
      },
      onLatch: () => {
        micStatus = "latched";
        log("voice latch");
        render();
      },
      onStop: () => {
        micStatus = "idle";
        log("voice stop");
        render();
      },
      onCancel: () => {
        micStatus = "idle";
        log("voice cancel");
        render();
      }
    })
  });
}
document.getElementById("add-error").addEventListener("click", () => {
  push("assistant", "Error: Something broke");
  log("error reply");
  render();
});
document.getElementById("add-detail").addEventListener("click", () => {
  push("assistant", "Applied the change.", DETAIL);
  log("detail reply");
  render();
});
document.getElementById("toggle-streaming").addEventListener("click", () => {
  streaming = !streaming;
  log(`streaming ${streaming}`);
  render();
});
document.getElementById("prefill").addEventListener("click", () => {
  prefill = "Keep rows where age >= 18";
  log("prefill");
  render();
});
log("ready");
render();
