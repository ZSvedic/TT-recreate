// #TableView — plain-DOM grid component: paged rows, cell selection, inline
// editing, header drag-reorder, streaming banner, pager, and status footer.
// Props in, callbacks out; the host owns rows and page state and re-renders.
// Styling reads --tv-* custom properties (presentable light defaults).
import { buildPageList } from './index';

export type Row = Record<string, unknown>;

/** Injects the tv-* keyframes/hover rules once per document. */
function ensureStyles(): void {
  if (typeof document === 'undefined' || document.getElementById('tv-kf')) return;
  const s = document.createElement('style');
  s.id = 'tv-kf';
  s.textContent = [
    '@keyframes tv-pulse-kf { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }',
    '.tv-pulse { animation: tv-pulse-kf 1.2s ease-in-out infinite; }',
    '.tv-th .tv-grip { opacity: 0; transition: opacity 0.15s; }',
    '.tv-th:hover .tv-grip { opacity: 1; }',
  ].join('\n');
  document.head.appendChild(s);
}

const SELECT_BG = 'var(--tv-accent-soft,#e3edf5)';

/** Re-tint the selected cell and refresh the footer readout without a full
 *  re-render — a select-click must leave the DOM intact, or the browser never
 *  fires the dblclick that opens the editor. */
export function updateSelection(container: HTMLElement, selection: { row: number; col: string } | null): void {
  for (const cell of container.querySelectorAll<HTMLElement>('[data-tv-cell]')) {
    const on = selection && cell.getAttribute('data-tv-cell') === `${selection.row}:${selection.col}`;
    cell.style.background = on ? SELECT_BG : '';
  }
  const sel = container.querySelector('[data-tv-selection]');
  if (sel) sel.textContent = selection ? `R${selection.row + 1} · ${selection.col}` : '';
}

function splitCellKey(key: string): [number, string] {
  const at = key.indexOf(':');
  return [Number(key.slice(0, at)), key.slice(at + 1)];
}

