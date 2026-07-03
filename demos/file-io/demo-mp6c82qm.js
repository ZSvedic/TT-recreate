// packages/file-io/browser-core.ts
var DESCRIPTORS = [
  { id: "csv", extensions: [".csv"], contentTypes: ["csv"] },
  { id: "jsonl", extensions: [".jsonl", ".ndjson"], contentTypes: ["jsonl", "ndjson", "x-ndjson", "jsonlines"] },
  { id: "parquet", extensions: [".parquet"], contentTypes: ["parquet"] },
  { id: "arrow", extensions: [".arrow", ".feather"], contentTypes: ["arrow", "feather"] }
];
function formatForExtension(pathname) {
  const lower = pathname.toLowerCase();
  for (const d of DESCRIPTORS)
    if (d.extensions.some((e) => lower.endsWith(e)))
      return d.id;
  return null;
}
function detectFormat(pathname, contentType) {
  const byExt = formatForExtension(pathname);
  if (byExt)
    return byExt;
  if (contentType) {
    const ct = contentType.toLowerCase();
    for (const d of DESCRIPTORS)
      if (d.contentTypes.some((t) => ct.includes(t)))
        return d.id;
  }
  return null;
}
function sampleNameFromUrl(url, format) {
  try {
    const u = new URL(url);
    const seg = u.pathname.split("/").filter(Boolean).pop();
    return seg || `download.${format}`;
  } catch {
    return `download.${format}`;
  }
}
async function fetchTable(input, fetchImpl = (u) => fetch(u)) {
  const trimmed = (input ?? "").trim();
  if (!trimmed)
    throw new Error("Enter a URL.");
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("That doesn’t look like a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("Only http:// and https:// URLs are supported.");
  let res;
  try {
    res = await fetchImpl(trimmed);
  } catch (e) {
    throw new Error(`Couldn’t fetch that URL (network error or CORS blocked): ${e.message}`);
  }
  if (!res.ok)
    throw new Error(`Fetch failed: HTTP ${res.status} ${res.statusText}`.trimEnd());
  const format = detectFormat(url.pathname, res.headers.get("content-type"));
  if (!format)
    throw new Error("Could not detect format. URL must end in .csv, .jsonl, .parquet, or .arrow.");
  const bytes = new Uint8Array(await res.arrayBuffer());
  const text = format === "csv" || format === "jsonl" ? new TextDecoder().decode(bytes) : undefined;
  return { name: sampleNameFromUrl(trimmed, format), text, bytes, format };
}
function serializeFlow(spec) {
  const table = spec.table ?? "input.csv";
  const source = table.split("/").filter(Boolean).pop() || "input.csv";
  return JSON.stringify({ version: 2, source, spec }, null, 2) + `
`;
}

// packages/file-io/demo.ts
var out = document.getElementById("out");
var log = (msg) => {
  out.textContent += `${msg}
`;
};
var el = (id) => document.getElementById(id);
var loaded = null;
function show(file, error = "") {
  loaded = file;
  el("fio-name").textContent = file?.name ?? "";
  el("fio-format").textContent = file?.format ?? "";
  el("fio-error").textContent = error;
  const text = file ? file.text ?? `<${file.bytes.length} binary bytes>` : "";
  el("fio-preview").textContent = text.split(`
`).slice(0, 20).join(`
`);
}
el("fio-fsa").textContent = `File System Access API: ${"showOpenFilePicker" in window ? "yes" : "no"}`;
el("fio-fetch").addEventListener("click", () => {
  const url = el("fio-url").value;
  fetchTable(url).then((file) => {
    show(file);
    log(`fetched ${file.name} (${file.format})`);
  }, (e) => {
    show(null, e.message);
    log(`error ${e.message}`);
  });
});
var picker = document.createElement("input");
picker.type = "file";
picker.addEventListener("change", () => {
  const f = picker.files?.[0];
  if (!f)
    return;
  f.arrayBuffer().then((buf) => {
    const bytes = new Uint8Array(buf);
    const format = formatForExtension(f.name) ?? "csv";
    show({ name: f.name, bytes, text: new TextDecoder().decode(bytes), format });
    log(`opened ${f.name}`);
  });
});
el("fio-open").addEventListener("click", () => picker.click());
el("fio-save").addEventListener("click", () => {
  if (!loaded) {
    el("fio-outcome").textContent = "nothing loaded";
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([loaded.bytes]));
  a.download = loaded.name;
  a.click();
  URL.revokeObjectURL(a.href);
  el("fio-outcome").textContent = `downloaded ${loaded.name}`;
  log(`saved ${loaded.name}`);
});
log("ready");
log(serializeFlow({ table: "data/people.csv", columns: [{ id: "name" }, { id: "age" }], transformations: [] }));
