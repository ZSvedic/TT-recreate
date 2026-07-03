import { describe, expect, test } from 'bun:test';
import { compareValues, renderCellPrompt, runTransformations } from './engine.ts';
import { SqlEngine } from './sql.ts';

const ctx = { readTable: async () => [], cell: async () => [], sql: new SqlEngine() } as never;

describe('compareValues', () => {
  test('numeric strings compare as numbers', () => {
    expect(compareValues('2', '10')).toBe(-1);
    expect(compareValues('b', 'a')).toBe(1);
  });
});

describe('renderCellPrompt', () => {
  test('{Column} substitutes verbatim; {*} excludes the target', () => {
    expect(renderCellPrompt('Greet {A}', { A: 'hello', B: 'x' })).toBe('Greet hello');
    expect(renderCellPrompt('Row: {*}', { A: 'a', B: 'b' }, 'A')).toBe('Row: {"B":"b"}');
    expect(() => renderCellPrompt('{Nope}', { A: 1 })).toThrow('Nope');
  });
});

describe('split', () => {
  test('pads short rows and folds overflow onto the last column', async () => {
    const rows = [{ FullName: 'Cher' }, { FullName: 'Mary Jane Watson' }, { FullName: '' }];
    const out = await runTransformations(
      { columns: [{ id: 'FullName' }], transformations: [{ kind: 'split', from: 'FullName', into: ['First', 'Last'], on: ' ' }] },
      rows, ctx,
    );
    expect(out[0]).toEqual({ FullName: 'Cher', First: 'Cher', Last: null });
    expect(out[1]!.Last).toBe('Jane Watson');
    expect(out[2]).toEqual({ FullName: '', First: null, Last: null });
  });
});

describe('validate threshold', () => {
  test('aborts when the failure rate exceeds the threshold', async () => {
    const rows = [{ A: '' }, { A: '' }, { A: 'x' }];
    await expect(runTransformations(
      { columns: [{ id: 'A' }], transformations: [{ kind: 'validate', pred: { js: 'row.A !== ""' }, threshold: 0.2 }] },
      rows, ctx,
    )).rejects.toThrow('validation failed: 67% > 20%');
  });
});
