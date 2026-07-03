// #FileIO demo — drives the real browser-safe API: a capability line for the
// File System Access API, Open via a hidden <input type=file>, Fetch URL via
// fetchTable, Save via a download anchor, and a serializeFlow sample in #out
// (the ready signal). Only browser-core is imported — the codecs (DuckDB,
// apache-arrow) stay out of the bundle.
import { fetchTable, serializeFlow, formatForExtension, type PickedFile } from './browser-core';

const out = document.getElementById('out')!;
const log = (msg: string) => { out.textContent += `${msg}\n`; };
const el = (id: string) => document.getElementById(id)!;

let loaded: PickedFile | null = null;

function show(file: PickedFile | null, error = '') {
  loaded = file;
  el('fio-name').textContent = file?.name ?? '';
  el('fio-format').textContent = file?.format ?? '';
  el('fio-error').textContent = error;
  const text = file ? (file.text ?? `<${file.bytes.length} binary bytes>`) : '';
  el('fio-preview').textContent = text.split('\n').slice(0, 20).join('\n');
}

el('fio-fsa').textContent = `File System Access API: ${'showOpenFilePicker' in window ? 'yes' : 'no'}`;

el('fio-fetch').addEventListener('click', () => {
  const url = (el('fio-url') as HTMLInputElement).value;
  void fetchTable(url).then(
    (file) => { show(file); log(`fetched ${file.name} (${file.format})`); },
    (e: Error) => { show(null, e.message); log(`error ${e.message}`); },
  );
});

// Open: hidden file-input fallback (the dialog seam carries raw bytes).
const picker = document.createElement('input');
picker.type = 'file';
picker.addEventListener('change', () => {
  const f = picker.files?.[0];
  if (!f) return;
  void f.arrayBuffer().then((buf) => {
    const bytes = new Uint8Array(buf);
    const format = formatForExtension(f.name) ?? 'csv';
    show({ name: f.name, bytes, text: new TextDecoder().decode(bytes), format });
    log(`opened ${f.name}`);
  });
});
el('fio-open').addEventListener('click', () => picker.click());

// Save: download-anchor fallback — resolves as "downloaded".
el('fio-save').addEventListener('click', () => {
  if (!loaded) { el('fio-outcome').textContent = 'nothing loaded'; return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([loaded.bytes as BlobPart]));
  a.download = loaded.name;
  a.click();
  URL.revokeObjectURL(a.href);
  el('fio-outcome').textContent = `downloaded ${loaded.name}`;
  log(`saved ${loaded.name}`);
});

log('ready');
log(serializeFlow({ table: 'data/people.csv', columns: [{ id: 'name' }, { id: 'age' }], transformations: [] }));
