// #Toolbar demo — mounts the toolbar and both dialogs over plain state;
// every callback appends to the #out event log, the theme toggle flips the
// wrapper, and picking a URL or sample logs it and closes the dialog.
import { mountSampleDialog, mountToolbar, mountUrlDialog, type ToolbarSample } from './dom';

const samples: ToolbarSample[] = [
  { name: 'customers-input.csv', url: 'https://example.com/customers-input.csv' },
  { name: 'videos.jsonl', url: 'https://example.com/videos.jsonl' },
];

let theme: 'light' | 'dark' = 'light';
let urlOpen = false;
let sampleOpen = false;

const out = document.getElementById('out')!;
const log = (msg: string) => { out.textContent += `${msg}\n`; };

function render() {
  document.body.setAttribute('data-theme', theme);
  mountToolbar(document.getElementById('toolbar')!, {
    loaded: true,
    busy: false,
    fileName: 'customers-input.csv',
    rowCount: 95,
    colCount: 3,
    canUndo: true,
    canRedo: true,
    onOpenSample: () => { sampleOpen = true; log('open sample picker'); render(); },
    onOpenLocal: () => log('open local'),
    onOpenUrl: () => { urlOpen = true; log('open url dialog'); render(); },
    onSaveData: () => log('save data'),
    onSaveFlow: () => log('save flow'),
    onUndo: () => log('undo'),
    onRedo: () => log('redo'),
    onToggleTheme: () => { theme = theme === 'light' ? 'dark' : 'light'; log('toggle theme'); render(); },
    onOpenSettings: () => log('open settings'),
    onOpenTutorial: () => log('open tutorial'),
    saveDataMenu: [
      { label: 'Save as JSONL…', onClick: () => log('save as jsonl') },
    ],
    saveFlowMenu: [
      { label: 'Save as Flow…', onClick: () => log('save as flow') },
      { label: 'Save as Python…', onClick: () => log('save as python') },
    ],
  });
  mountUrlDialog(document.getElementById('url-dialog')!, {
    open: urlOpen,
    onSubmit: (url) => { urlOpen = false; log(`open url ${url}`); render(); },
    onClose: () => { urlOpen = false; render(); },
  });
  mountSampleDialog(document.getElementById('sample-dialog')!, {
    open: sampleOpen,
    samples,
    onPick: (url) => { sampleOpen = false; log(`open sample ${url}`); render(); },
    onClose: () => { sampleOpen = false; render(); },
  });
}

log('ready');
render();
