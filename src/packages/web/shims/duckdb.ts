// #WebUI #SqlExpr — browser stand-in for @duckdb/node-api, backed by
// @duckdb/duckdb-wasm. Exposes the same tiny surface the engine and the
// parquet codec use: DuckDBInstance.create → connect → run / runAndReadAll /
// interrupt / closeSync. The wasm module + worker are self-hosted under the
// site's duckdb/ directory (no CDN). Two file bridges keep the parquet codec
// working over the in-memory fs shim: a `read_parquet('<path>')` source is
// registered into duckdb's virtual FS first, and a `COPY … TO '<path>'`
// result is copied back out into the shim after the query.
import * as duckdb from '@duckdb/duckdb-wasm';

type Row = Record<string, unknown>;
import { memRead, writeFileSync as memWrite } from './fs.ts';

let dbPromise: Promise<duckdb.AsyncDuckDB> | null = null;

function loadDb(): Promise<duckdb.AsyncDuckDB> {
  dbPromise ??= (async () => {
    // Assets sit next to the app bundle (dist/duckdb/), wherever it is served.
    const dir = location.pathname.replace(/[^/]*$/, '');
    const base = `${location.origin}${dir}duckdb/`;
    const bundle = await duckdb.selectBundle({
      mvp: { mainModule: `${base}duckdb-mvp.wasm`, mainWorker: `${base}duckdb-browser-mvp.worker.js` },
      eh: { mainModule: `${base}duckdb-eh.wasm`, mainWorker: `${base}duckdb-browser-eh.worker.js` },
    });
    const worker = new Worker(bundle.mainWorker!);
    const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    return db;
  })();
  return dbPromise;
}

const READ_PARQUET = /read_parquet\('([^']+)'\)/i;
const COPY_TO = /^COPY\s+.+\s+TO\s+'([^']+)'/i;

class Connection {
  constructor(private db: duckdb.AsyncDuckDB, private conn: duckdb.AsyncDuckDBConnection) {}

  private async bridgeIn(sql: string): Promise<void> {
    const src = sql.match(READ_PARQUET)?.[1];
    if (!src) return;
    const bytes = memRead(src.replace(/''/g, "'"));
    if (bytes) await this.db.registerFileBuffer(src.replace(/''/g, "'"), new Uint8Array(bytes));
  }

  private async bridgeOut(sql: string): Promise<void> {
    const dest = sql.match(COPY_TO)?.[1];
    if (!dest) return;
    const path = dest.replace(/''/g, "'");
    memWrite(path, await this.db.copyFileToBuffer(path));
  }

  async run(sql: string): Promise<void> {
    // SET threads is Node-only tuning; the wasm build runs one worker.
    if (/^SET threads/i.test(sql)) return;
    await this.bridgeIn(sql);
    if (COPY_TO.test(sql)) await this.db.registerEmptyFileBuffer(sql.match(COPY_TO)![1]!.replace(/''/g, "'"));
    await this.conn.query(sql);
    await this.bridgeOut(sql);
  }

  async runAndReadAll(sql: string): Promise<{ columnNames(): string[]; getRowObjects(): Row[] }> {
    await this.bridgeIn(sql);
    const table = await this.conn.query(sql);
    const columns = table.schema.fields.map((f) => f.name);
    const rows: Row[] = table.toArray().map((rec) => {
      const out: Row = {};
      const json = rec.toJSON() as Record<string, unknown>;
      for (const c of columns) {
        const v = json[c];
        out[c] = typeof v === 'bigint' ? Number(v) : (v as Row[string]);
      }
      return out;
    });
    return { columnNames: () => columns, getRowObjects: () => rows };
  }

  interrupt(): void {
    void this.conn.cancelSent();
  }

  closeSync(): void {
    void this.conn.close();
  }
}

export class DuckDBInstance {
  private constructor(private db: duckdb.AsyncDuckDB) {}

  static async create(_path?: string): Promise<DuckDBInstance> {
    return new DuckDBInstance(await loadDb());
  }

  async connect(): Promise<Connection> {
    const db = this.db;
    return new Connection(db, await db.connect());
  }
}
