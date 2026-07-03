// #TableView — plain-DOM grid component: paged rows, cell selection, inline
// editing, header drag-reorder, streaming banner, pager, and status footer.
// Props in, callbacks out; the host owns rows and page state and re-renders.
import { pageList } from './index';

export type Row = Record<string, unknown>;

/** Re-tint the selected cell and refresh the footer readout without a full
 *  re-render — a select-click must leave the DOM intact, or the browser never
 *  fires the dblclick that opens the editor. */
export function updateSelection(container: HTMLElement, selection: { row: number; col: string } | null): void {
  for (const cell of container.querySelectorAll<HTMLElement>('[data-tv-cell]')) {
    const on = selection && cell.getAttribute('data-tv-cell') === `${selection.row}:${selection.col}`;
    cell.style.background = on ? 'var(--tv-accent,#96BED7)' : '';
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
  cell.textContent = '';
  cell.appendChild(input);
  let done = false;
  const finish = (commit: boolean) => {
    if (done) return;
    done = true;
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
}

/** Renders the table view into `container`, replacing previous content. */
export function mountTableView(container: HTMLElement, p: TableViewProps): void {
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
  container.style.fontFamily = 'var(--tv-font, system-ui, sans-serif)';

  if (p.streaming) {
    const banner = document.createElement('div');
    banner.setAttribute('data-tv-streaming', '');
    banner.textContent = 'Streaming results…';
    banner.style.cssText = 'padding:4px 8px;background:var(--tv-accent,#96BED7);color:var(--tv-ink,#281C60)';
    container.appendChild(banner);
  }

  const table = document.createElement('table');
  table.style.cssText = 'border-collapse:collapse;width:100%';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  headRow.appendChild(document.createElement('th')); // row-number column
  let dragging: string | null = null;
  for (const col of p.columns) {
    const th = document.createElement('th');
    th.setAttribute('data-tv-header', col);
    th.textContent = col;
    th.style.cssText = 'border:1px solid var(--tv-line,#DCDCDC);padding:4px 8px;cursor:grab;text-align:left';
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

  const tbody = document.createElement('tbody');
  if (p.rows.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = p.columns.length + 1;
    td.textContent = 'This table has 0 rows.';
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
  p.rows.forEach((row, i) => {
    const abs = p.pageStart + i;
    const tr = document.createElement('tr');
    const num = document.createElement('td');
    num.textContent = String(abs + 1);
    num.style.cssText = 'color:var(--tv-ink-3,#888);padding:4px 8px';
    tr.appendChild(num);
    for (const col of p.columns) {
      const td = document.createElement('td');
      td.setAttribute('data-tv-cell', `${abs}:${col}`);
      td.textContent = String(row[col] ?? '');
      td.style.cssText = 'border:1px solid var(--tv-line,#DCDCDC);padding:4px 8px';
      if (p.selection && p.selection.row === abs && p.selection.col === col) {
        td.style.background = 'var(--tv-accent,#96BED7)';
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  container.appendChild(table);

  // Pager: prev/next chevrons around the windowed page list.
  const pager = document.createElement('div');
  pager.style.cssText = 'display:flex;gap:4px;padding:6px 0';
  const prev = document.createElement('button');
  prev.setAttribute('data-tv-prev', '');
  prev.textContent = '‹';
  prev.disabled = p.page <= 1;
  prev.addEventListener('click', () => p.onPageChange(p.page - 1));
  pager.appendChild(prev);
  for (const item of pageList(p.page, p.pageCount)) {
    if (item === '…') {
      const gap = document.createElement('span');
      gap.textContent = '…';
      pager.appendChild(gap);
    } else {
      const btn = document.createElement('button');
      btn.setAttribute('data-tv-page', String(item));
      btn.textContent = String(item);
      if (item === p.page) btn.setAttribute('aria-current', 'page');
      btn.addEventListener('click', () => p.onPageChange(item));
      pager.appendChild(btn);
    }
  }
  const next = document.createElement('button');
  next.setAttribute('data-tv-next', '');
  next.textContent = '›';
  next.disabled = p.page >= p.pageCount;
  next.addEventListener('click', () => p.onPageChange(p.page + 1));
  pager.appendChild(next);
  container.appendChild(pager);

  // Footer: range readout, selection, status dot.
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:16px;padding:4px 0;color:var(--tv-ink,#281C60)';
  const range = document.createElement('span');
  range.setAttribute('data-tv-range', '');
  const first = p.totalRows === 0 ? 0 : p.pageStart + 1;
  const last = p.pageStart + p.rows.length;
  range.textContent = `${first}–${last} of ${p.totalRows} rows`;
  footer.appendChild(range);
  const sel = document.createElement('span');
  sel.setAttribute('data-tv-selection', '');
  sel.textContent = p.selection ? `R${p.selection.row + 1} · ${p.selection.col}` : '';
  footer.appendChild(sel);
  const status = document.createElement('span');
  status.setAttribute('data-tv-status', p.status);
  status.textContent = p.status;
  footer.appendChild(status);
  container.appendChild(footer);
}
