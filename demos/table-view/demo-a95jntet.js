// packages/table-view/index.ts
function pageCountFor(totalRows, pageSize) {
  return Math.max(1, Math.ceil(totalRows / pageSize));
}
function clampPage(page, pageCount) {
  return Math.min(Math.max(1, page), pageCount);
}
function pageSlice(rows, pageSize, page) {
  const p = clampPage(page, pageCountFor(rows.length, pageSize));
  return rows.slice((p - 1) * pageSize, p * pageSize);
}
function pageList(current, total) {
  if (total <= 7)
    return Array.from({ length: total }, (_v, i) => i + 1);
  if (current <= 3)
    return [1, 2, 3, 4, 5, "…", total];
  if (current >= total - 2)
    return [1, "…", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "…", current - 1, current, current + 1, "…", total];
}

// packages/table-view/dom.ts
function updateSelection(container, selection) {
  for (const cell of container.querySelectorAll("[data-tv-cell]")) {
    const on = selection && cell.getAttribute("data-tv-cell") === `${selection.row}:${selection.col}`;
    cell.style.background = on ? "var(--tv-accent,#96BED7)" : "";
  }
  const sel = container.querySelector("[data-tv-selection]");
  if (sel)
    sel.textContent = selection ? `R${selection.row + 1} · ${selection.col}` : "";
}
function splitCellKey(key) {
  const at = key.indexOf(":");
  return [Number(key.slice(0, at)), key.slice(at + 1)];
}
function openCellEditor(cell, holder) {
  const [row, col] = splitCellKey(cell.getAttribute("data-tv-cell"));
  const input = document.createElement("input");
  input.setAttribute("data-tv-edit", "");
  input.value = cell.textContent ?? "";
  cell.textContent = "";
  cell.appendChild(input);
  let done = false;
  const finish = (commit) => {
    if (done)
      return;
    done = true;
    if (commit)
      holder.__tvProps.onEditCell(row, col, input.value);
    else
      holder.__tvProps.onSelectCell(row, col);
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter")
      finish(true);
    if (e.key === "Escape")
      finish(false);
  });
  input.addEventListener("blur", () => finish(true));
  input.focus();
}
function mountTableView(container, p) {
  const holder = container;
  if (!holder.__tvProps) {
    container.addEventListener("click", (e) => {
      const cell = e.target.closest?.("[data-tv-cell]");
      if (!cell || cell.querySelector("[data-tv-edit]"))
        return;
      const [row, col] = splitCellKey(cell.getAttribute("data-tv-cell"));
      holder.__tvProps.onSelectCell(row, col);
    });
    container.addEventListener("dblclick", (e) => {
      const cell = e.target.closest?.("[data-tv-cell]");
      if (!cell || cell.querySelector("[data-tv-edit]"))
        return;
      openCellEditor(cell, holder);
    });
  }
  holder.__tvProps = p;
  container.innerHTML = "";
  container.style.fontFamily = "var(--tv-font, system-ui, sans-serif)";
  if (p.streaming) {
    const banner = document.createElement("div");
    banner.setAttribute("data-tv-streaming", "");
    banner.textContent = "Streaming results…";
    banner.style.cssText = "padding:4px 8px;background:var(--tv-accent,#96BED7);color:var(--tv-ink,#281C60)";
    container.appendChild(banner);
  }
  const table = document.createElement("table");
  table.style.cssText = "border-collapse:collapse;width:100%";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.appendChild(document.createElement("th"));
  let dragging = null;
  for (const col of p.columns) {
    const th = document.createElement("th");
    th.setAttribute("data-tv-header", col);
    th.textContent = col;
    th.style.cssText = "border:1px solid var(--tv-line,#DCDCDC);padding:4px 8px;cursor:grab;text-align:left";
    th.addEventListener("mousedown", () => {
      dragging = col;
    });
    th.addEventListener("mouseup", () => {
      if (dragging && dragging !== col) {
        const order = p.columns.filter((c) => c !== dragging);
        order.splice(order.indexOf(col), 0, dragging);
        p.onReorderColumns(order);
      }
      dragging = null;
    });
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  if (p.rows.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = p.columns.length + 1;
    td.textContent = "This table has 0 rows.";
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
  p.rows.forEach((row, i) => {
    const abs = p.pageStart + i;
    const tr = document.createElement("tr");
    const num = document.createElement("td");
    num.textContent = String(abs + 1);
    num.style.cssText = "color:var(--tv-ink-3,#888);padding:4px 8px";
    tr.appendChild(num);
    for (const col of p.columns) {
      const td = document.createElement("td");
      td.setAttribute("data-tv-cell", `${abs}:${col}`);
      td.textContent = String(row[col] ?? "");
      td.style.cssText = "border:1px solid var(--tv-line,#DCDCDC);padding:4px 8px";
      if (p.selection && p.selection.row === abs && p.selection.col === col) {
        td.style.background = "var(--tv-accent,#96BED7)";
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  container.appendChild(table);
  const pager = document.createElement("div");
  pager.style.cssText = "display:flex;gap:4px;padding:6px 0";
  const prev = document.createElement("button");
  prev.setAttribute("data-tv-prev", "");
  prev.textContent = "‹";
  prev.disabled = p.page <= 1;
  prev.addEventListener("click", () => p.onPageChange(p.page - 1));
  pager.appendChild(prev);
  for (const item of pageList(p.page, p.pageCount)) {
    if (item === "…") {
      const gap = document.createElement("span");
      gap.textContent = "…";
      pager.appendChild(gap);
    } else {
      const btn = document.createElement("button");
      btn.setAttribute("data-tv-page", String(item));
      btn.textContent = String(item);
      if (item === p.page)
        btn.setAttribute("aria-current", "page");
      btn.addEventListener("click", () => p.onPageChange(item));
      pager.appendChild(btn);
    }
  }
  const next = document.createElement("button");
  next.setAttribute("data-tv-next", "");
  next.textContent = "›";
  next.disabled = p.page >= p.pageCount;
  next.addEventListener("click", () => p.onPageChange(p.page + 1));
  pager.appendChild(next);
  container.appendChild(pager);
  const footer = document.createElement("div");
  footer.style.cssText = "display:flex;gap:16px;padding:4px 0;color:var(--tv-ink,#281C60)";
  const range = document.createElement("span");
  range.setAttribute("data-tv-range", "");
  const first = p.totalRows === 0 ? 0 : p.pageStart + 1;
  const last = p.pageStart + p.rows.length;
  range.textContent = `${first}–${last} of ${p.totalRows} rows`;
  footer.appendChild(range);
  const sel = document.createElement("span");
  sel.setAttribute("data-tv-selection", "");
  sel.textContent = p.selection ? `R${p.selection.row + 1} · ${p.selection.col}` : "";
  footer.appendChild(sel);
  const status = document.createElement("span");
  status.setAttribute("data-tv-status", p.status);
  status.textContent = p.status;
  footer.appendChild(status);
  container.appendChild(footer);
}

// packages/table-view/demo.ts
var PAGE_SIZE = 10;
var rows = Array.from({ length: 95 }, (_v, i) => ({
  ID: i + 1,
  name: `Person ${i + 1}`,
  age: 20 + i % 50
}));
var columns = ["ID", "name", "age"];
var page = 1;
var selection = null;
var streaming = false;
var status = "idle";
var out = document.getElementById("out");
var log = (msg) => {
  out.textContent += `${msg}
`;
};
function render() {
  mountTableView(document.getElementById("table"), {
    columns,
    rows: pageSlice(rows, PAGE_SIZE, page),
    pageStart: (page - 1) * PAGE_SIZE,
    totalRows: rows.length,
    page,
    pageCount: pageCountFor(rows.length, PAGE_SIZE),
    onPageChange: (p) => {
      page = p;
      log(`page ${p}`);
      render();
    },
    selection,
    onSelectCell: (row, col) => {
      selection = { row, col };
      log(`select ${row}:${col}`);
      updateSelection(document.getElementById("table"), selection);
    },
    onEditCell: (row, col, value) => {
      rows[row][col] = value;
      log(`edit ${row}:${col}=${value}`);
      render();
    },
    onReorderColumns: (order) => {
      columns = order;
      log(`reorder ${order.join(",")}`);
      render();
    },
    streaming,
    status
  });
}
document.getElementById("toggle-streaming").addEventListener("click", () => {
  streaming = !streaming;
  status = streaming ? "running" : "idle";
  log(`streaming ${streaming}`);
  render();
});
log("ready");
render();
