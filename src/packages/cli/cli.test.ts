import { describe, expect, test } from 'bun:test';
import { renderModelId } from './session.ts';
import { renderTable } from './render.ts';

describe('renderModelId', () => {
  test('claude-<family>-<major>-<minor> renders as Family M.m', () => {
    expect(renderModelId('claude-sonnet-4-6')).toBe('Sonnet 4.6');
    expect(renderModelId('gemini-3.5-flash')).toBe('gemini-3.5-flash');
  });
});

describe('renderTable', () => {
  const rows = Array.from({ length: 20 }, (_v, i) => ({ ID: String(i + 1), Name: `n${i + 1}` }));
  test('truncated edges render marker rows', () => {
    const top = renderTable(rows, ['ID', 'Name'], { rowOffset: 0, colOffset: 0, pageRows: 10, pageCols: 5 });
    expect(top).toContain('...10 more rows.');
    expect(top).not.toContain('n11');
    const next = renderTable(rows, ['ID', 'Name'], { rowOffset: 10, colOffset: 0, pageRows: 10, pageCols: 5 });
    expect(next).toContain('n11');
    expect(next).toContain('...10 more rows.');
  });
  test('hidden columns render a marker column', () => {
    const view = renderTable(rows, ['ID', 'Name'], { rowOffset: 0, colOffset: 1, pageRows: 10, pageCols: 1 });
    expect(view).toContain('...1 more cols.');
    expect(view).not.toContain('ID |');
  });
});
