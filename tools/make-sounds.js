// Turns the raw recordings in sounds-raw/ into the app's sounds in renderer/sounds/.
//   node tools/make-sounds.js
// For each sound: decode (macOS afconvert) → keep the main burst of sound → raise the pitch a little
// so it sounds smaller and cuter → soft fades → even loudness → 16-bit mono WAV.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const RAW = path.join(ROOT, "sounds-raw");
const OUT = path.join(ROOT, "renderer", "sounds");
const RATE = 48000;

// pitch: 1 = as recorded, 1.2 = 20% higher (and a little quicker)
const SOUNDS = {
  woof: { pitch: 1.22 },
  meow: { pitch: 1.12 },
  roar: { pitch: 1.08 },
  pop:  { pitch: 1.0 },
};

const TARGET_RMS = 0.14;   // same perceived loudness for every sound
const MAX_PEAK = 0.89;     // about -1 dB, never clips
const GAP_MS = 300;        // silence longer than this ends the sound (cuts stray clicks after it)

function readWav(file) {
  const b = fs.readFileSync(file);
  let o = 12;
  while (b.toString("ascii", o, o + 4) !== "data") o += 8 + b.readUInt32LE(o + 4);
  const len = b.readUInt32LE(o + 4); o += 8;
  const s = new Float32Array(len / 2);
  for (let i = 0; i < s.length; i++) s[i] = b.readInt16LE(o + i * 2) / 32768;
  return s;
}
function writeWav(file, s) {
  const b = Buffer.alloc(44 + s.length * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + s.length * 2, 4); b.write("WAVE", 8);
  b.write("fmt ", 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(RATE, 24); b.writeUInt32LE(RATE * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(s.length * 2, 40);
  for (let i = 0; i < s.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s[i])) * 32767), 44 + i * 2);
  fs.writeFileSync(file, b);
}

// Keep the main burst of sound, measured in 10 ms blocks.
function mainBurst(s) {
  const blk = RATE / 100, rms = [];
  for (let i = 0; i < s.length; i += blk) {
    let r = 0; for (let j = i; j < Math.min(i + blk, s.length); j++) r += s[j] * s[j];
    rms.push(Math.sqrt(r / blk));
  }
  // Grow outward from the loudest block until there's GAP_MS of quiet on each side,
  // so faint breaths before the sound and stray clicks after it are left out.
  const top = Math.max(...rms), thr = top * 0.06, peakAt = rms.indexOf(top);
  let start = peakAt, end = peakAt, quiet = 0;
  for (let k = peakAt; k >= 0; k--) { if (rms[k] > thr) { start = k; quiet = 0; } else if (++quiet * 10 > GAP_MS) break; }
  quiet = 0;
  for (let k = peakAt; k < rms.length; k++) { if (rms[k] > thr) { end = k; quiet = 0; } else if (++quiet * 10 > GAP_MS) break; }
  const pre = 2, post = 6; // keep a breath of room on both sides
  return s.slice(Math.max(0, (start - pre) * blk), Math.min(s.length, (end + post) * blk));
}

function repitch(s, r) {
  if (r === 1) return s;
  const out = new Float32Array(Math.floor(s.length / r));
  for (let i = 0; i < out.length; i++) {
    const x = i * r, k = Math.floor(x), f = x - k;
    out[i] = (s[k] || 0) * (1 - f) + (s[k + 1] || 0) * f;
  }
  return out;
}

function polish(s) {
  // remove any DC offset
  const mean = s.reduce((a, x) => a + x, 0) / s.length;
  for (let i = 0; i < s.length; i++) s[i] -= mean;
  // fades: 8 ms in, 60 ms out
  const fi = Math.round(RATE * 0.008), fo = Math.round(RATE * 0.06);
  for (let i = 0; i < fi; i++) s[i] *= i / fi;
  for (let i = 0; i < fo; i++) s[s.length - 1 - i] *= i / fo;
  // loudness: match RMS of the sounding part, capped so the peak never clips
  let sum = 0, n = 0, pk = 0;
  for (const x of s) { pk = Math.max(pk, Math.abs(x)); if (Math.abs(x) > 0.01) { sum += x * x; n++; } }
  const gain = Math.min(TARGET_RMS / Math.sqrt(sum / (n || 1)), MAX_PEAK / pk);
  for (let i = 0; i < s.length; i++) s[i] *= gain;
  return s;
}

fs.mkdirSync(OUT, { recursive: true });
const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "fb-sounds-"));
for (const [name, { pitch }] of Object.entries(SOUNDS)) {
  const src = fs.readdirSync(RAW).find((f) => path.parse(f).name.toLowerCase() === name && !f.endsWith(".wav"));
  if (!src) { console.log(`skip ${name}: no recording in sounds-raw/`); continue; }
  const wav = path.join(tmp, name + ".wav");
  execFileSync("afconvert", ["-f", "WAVE", "-d", `LEI16@${RATE}`, "-c", "1", path.join(RAW, src), wav]);
  const out = polish(repitch(mainBurst(readWav(wav)), pitch));
  writeWav(path.join(OUT, name + ".wav"), out);
  console.log(`${name}: ${(out.length / RATE).toFixed(2)} s, pitch ×${pitch}`);
}
fs.rmSync(tmp, { recursive: true, force: true });
