// #SqlExpr — in-process DuckDB engine; the current rows materialize as table `t`.
import type { Row } from '@tamedtable/table-plan';

export class SqlEngine {
  private instance: any = null;
  private conn: any = null;
  private columns: string[] = [];

  private async connect() {
    if (this.conn) return this.conn;
    const { DuckDBInstance } = await import('@duckdb/node-api');
    this.instance = await DuckDBInstance.create(process.env.TAMEDTABLE_DUCKDB_PATH ?? ':memory:');
    this.conn = await this.instance.connect();
    await this.conn.run(`SET threads = ${Number(process.env.TAMEDTABLE_DUCKDB_THREADS ?? 4) || 4}`);
    return this.conn;
  }

  private static lit(v: unknown): string {
    if (v === null || v === undefined) return 'NULL';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return `'${s.replace(/'/g, "''")}'`;
  }

  private static q(name: string): string { return `"${name.replace(/"/g, '""')}"`; }

  async materialize(rows: Row[], columns: string[], table = 't'): Promise<void> {
    const conn = await this.connect();
    if (table === 't') this.columns = columns;
    await conn.run(`DROP TABLE IF EXISTS ${table}`);
    await conn.run(`CREATE TABLE ${table} (${columns.map((c) => `${SqlEngine.q(c)} VARCHAR`).join(', ')})`);
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      if (!chunk.length) continue;
      const values = chunk.map((r) => `(${columns.map((c) => SqlEngine.lit(r[c])).join(', ')})`).join(', ');
      await conn.run(`INSERT INTO ${table} VALUES ${values}`);
    }
  }

  /** One scalar per row of `t`, input order preserved. */
  async scalarPerRow(fragment: string, signal?: AbortSignal): Promise<unknown[]> {
    return this.query(`SELECT (${fragment}) AS r FROM t`, signal);
  }

  /** One aggregate scalar over a group slice, reachable as `g` and `t`. */
  async groupScalar(fragment: string, groupRows: Row[], columns: string[], signal?: AbortSignal): Promise<unknown> {
    await this.materialize(groupRows, columns, 'g');
    const conn = await this.connect();
    await conn.run('DROP VIEW IF EXISTS t_backup_view');
    const vals = await this.query(`WITH t AS (SELECT * FROM g) SELECT (${fragment}) AS r FROM g`, signal);
    return vals[0] ?? null;
  }

  private async query(sql: string, signal?: AbortSignal): Promise<unknown[]> {
    const conn = await this.connect();
    if (signal?.aborted) throw new Error('cancelled');
    const onAbort = () => { try { conn.interrupt(); } catch { /* draining */ } };
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const res = await conn.runAndReadAll(sql);
      if (signal?.aborted) throw new Error('cancelled');
      return res.getRowObjects().map((r: Row) => {
        const v = r.r;
        return typeof v === 'bigint' ? Number(v) : v;
      });
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      if (signal?.aborted || /INTERRUPT/i.test(msg)) throw new Error('cancelled');
      throw new Error(msg);
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  }

  reset(): void {
    if (this.conn) { try { this.conn.closeSync(); } catch { /* already closed */ } }
    this.conn = null;
    this.instance = null;
  }
}
