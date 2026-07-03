// packages/gherkin-tour/index.ts
var KEYWORDS = ["Given", "When", "Then", "And", "But", "*"];
function classify(text) {
  let m = text.match(/^load the lookup table "([^"]+)"/);
  if (m)
    return { kind: "load-lookup", filename: m[1] };
  m = text.match(/^load "([^"]+)"/);
  if (m)
    return { kind: "load-file", filename: m[1] };
  m = text.match(/^query "(.+)"(?:\s|$)/);
  if (m)
    return { kind: "prefill-chat", text: m[1] };
  m = text.match(/^speak "([^"]+)"/);
  if (m)
    return { kind: "play-audio", filename: m[1] };
  m = text.match(/^the expected output is "([^"]+)"/);
  if (m)
    return { kind: "golden-source", filename: m[1] };
  if (/^compare with the expected output/.test(text))
    return { kind: "show-golden" };
  return { kind: "display" };
}
function parseTours(source) {
  const scenarios = [];
  let featureBackground = [];
  let ruleBackground = [];
  let inRule = false;
  let pendingTags = [];
  let current = null;
  let collecting = null;
  let inDocString = false;
  let skipScenario = false;
  const finish = () => {
    current = null;
    collecting = null;
  };
  for (const raw of source.split(`
`)) {
    const line = raw.trim();
    if (line.startsWith('"""')) {
      inDocString = !inDocString;
      continue;
    }
    if (inDocString || line === "" || line.startsWith("#") || line.startsWith("|"))
      continue;
    if (line.startsWith("@")) {
      pendingTags = line.split(/\s+/).filter((t) => t.startsWith("@"));
      continue;
    }
    if (line.startsWith("Feature:"))
      continue;
    if (line.startsWith("Rule:")) {
      inRule = true;
      ruleBackground = [];
      finish();
      continue;
    }
    if (line.startsWith("Background:")) {
      collecting = inRule ? ruleBackground : featureBackground;
      current = null;
      skipScenario = false;
      continue;
    }
    if (line.startsWith("Scenario Outline:") || line.startsWith("Examples:")) {
      skipScenario = true;
      finish();
      pendingTags = [];
      continue;
    }
    if (line.startsWith("Scenario:")) {
      skipScenario = false;
      current = {
        name: line.slice("Scenario:".length).trim(),
        tags: pendingTags,
        steps: [...featureBackground, ...inRule ? ruleBackground : []]
      };
      pendingTags = [];
      const g = current.steps.find((s) => s.action.kind === "golden-source");
      if (g)
        current.golden = g.action.filename;
      current.steps = current.steps.filter((s) => !["display", "golden-source", "show-golden"].includes(s.action.kind));
      scenarios.push(current);
      collecting = null;
      continue;
    }
    const kw = KEYWORDS.find((k) => line.startsWith(k + " "));
    if (!kw || skipScenario)
      continue;
    const text = line.slice(kw.length + 1).trim();
    const action = classify(text);
    const step = { keyword: kw, text, action };
    if (collecting) {
      collecting.push(step);
      continue;
    }
    if (!current)
      continue;
    if (action.kind === "golden-source") {
      current.golden = action.filename;
      continue;
    }
    if (action.kind === "display" || action.kind === "show-golden")
      continue;
    current.steps.push(step);
  }
  return scenarios;
}

class TourDriver {
  steps;
  adapter;
  golden;
  elementIdFor;
  index = -1;
  _done = false;
  constructor(steps, adapter, golden, elementIdFor = (k) => `el-${k}`) {
    this.steps = steps;
    this.adapter = adapter;
    this.golden = golden;
    this.elementIdFor = elementIdFor;
  }
  play() {
    this.index = 0;
    this._done = false;
  }
  get active() {
    return this.index >= 0 && this.index < this.steps.length && !this._done;
  }
  get done() {
    return this._done;
  }
  currentStep() {
    return this.active ? this.steps[this.index] : null;
  }
  currentElementId() {
    return this.active ? this.elementIdFor(this.steps[this.index].kind) : null;
  }
  async next() {
    if (!this.active)
      return;
    const step = this.steps[this.index];
    if (step.kind === "load-file")
      await this.adapter.loadFile(step.arg);
    else if (step.kind === "load-lookup")
      await this.adapter.loadLookup(step.arg);
    else if (step.kind === "prefill-chat")
      await this.adapter.prefillChat(step.arg);
    else if (step.kind === "play-audio")
      await this.adapter.playAudio(step.arg);
    this.index++;
    if (this.index >= this.steps.length) {
      if (this.golden)
        await this.adapter.showGolden(this.golden);
      this._done = true;
    }
  }
  finish() {
    this.adapter.onFinish?.();
    this._done = true;
    this.index = -1;
  }
}

// packages/gherkin-tour/demo.ts
var FEATURE = `Feature: Filter demo
  Background:
    Given load "filter-input.csv"
    And the expected output is "filter-expected.jsonl"

  @web @tour
  Scenario: Filter by Country
    When query "Show only customers in the USA"
    Then column "Country" exists in the spec
    Then compare with the expected output
`;
var out = document.getElementById("out");
var log = (msg) => {
  out.textContent += `${msg}
`;
};
var tour = parseTours(FEATURE)[0];
document.getElementById("gt-name").textContent = tour.name;
document.getElementById("gt-count").textContent = String(tour.steps.length);
var adapter = {
  loadFile: (name) => log(`loadFile(${name})`),
  loadLookup: (name) => log(`loadLookup(${name})`),
  prefillChat: (text) => log(`prefillChat(${text})`),
  playAudio: (name) => log(`playAudio(${name})`),
  showGolden: (name) => log(`showGolden(${name})`),
  onFinish: () => log("onFinish")
};
var driver = new TourDriver(tour.steps.map((s) => ({ kind: s.action.kind, arg: "filename" in s.action ? s.action.filename : ("text" in s.action) ? s.action.text : "" })), adapter, tour.golden);
var stateEl = document.getElementById("gt-state");
var setState = () => {
  stateEl.textContent = driver.done ? "done" : driver.active ? "active" : "inactive";
};
document.getElementById("gt-play").addEventListener("click", () => {
  driver.play();
  log("play");
  setState();
});
document.getElementById("gt-next").addEventListener("click", () => {
  driver.next().then(setState);
});
log("ready");
