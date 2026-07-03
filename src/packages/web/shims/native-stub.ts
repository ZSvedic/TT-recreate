// #WebUI — browser stub for @duckdb/node-api and apache-arrow: SQL, parquet,
// and arrow paths are unavailable in the browser demo and fail loudly on use.
const unavailable = (what: string) => () => { throw new Error(`${what} is not available in the browser demo`); };
export const DuckDBInstance = { create: unavailable('SQL (DuckDB)') };
export const tableFromIPC = unavailable('Arrow I/O');
export const tableFromArrays = unavailable('Arrow I/O');
export const tableToIPC = unavailable('Arrow I/O');
