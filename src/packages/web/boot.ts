// #WebUI — first import of the browser bundle: minimal process shim so the
// engine's process.env / process.cwd reads work before anything else loads.
const g = globalThis as any;
g.process ??= {};
g.process.env ??= {};
g.process.cwd ??= () => '/';
export {};
