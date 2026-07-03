// packages/voice-input/index.ts
var VOICE_INSTRUCTION = `The user's request is spoken in the attached audio clip. Listen to it
and carry out that request directly — there is no written request text.
Also set the \`transcript\` argument of apply_spec_patch to a verbatim
transcript of the audio.`;
function buildVoicePrompt(ctx) {
  const lines = [
    VOICE_INSTRUCTION,
    "",
    `- File: ${ctx.filename}`,
    `- Columns: ${ctx.columns.join(", ")}`
  ];
  if (ctx.selectedCell) {
    lines.push(`- Selected cell: column ${JSON.stringify(ctx.selectedCell.col)}, row ${ctx.selectedCell.row + 1}, value ${JSON.stringify(ctx.selectedCell.value)}`);
  }
  return lines.join(`
`);
}

// packages/voice-input/demo.ts
var out = document.getElementById("out");
var log = (msg) => {
  out.textContent += `${msg}
`;
};
function wavBlob() {
  const samples = 1600;
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (off, s) => {
    for (let i = 0;i < s.length; i++)
      bytes[off + i] = s.charCodeAt(i);
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples * 2, true);
  return new Blob([bytes], { type: "audio/wav" });
}
function stubVoicePort() {
  let recording = false;
  return {
    async startRecording() {
      recording = true;
    },
    async stopRecording() {
      if (!recording)
        throw new Error("not recording");
      recording = false;
      return wavBlob();
    },
    cancelRecording() {
      recording = false;
    }
  };
}
var voice = stubVoicePort();
var stateEl = document.getElementById("vi-state");
var resultEl = document.getElementById("vi-result");
var setState = (s) => {
  stateEl.textContent = s;
  log(`state ${s}`);
};
document.getElementById("vi-start").addEventListener("click", () => {
  voice.startRecording().then(() => setState("recording"));
});
document.getElementById("vi-stop").addEventListener("click", () => {
  voice.stopRecording().then((blob) => {
    resultEl.textContent = `${blob.type} · ${blob.size} bytes`;
    setState("stopped");
    log(`recorded ${blob.type} ${blob.size}`);
  });
});
document.getElementById("vi-cancel").addEventListener("click", () => {
  voice.cancelRecording();
  resultEl.textContent = "";
  setState("idle");
});
log("ready");
log(buildVoicePrompt({
  filename: "people.csv",
  columns: ["name", "phone"],
  selectedCell: { col: "phone", row: 2, value: "555-0199" }
}));
