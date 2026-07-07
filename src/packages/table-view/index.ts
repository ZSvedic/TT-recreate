// #TableView — the pure pagination math behind the paged grid.

export function pageCountFor(totalRows: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalRows / pageSize));
}

export function clampPage(page: number, pageCount: number): number {
  return Math.min(Math.max(1, page), pageCount);
}

export function pageSlice<T>(rows: T[], page: number, pageSize: number): T[] {
  const p = clampPage(page, pageCountFor(rows.length, pageSize));
  return rows.slice((p - 1) * pageSize, p * pageSize);
}

/** Page numbers to render, '…' marking a gap. Windows around the current page;
 *  near an edge the window widens so single steps stay reachable. */
export function buildPageList(current: number, total: number): Array<number | '…'> {
  if (total <= 7) return Array.from({ length: total }, (_v, i) => i + 1);
  if (current <= 3) return [1, 2, 3, 4, 5, '…', total];
  if (current >= total - 2) return [1, '…', total - 4, total - 3, total - 2, total - 1, total];
  return [1, '…', current - 1, current, current + 1, '…', total];
}
