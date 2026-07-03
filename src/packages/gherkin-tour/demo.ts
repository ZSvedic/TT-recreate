// #GherkinTour demo — parses an embedded .feature string with parseTours and
// steps the first scenario through a TourDriver; every adapter dispatch is
// appended to the #out event log.
import { parseTours, TourDriver, type TourAdapter } from './index';

const FEATURE = `Feature: Filter demo
  Background:
    Given load "filter-input.csv"
    And the expected output is "filter-expected.jsonl"

  @web @tour
  Scenario: Filter by Country
    When query "Show only customers in the USA"
    Then column "Country" exists in the spec
    Then compare with the expected output
`;

const out = document.getElementById('out')!;
const log = (msg: string) => { out.textContent += `${msg}\n`; };

const tour = parseTours(FEATURE)[0]!;
document.getElementById('gt-name')!.textContent = tour.name;
document.getElementById('gt-count')!.textContent = String(tour.steps.length);

const adapter: TourAdapter = {
  loadFile: (name) => log(`loadFile(${name})`),
  loadLookup: (name) => log(`loadLookup(${name})`),
  prefillChat: (text) => log(`prefillChat(${text})`),
  playAudio: (name) => log(`playAudio(${name})`),
  showGolden: (name) => log(`showGolden(${name})`),
  onFinish: () => log('onFinish'),
};

const driver = new TourDriver(
  tour.steps.map((s) => ({ kind: s.action.kind, arg: 'filename' in s.action ? s.action.filename : 'text' in s.action ? s.action.text : '' })),
  adapter,
  tour.golden,
);

const stateEl = document.getElementById('gt-state')!;
const setState = () => { stateEl.textContent = driver.done ? 'done' : driver.active ? 'active' : 'inactive'; };

document.getElementById('gt-play')!.addEventListener('click', () => {
  driver.play();
  log('play');
  setState();
});
document.getElementById('gt-next')!.addEventListener('click', () => {
  void driver.next().then(setState);
});

log('ready');
