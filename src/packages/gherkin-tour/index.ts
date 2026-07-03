// #GherkinTour — zero-dependency .feature parser + tour driver.

export type TourAction =
  | { kind: 'load-file'; filename: string }
  | { kind: 'load-lookup'; filename: string }
  | { kind: 'prefill-chat'; text: string }
  | { kind: 'show-golden' }
  | { kind: 'golden-source'; filename: string }
  | { kind: 'play-audio'; filename: string }
  | { kind: 'display' };

export interface TourStep { keyword: string; text: string; action: TourAction }
export interface TourScenario { name: string; tags: string[]; steps: TourStep[]; golden?: string; feature?: string }

const KEYWORDS = ['Given', 'When', 'Then', 'And', 'But', '*'];

function classify(text: string): TourAction {
  let m = text.match(/^load the lookup table "([^"]+)"/);
  if (m) return { kind: 'load-lookup', filename: m[1]! };
  m = text.match(/^load "([^"]+)"/);
  if (m) return { kind: 'load-file', filename: m[1]! };
  m = text.match(/^query "(.+)"(?:\s|$)/);
  if (m) return { kind: 'prefill-chat', text: m[1]! };
  m = text.match(/^speak "([^"]+)"/);
  if (m) return { kind: 'play-audio', filename: m[1]! };
  m = text.match(/^the expected output is "([^"]+)"/);
  if (m) return { kind: 'golden-source', filename: m[1]! };
  if (/^compare with the expected output/.test(text)) return { kind: 'show-golden' };
  return { kind: 'display' };
}

export function parseTours(source: string): TourScenario[] {
  const scenarios: TourScenario[] = [];
  let featureBackground: TourStep[] = [];
  let ruleBackground: TourStep[] = [];
  let inRule = false;
  let pendingTags: string[] = [];
  let current: TourScenario | null = null;
  let collecting: TourStep[] | null = null; // background or scenario steps
  let inDocString = false;
  let skipScenario = false;

  const finish = () => { current = null; collecting = null; };

  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('"""')) { inDocString = !inDocString; continue; }
    if (inDocString || line === '' || line.startsWith('#') || line.startsWith('|')) continue;
    if (line.startsWith('@')) { pendingTags = line.split(/\s+/).filter((t) => t.startsWith('@')); continue; }
    if (line.startsWith('Feature:')) continue;
    if (line.startsWith('Rule:')) { inRule = true; ruleBackground = []; finish(); continue; }
    if (line.startsWith('Background:')) { collecting = inRule ? ruleBackground : featureBackground; current = null; skipScenario = false; continue; }
    if (line.startsWith('Scenario Outline:') || line.startsWith('Examples:')) { skipScenario = true; finish(); pendingTags = []; continue; }
    if (line.startsWith('Scenario:')) {
      skipScenario = false;
      current = {
        name: line.slice('Scenario:'.length).trim(),
        tags: pendingTags,
        steps: [...featureBackground, ...(inRule ? ruleBackground : [])],
      };
      pendingTags = [];
      const g = current.steps.find((s) => s.action.kind === 'golden-source');
      if (g) current.golden = (g.action as { filename: string }).filename;
      current.steps = current.steps.filter((s) => !['display', 'golden-source', 'show-golden'].includes(s.action.kind));
      scenarios.push(current);
      collecting = null;
      continue;
    }
    const kw = KEYWORDS.find((k) => line.startsWith(k + ' '));
    if (!kw || skipScenario) continue;
    const text = line.slice(kw.length + 1).trim();
    const action = classify(text);
    const step: TourStep = { keyword: kw, text, action };
    if (collecting) { collecting.push(step); continue; }
    if (!current) continue;
    if (action.kind === 'golden-source') { current.golden = action.filename; continue; }
    if (action.kind === 'display' || action.kind === 'show-golden') continue;
    current.steps.push(step);
  }
  return scenarios;
}

// ---------- TourDriver ----------

export interface TourAdapter {
  loadFile(name: string): void | Promise<void>;
  loadLookup(name: string): void | Promise<void>;
  prefillChat(text: string): void | Promise<void>;
  playAudio(name: string): void | Promise<void>;
  showGolden(name: string): void | Promise<void>;
  onFinish?(): void;
}

export class TourDriver {
  private index = -1;
  private _done = false;
  constructor(
    private steps: Array<{ kind: string; arg: string }>,
    private adapter: TourAdapter,
    private golden?: string,
    private elementIdFor: (kind: string) => string = (k) => `el-${k}`,
  ) {}

  play(): void { this.index = 0; this._done = false; }
  get active(): boolean { return this.index >= 0 && this.index < this.steps.length && !this._done; }
  get done(): boolean { return this._done; }
  currentStep(): { kind: string; arg: string } | null { return this.active ? this.steps[this.index]! : null; }
  currentElementId(): string | null { return this.active ? this.elementIdFor(this.steps[this.index]!.kind) : null; }

  async next(): Promise<void> {
    if (!this.active) return;
    const step = this.steps[this.index]!;
    if (step.kind === 'load-file') await this.adapter.loadFile(step.arg);
    else if (step.kind === 'load-lookup') await this.adapter.loadLookup(step.arg);
    else if (step.kind === 'prefill-chat') await this.adapter.prefillChat(step.arg);
    else if (step.kind === 'play-audio') await this.adapter.playAudio(step.arg);
    this.index++;
    if (this.index >= this.steps.length) {
      if (this.golden) await this.adapter.showGolden(this.golden);
      this._done = true;
    }
  }

  finish(): void {
    this.adapter.onFinish?.();
    this._done = true;
    this.index = -1;
  }
}
