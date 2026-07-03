// #ReplView — hand-rolled padEnd ASCII renderer with viewport markers.
import type { Row } from '@tamedtable/core';

export const REPL_FALLBACK_ROWS = 10;
export const REPL_FALLBACK_COLS = 5;
export const REPL_CHROME_LINES = 5;
export const REPL_INDENT = 1;
export const REPL_AVG_COL_WIDTH = 16;
export const REPL_FALLBACK_COLS_MIN = 5;

export interface Viewport {
  rowOffset: number;
  colOffset: number;
  pageRows: number;
  pageCols: number;
}

export function renderTable(
  rows: Row[], columns: string[], vp: Viewport,
  highlight?: { pattern: RegExp },
): string {
  const cell = (v: unknown): string => {
    let s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (highlight) s = s.replace(highlight.pattern, (m) => `*${m}*`);
    return s;
  };
  const visCols = columns.slice(vp.colOffset, vp.colOffset + vp.pageCols);
  const visRows = rows.slice(vp.rowOffset, vp.rowOffset + vp.pageRows);
  const hiddenLeft = vp.colOffset;
  const hiddenRight = Math.max(0, columns.length - vp.colOffset - vp.pageCols);
  const hiddenAbove = vp.rowOffset;
  const hiddenBelow = Math.max(0, rows.length - vp.rowOffset - vp.pageRows);

  const grid = [visCols.map(cell), ...visRows.map((r) => visCols.map((c) => cell(r[c])))];
  const widths = visCols.map((_c, i) => Math.max(...grid.map((g) => g[i]!.length)));
  const lines = grid.map((g, gi) => {
    const cells = g.map((s, i) => s.padEnd(widths[i]!));
    if (hiddenLeft > 0) cells.unshift(gi === 0 ? `...${hiddenLeft} more cols.` : ' '.repeat(`...${hiddenLeft} more cols.`.length));
    if (hiddenRight > 0) cells.push(gi === 0 ? `...${hiddenRight} more cols.` : '');
    return ' ' + cells.join(' | ').trimEnd();
  });
  const out: string[] = [];
  out.push(lines[0]!);
  if (hiddenAbove > 0) out.push(` ...${hiddenAbove} more rows.`);
  out.push(...lines.slice(1));
  if (hiddenBelow > 0) out.push(` ...${hiddenBelow} more rows.`);
  return out.join('\n');
}
