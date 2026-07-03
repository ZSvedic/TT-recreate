// #TableView demo — mounts the grid over 95 generated rows at page size 10;
// plain state plays the host, every callback appends to the #out event log.
import { pageCountFor, pageSlice } from './index';
import { mountTableView, updateSelection, type Row } from './dom';

const PAGE_SIZE = 10;
const rows: Row[] = Array.from({ length: 95 }, (_v, i) => ({
  ID: i + 1,
  name: `Person ${i + 1}`,
  age: 20 + (i % 50),
}));

let columns = ['ID', 'name', 'age'];
let page = 1;
let selection: { row: number; col: string } | null = null;
let streaming = false;
let status: 'idle' | 'running' | 'saved' = 'idle';

const out = document.getElementById('out')!;
const log = (msg: string) => { out.textContent += `${msg}\n`; };

function render() {
  mountTableView(document.getElementById('table')!, {
    columns,
    rows: pageSlice(rows, PAGE_SIZE, page),
    pageStart: (page - 1) * PAGE_SIZE,
    totalRows: rows.length,
    page,
    pageCount: pageCountFor(rows.length, PAGE_SIZE),
    onPageChange: (p) => { page = p; log(`page ${p}`); render(); },
    selection,
    onSelectCell: (row, col) => {
      selection = { row, col };
      log(`select ${row}:${col}`);
      updateSelection(document.getElementById('table')!, selection); // in place: keeps dblclick alive
    },
    onEditCell: (row, col, value) => {
      rows[row][col] = value;
      log(`edit ${row}:${col}=${value}`);
      render();
    },
    onReorderColumns: (order) => { columns = order; log(`reorder ${order.join(',')}`); render(); },
    streaming,
    status,
  });
}

document.getElementById('toggle-streaming')!.addEventListener('click', () => {
  streaming = !streaming;
  status = streaming ? 'running' : 'idle';
  log(`streaming ${streaming}`);
  render();
});

log('ready');
render();
