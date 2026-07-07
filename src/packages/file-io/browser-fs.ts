// #FileIO — BrowserFilePort (browser-fs entry, DOM required): the FilePort
// over the File System Access API where the browser has it; elsewhere
// pickOpen falls back to a hidden <input type=file> and pickSave to a
// download anchor (that save resolves as "downloaded", never "cancelled").
import type { FilePort, SaveOutcome } from './index.ts';

type OpenPicker = (opts: { types: Array<{ accept: Record<string, string[]> }> }) => Promise<Array<{ getFile(): Promise<File> }>>;
type SavePicker = (opts: { suggestedName: string }) => Promise<{ createWritable(): Promise<{ write(d: Uint8Array): Promise<void>; close(): Promise<void> }>; name: string }>;

export function browserFilePort(): FilePort {
  const w = globalThis as { showOpenFilePicker?: OpenPicker; showSaveFilePicker?: SavePicker };
  const hasFileSystemAccess = typeof w.showOpenFilePicker === 'function' && typeof w.showSaveFilePicker === 'function';

  return {
    hasFileSystemAccess,

    async pickOpen(accept: string) {
      if (hasFileSystemAccess) {
        try {
          const exts = accept.split(',').map((s) => s.trim()).filter(Boolean);
          const [handle] = await w.showOpenFilePicker!({
            types: [{ accept: { 'application/octet-stream': exts } }],
          });
          if (!handle) return null;
          const file = await handle.getFile();
          return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
        } catch {
          return null; // dismissed
        }
      }
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        input.addEventListener('change', async () => {
          const file = input.files?.[0];
          if (!file) return resolve(null);
          resolve({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
        });
        input.addEventListener('cancel', () => resolve(null));
        input.click();
      });
    },

    async pickSave(suggestedName: string, _accept: string, content: Uint8Array): Promise<SaveOutcome> {
      if (hasFileSystemAccess) {
        try {
          const handle = await w.showSaveFilePicker!({ suggestedName });
          const writable = await handle.createWritable();
          await writable.write(content);
          await writable.close();
          return { status: 'saved', name: handle.name };
        } catch {
          return { status: 'cancelled' };
        }
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([content as unknown as BlobPart]));
      a.download = suggestedName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      return { status: 'downloaded', name: suggestedName };
    },
  };
}
