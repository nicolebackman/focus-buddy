// Turns the raw recordings in sounds-raw/ into the app's sounds in renderer/sounds/.
//   node tools/make-sounds.js
// For each sound: decode (macOS afconvert) → keep the main burst of sound → raise the pitch a little
// so it sounds smaller and cuter → smooth it so it sounds produced rather than recorded
// (cut rumble and harsh highs, quiet breaths and room noise, even out the volume, a soft short echo)
// → soft fades → even loudness → 16-bit mono WAV.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const RAW = path.join(ROOT, "sounds-raw");
const OUT = path.join(ROOT, "renderer", "sounds");
const RATE = 48000;

// pitch: 1 = as recorded, 1.2 = 20% higher (and a little quicker)
// soften: highest frequency kept (Hz); lower = rounder and softer
// echo: how much of the soft echo is mixed in (0 = none)
const SOUNDS = {
  woof: { pitch: 1.22, soften: 6000, echo: 0.16 },
  meow: { pitch: 1.12, soften: 6500, echo: 0.18 },
  roar: { pitch: 1.08, soften: 4500, echo: 0.14 },
  pop:  { pitch: 1.0,  soften: 7500, echo: 0.2 },
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

// ---------------------------------------------------------------- smoothing
// Standard 2nd-order filters (RBJ audio EQ cookbook).
function biquad(s, type, freq, q = 0.707) {
  const w = (2 * Math.PI * freq) / RATE, c = Math.cos(w), al = Math.sin(w) / (2 * q);
  const [b0, b1, b2] = type === "low" ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : [(1 + c) / 2, -(1 + c), (1 + c) / 2];
  const a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
  const out = new Float32Array(s.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < s.length; i++) {
    const y = (b0 * s[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = s[i]; y2 = y1; y1 = y; out[i] = y;
  }
  return out;
}
const coef = (ms) => Math.exp(-1 / (RATE * ms / 1000));

// Volume shaping driven by how loud the sound is at each moment:
//  - below `floorDb` (breaths, room noise) it is turned down further, so the quiet parts go silent
//  - above `kneeDb` (the loudest bits) it is squeezed 3:1, so the sound is even instead of spiky
function dynamics(s, floorDb = -34, kneeDb = -14) {
  let pk = 0; for (const x of s) pk = Math.max(pk, Math.abs(x));
  const floor = pk * 10 ** (floorDb / 20), knee = pk * 10 ** (kneeDb / 20);
  const ea = coef(4), er = coef(70), ga = coef(6), gr = coef(80);
  let env = 0, g = 1;
  const out = new Float32Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const a = Math.abs(s[i]);
    env = a > env ? ea * env + (1 - ea) * a : er * env + (1 - er) * a;
    let want = 1;
    if (env < floor) want = (env / floor) ** 1.5;            // expander, ratio 2.5:1
    else if (env > knee) want = (env / knee) ** (1 / 3 - 1); // compressor, ratio 3:1
    g = want < g ? ga * g + (1 - ga) * want : gr * g + (1 - gr) * want;
    out[i] = s[i] * g;
  }
  return out;
}

// A small, soft, dark echo (Schroeder reverb) so the sound feels round rather than dry and close-miked.
function softEcho(s, mix) {
  if (!mix) return s;
  const tail = Math.round(RATE * 0.45), n = s.length + tail;
  const dry = new Float32Array(n); dry.set(s);
  const wet = new Float32Array(n);
  const pre = Math.round(RATE * 0.012);
  for (const ms of [29.7, 37.1, 41.1, 43.7]) {
    const d = Math.round(RATE * ms / 1000), buf = new Float32Array(d);
    let p = 0, lp = 0;
    for (let i = 0; i < n; i++) {
      const out = buf[p];
      lp = out * 0.6 + lp * 0.4;                // darken each repeat
      buf[p] = (i >= pre ? dry[i - pre] : 0) + lp * 0.7;
      wet[i] += out / 4;
      p = (p + 1) % d;
    }
  }
  let w = wet;
  for (const [ms, g] of [[5, 0.6], [1.7, 0.6]]) {
    const d = Math.round(RATE * ms / 1000), buf = new Float32Array(d), out = new Float32Array(n);
    let p = 0;
    for (let i = 0; i < n; i++) { const b = buf[p]; const v = w[i] + b * g; buf[p] = v; out[i] = b - g * v; p = (p + 1) % d; }
    w = out;
  }
  for (let i = 0; i < n; i++) dry[i] = dry[i] + w[i] * mix;
  return dry;
}

function smooth(s, { soften, echo }) {
  let x = biquad(s, "high", 140);            // rumble, desk bumps and "p" thumps
  x = biquad(biquad(x, "low", soften), "low", soften); // breathiness, hiss and harsh edges
  x = dynamics(x);
  return softEcho(x, echo);
}

const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t); // S-curve fades sound smoother than straight ones

function polish(s) {
  // remove any DC offset
  const mean = s.reduce((a, x) => a + x, 0) / s.length;
  for (let i = 0; i < s.length; i++) s[i] -= mean;
  // fades: 12 ms in, 150 ms out (into the echo tail)
  const fi = Math.round(RATE * 0.012), fo = Math.round(RATE * 0.15);
  for (let i = 0; i < fi; i++) s[i] *= ease(i / fi);
  for (let i = 0; i < fo; i++) s[s.length - 1 - i] *= ease(i / fo);
  // trim the silent end of the echo tail
  let last = s.length - 1;
  while (last > 0 && Math.abs(s[last]) < 1e-4) last--;
  s = s.slice(0, last + 1);
  // loudness: match RMS of the sounding part, capped so the peak never clips
  let sum = 0, n = 0, pk = 0;
  for (const x of s) { pk = Math.max(pk, Math.abs(x)); if (Math.abs(x) > 0.01) { sum += x * x; n++; } }
  const gain = Math.min(TARGET_RMS / Math.sqrt(sum / (n || 1)), MAX_PEAK / pk);
  for (let i = 0; i < s.length; i++) s[i] *= gain;
  return s;
}

fs.mkdirSync(OUT, { recursive: true });
const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "fb-sounds-"));
for (const [name, opts] of Object.entries(SOUNDS)) {
  const src = fs.readdirSync(RAW).find((f) => path.parse(f).name.toLowerCase() === name && !f.endsWith(".wav"));
  if (!src) { console.log(`skip ${name}: no recording in sounds-raw/`); continue; }
  const wav = path.join(tmp, name + ".wav");
  execFileSync("afconvert", ["-f", "WAVE", "-d", `LEI16@${RATE}`, "-c", "1", path.join(RAW, src), wav]);
  const out = polish(smooth(repitch(mainBurst(readWav(wav)), opts.pitch), opts));
  writeWav(path.join(OUT, name + ".wav"), out);
  console.log(`${name}: ${(out.length / RATE).toFixed(2)} s, pitch ×${opts.pitch}, softened above ${opts.soften} Hz, echo ${opts.echo}`);
}
fs.rmSync(tmp, { recursive: true, force: true });