function openCellEditor(cell: HTMLElement, holder: { __tvProps?: TableViewProps }): void {
  const [row, col] = splitCellKey(cell.getAttribute('data-tv-cell')!);
  const input = document.createElement('input');
  input.setAttribute('data-tv-edit', '');
  input.value = cell.textContent ?? '';
  input.style.cssText = 'width:100%;box-sizing:border-box;font-family:inherit;font-size:inherit;' +
    'background:var(--tv-surface,#fff);color:var(--tv-ink,#281C60);border:none;outline:none;' +
    'padding:0;height:100%';
  cell.textContent = '';
  cell.style.boxShadow = 'inset 0 0 0 2px var(--tv-accent,#96BED7)';
  cell.appendChild(input);
  let done = false;
  const finish = (commit: boolean) => {
    if (done) return;
    done = true;
    cell.style.boxShadow = '';
    if (commit) holder.__tvProps!.onEditCell(row, col, input.value);
    else holder.__tvProps!.onSelectCell(row, col); // re-render restores the cell
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
  input.focus();
}

export interface TableViewProps {
  columns: string[];
  rows: Row[]; // the visible page only
  pageStart: number; // absolute index of the first visible row
  totalRows: number;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  selection: { row: number; col: string } | null;
  onSelectCell: (row: number, col: string) => void;
  onEditCell: (row: number, col: string, value: string) => void;
  onReorderColumns: (order: string[]) => void;
  streaming: boolean;
  status: 'idle' | 'running' | 'saved';
  /** Phone dock layout: the page scrolls the table — no internal scroller,
   *  header sticks `headerTop` px down (below the app bar), the row-index
   *  column sticks left; the pager/status footers are the app bar's job. */
  pageScroll?: { headerTop: number };
}

const GRIP_SVG = '<svg class="tv-grip" viewBox="0 0 16 16" width="12" height="12" fill="none" ' +
  'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" ' +
  'style="flex:0 0 auto;color:var(--tv-ink4,#a9a2c4)"><path d="M6 4v8 M10 4v8"/></svg>';

const STATUS_LABEL: Record<string, string> = { idle: 'Idle', running: 'Running', saved: 'Saved' };

/** Renders the table view into `container`, replacing previous content. */
export function mountTableView(container: HTMLElement, p: TableViewProps): void {
  ensureStyles();
  // Cell gestures are delegated to the container (which survives re-renders),
  // so the select-click re-render cannot swallow the second click of a
  // double-click. The latest props are stashed on the container.
  const holder = container as HTMLElement & { __tvProps?: TableViewProps };
  if (!holder.__tvProps) {
    container.addEventListener('click', (e) => {
      const cell = (e.target as HTMLElement).closest?.('[data-tv-cell]');
      if (!cell || cell.querySelector('[data-tv-edit]')) return;
      const [row, col] = splitCellKey(cell.getAttribute('data-tv-cell')!);
      holder.__tvProps!.onSelectCell(row, col);
    });
    container.addEventListener('dblclick', (e) => {
      const cell = (e.target as HTMLElement).closest?.('[data-tv-cell]') as HTMLElement | null;
      if (!cell || cell.querySelector('[data-tv-edit]')) return;
      openCellEditor(cell, holder);
    });
  }
  holder.__tvProps = p;
  container.innerHTML = '';
  container.style.cssText += ';display:flex;flex-direction:column;min-width:0;min-height:0;' +
    'background:var(--tv-surface,#fff);font-family:var(--tv-font,system-ui,sans-serif)';

  const scroller = document.createElement('div');
  scroller.setAttribute('data-tv-scroller', '');
  scroller.style.cssText = p.pageScroll
    ? 'flex:1;overflow:visible'
    : 'flex:1;overflow:auto;min-height:0';

  if (p.streaming) {
    const banner = document.createElement('div');
    banner.setAttribute('data-tv-streaming', '');
    banner.style.cssText = 'position:sticky;top:0;left:0;z-index:3;display:flex;align-items:center;gap:8px;' +
      'padding:6px 12px;background:var(--tv-accent-soft,#e3edf5);color:var(--tv-ink,#281C60);' +
      'font-size:12.5px;border-bottom:1px solid var(--tv-line,#DCDCDC)';
    const dot = document.createElement('span');
    dot.className = 'tv-pulse';
    dot.style.cssText = 'width:6px;height:6px;border-radius:3px;background:var(--tv-accent,#96BED7)';
    banner.appendChild(dot);
    banner.appendChild(document.createTextNode('Streaming results…'));
    scroller.appendChild(banner);
  }

  const table = document.createElement('table');
  table.style.cssText = 'border-collapse:collapse;font-family:var(--tv-font-mono,monospace);' +
    'font-size:12.5px;font-variant-numeric:tabular-nums';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  const headerTop = p.pageScroll ? p.pageScroll.headerTop : (p.streaming ? 29 : 0);
  const HEADER_CSS = 'position:sticky;top:' + headerTop + 'px;z-index:1;' +
    'background:var(--tv-surface2,#f7f6fb);color:var(--tv-ink2,#42356e);text-align:left;' +
    'padding:0 10px;height:32px;border-bottom:1px solid var(--tv-line2,#c9c9c9);' +
    'border-right:1px solid var(--tv-line,#DCDCDC);user-select:none;' +
    'font-family:var(--tv-font,system-ui,sans-serif);font-size:12.5px;font-weight:600;white-space:nowrap';
  const corner = document.createElement('th'); // row-number column
  corner.textContent = '#';
  corner.style.cssText = HEADER_CSS + ';text-align:right;color:var(--tv-ink4,#a9a2c4);' +
    'font-family:var(--tv-font-mono,monospace);font-weight:400' +
    (p.pageScroll ? ';left:0;z-index:2' : '');
  headRow.appendChild(corner);
  let dragging: string | null = null;
  for (const col of p.columns) {
    const th = document.createElement('th');
    th.setAttribute('data-tv-header', col);
    th.className = 'tv-th';
    th.title = 'Drag to reorder';
    th.style.cssText = HEADER_CSS + ';cursor:grab';
    const label = document.createElement('span');
    label.style.cssText = 'display:inline-flex;align-items:center;gap:6px';
    label.innerHTML = GRIP_SVG;
    label.appendChild(document.createTextNode(col));
    th.appendChild(label);
    th.addEventListener('mousedown', () => { dragging = col; });
    th.addEventListener('mouseup', () => {
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

  const CELL_CSS = 'padding:0 10px;height:28px;box-sizing:border-box;' +
    'border-bottom:1px solid var(--tv-line,#DCDCDC);border-right:1px solid var(--tv-line,#DCDCDC);' +
    'color:var(--tv-ink,#281C60);max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
  const tbody = document.createElement('tbody');
  if (p.rows.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = p.columns.length + 1;
    td.textContent = 'This table has 0 rows.';
    td.style.cssText = 'padding:16px;color:var(--tv-ink3,#6d6491);' +
      'font-family:var(--tv-font,system-ui,sans-serif);font-size:12.5px';
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
  p.rows.forEach((row, i) => {
    const abs = p.pageStart + i;
    const tr = document.createElement('tr');
    const num = document.createElement('td');
    num.setAttribute('data-tv-index', '');
    num.textContent = String(abs + 1);
    num.style.cssText = CELL_CSS + ';color:var(--tv-ink4,#a9a2c4);text-align:right;' +
      'background:var(--tv-surface2,#f7f6fb)' +
      (p.pageScroll ? ';position:sticky;left:0;z-index:1' : '');
    tr.appendChild(num);
    for (const col of p.columns) {
      const td = document.createElement('td');
      td.setAttribute('data-tv-cell', `${abs}:${col}`);
      td.title = 'Click to select · double-click to edit';
      td.textContent = String(row[col] ?? '');
      td.style.cssText = CELL_CSS;
      if (row[col] == null || row[col] === '') td.style.color = 'var(--tv-ink4,#a9a2c4)';
      if (p.selection && p.selection.row === abs && p.selection.col === col) {
        td.style.background = SELECT_BG;
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  scroller.appendChild(table);
  container.appendChild(scroller);

  // Page-as-scroller mode: paging and status live in the host's app bar.
  if (p.pageScroll) return;

  // Pagination bar: range readout left, prev/next chevrons around the windowed list.
  const pager = document.createElement('div');
  pager.style.cssText = 'flex:0 0 auto;height:40px;display:flex;align-items:center;gap:12px;' +
    'padding:0 10px 0 14px;border-top:1px solid var(--tv-line,#DCDCDC);background:var(--tv-surface2,#f7f6fb)';
  const range = document.createElement('span');
  range.setAttribute('data-tv-range', '');
  const first = p.totalRows === 0 ? 0 : p.pageStart + 1;
  const last = p.pageStart + p.rows.length;
  range.textContent = `${first}–${last} of ${p.totalRows} rows`;
  range.style.cssText = 'font-family:var(--tv-font-mono,monospace);font-size:11.5px;' +
    'color:var(--tv-ink3,#6d6491);white-space:nowrap';
  pager.appendChild(range);
  const gap = document.createElement('span');
  gap.style.flex = '1';
  pager.appendChild(gap);
  const PAGE_BTN = 'height:24px;min-width:24px;padding:0 6px;display:inline-flex;align-items:center;' +
    'justify-content:center;border-radius:4px;border:1px solid transparent;background:transparent;' +
    'font-family:var(--tv-font,system-ui,sans-serif);font-size:12.5px;font-variant-numeric:tabular-nums;' +
    'cursor:pointer;color:var(--tv-ink2,#42356e)';
  const prev = document.createElement('button');
  prev.setAttribute('data-tv-prev', '');
  prev.title = 'Previous page';
  prev.textContent = '‹';
  prev.disabled = p.page <= 1;
  prev.style.cssText = PAGE_BTN + (prev.disabled ? ';color:var(--tv-ink4,#a9a2c4);cursor:default' : '');
  prev.addEventListener('click', () => p.onPageChange(p.page - 1));
  pager.appendChild(prev);
  for (const item of buildPageList(p.page, p.pageCount)) {
    if (item === '…') {
      const dots = document.createElement('span');
      dots.textContent = '…';
      dots.style.cssText = PAGE_BTN + ';color:var(--tv-ink3,#6d6491);cursor:default';
      pager.appendChild(dots);
    } else {
      const btn = document.createElement('button');
      btn.setAttribute('data-tv-page', String(item));
      btn.textContent = String(item);
      const current = item === p.page;
      if (current) btn.setAttribute('aria-current', 'page');
      btn.style.cssText = PAGE_BTN + (current
        ? ';color:var(--tv-ink,#281C60);font-weight:600;border-color:var(--tv-line2,#c9c9c9);background:var(--tv-surface,#fff)'
        : '');
      btn.addEventListener('click', () => p.onPageChange(item));
      pager.appendChild(btn);
    }
  }
  const next = document.createElement('button');
  next.setAttribute('data-tv-next', '');
  next.title = 'Next page';
  next.textContent = '›';
  next.disabled = p.page >= p.pageCount;
  next.style.cssText = PAGE_BTN + (next.disabled ? ';color:var(--tv-ink4,#a9a2c4);cursor:default' : '');
  next.addEventListener('click', () => p.onPageChange(p.page + 1));
  pager.appendChild(next);
  container.appendChild(pager);

  // Status footer: selection readout, encoding, status dot (pulses while running).
  const footer = document.createElement('div');
  footer.style.cssText = 'flex:0 0 auto;height:24px;display:flex;align-items:center;gap:10px;' +
    'padding:0 12px;border-top:1px solid var(--tv-line,#DCDCDC);background:var(--tv-surface2,#f7f6fb);' +
    'font-family:var(--tv-font-mono,monospace);font-size:11.5px;color:var(--tv-ink3,#6d6491);white-space:nowrap';
  const sel = document.createElement('span');
  sel.setAttribute('data-tv-selection', '');
  sel.textContent = p.selection ? `R${p.selection.row + 1} · ${p.selection.col}` : '';
  footer.appendChild(sel);
  const mid = document.createElement('span');
  mid.textContent = '· UTF-8';
  mid.style.color = 'var(--tv-ink4,#a9a2c4)';
  footer.appendChild(mid);
  const fgap = document.createElement('span');
  fgap.style.flex = '1';
  footer.appendChild(fgap);
  const statusWrap = document.createElement('span');
  statusWrap.style.cssText = 'display:inline-flex;align-items:center;gap:6px';
  const dot = document.createElement('span');
  if (p.status === 'running') dot.className = 'tv-pulse';
  dot.style.cssText = 'width:6px;height:6px;border-radius:3px;background:' +
    (p.status === 'running' ? 'var(--tv-accent,#96BED7)'
      : p.status === 'saved' ? 'var(--tv-ok,#2E7D32)' : 'var(--tv-ink4,#a9a2c4)');
  statusWrap.appendChild(dot);
  const statusText = document.createElement('span');
  statusText.setAttribute('data-tv-status', p.status);
  statusText.textContent = STATUS_LABEL[p.status] ?? p.status;
  statusWrap.appendChild(statusText);
  footer.appendChild(statusWrap);
  container.appendChild(footer);
}
