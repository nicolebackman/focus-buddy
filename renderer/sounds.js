// Time's-up sounds. Everything is synthesized with Web Audio, so there are no sound files to ship.
// "chime" is the standard sound; the others are little voices for each buddy.
(function () {
  const ALARMS = {
    chime:  { label: "Chime" },
    buddy:  { label: "My buddy" },
    pop:    { label: "Tomato pop", species: "tomato" },
    woof:   { label: "Pup woof",   species: "dog" },
    meow:   { label: "Cat meow",   species: "cat" },
    squeak: { label: "Bunny squeak", species: "bunny" },
    roar:   { label: "Bear roar",  species: "bear" },
  };
  const VOICE_FOR = { tomato: "pop", dog: "woof", cat: "meow", bunny: "squeak", bear: "roar" };

  // "buddy" follows whichever pet is chosen.
  const resolve = (alarm, species) => (alarm === "buddy" ? VOICE_FOR[species] || "chime" : ALARMS[alarm] ? alarm : "chime");

  function env(ctx, g, t, peak, attack, end) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
  }
  let noiseBuf = null;
  function noise(ctx) {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s;
  }

  // the original soft marimba-like chime
  function chime(ctx, out, t0, peak, kind) {
    const notes = kind === "break" ? [523.3, 440, 349.2] : kind === "nudge" ? [440, 587.3] : [392, 493.9, 587.3, 784];
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1800; lp.connect(out);
    notes.forEach((f, i) => {
      const t = t0 + i * 0.22, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0005, t + 1.1);
      o.connect(g).connect(lp); o.start(t); o.stop(t + 1.2);
    });
  }

  // Pip: two bubbly "bloop"s going up
  function pop(ctx, out, t0, peak) {
    [[260, 700, 0], [340, 920, 0.17]].forEach(([a, b, dt]) => {
      const t = t0 + dt, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(a, t); o.frequency.exponentialRampToValueAtTime(b, t + 0.09);
      env(ctx, g, t, peak * 2.4, 0.01, t + 0.16);
      o.connect(g).connect(out); o.start(t); o.stop(t + 0.2);
    });
  }

  // Bo: two small, high puppy "woofs"
  function woof(ctx, out, t0, peak) {
    [0, 0.26].forEach((dt, i) => {
      const t = t0 + dt, end = t + 0.17;
      const o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(i ? 640 : 600, t); o.frequency.exponentialRampToValueAtTime(300, t + 0.14);
      bp.type = "bandpass"; bp.Q.value = 1.4;
      bp.frequency.setValueAtTime(1200, t); bp.frequency.exponentialRampToValueAtTime(650, t + 0.14);
      env(ctx, g, t, peak * 4, 0.012, end);
      o.connect(bp).connect(g).connect(out); o.start(t); o.stop(end + 0.02);
      // a puff of breath at the start of each woof
      const n = noise(ctx), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      nf.type = "bandpass"; nf.frequency.value = 1600; nf.Q.value = 0.8;
      env(ctx, ng, t, peak * 0.9, 0.005, t + 0.06);
      n.connect(nf).connect(ng).connect(out); n.start(t); n.stop(t + 0.08);
    });
  }

  // Miso: one "mee-ow" — the pitch rises then falls while the vowel moves from "ee" to "ow"
  function meow(ctx, out, t0, peak) {
    const t = t0, end = t + 0.78;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(540, t);
    o.frequency.linearRampToValueAtTime(860, t + 0.24);
    o.frequency.linearRampToValueAtTime(640, t + 0.58);
    o.frequency.linearRampToValueAtTime(480, end);
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 6; lg.gain.value = 14; lfo.connect(lg).connect(o.frequency);
    const mix = ctx.createGain(); mix.gain.value = 1;
    [[[450, 900, 620], 6], [[2300, 1500, 1000], 8]].forEach(([f, q]) => {
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = q;
      bp.frequency.setValueAtTime(f[0], t);
      bp.frequency.linearRampToValueAtTime(f[1], t + 0.3);
      bp.frequency.linearRampToValueAtTime(f[2], end);
      o.connect(bp).connect(mix);
    });
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak * 2, t + 0.07);
    g.gain.setValueAtTime(peak * 2, t + 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    mix.connect(g).connect(out);
    o.start(t); lfo.start(t); o.stop(end + 0.02); lfo.stop(end + 0.02);
  }

  // Hops: three quick, high squeaks
  function squeak(ctx, out, t0, peak) {
    [0, 0.12, 0.24].forEach((dt, i) => {
      const t = t0 + dt, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(1300 + i * 120, t); o.frequency.exponentialRampToValueAtTime(2100 + i * 160, t + 0.07);
      env(ctx, g, t, peak * 2, 0.008, t + 0.09);
      o.connect(g).connect(out); o.start(t); o.stop(t + 0.11);
    });
  }

  // Nori: a small, friendly "rawr" with a growly flutter
  function roar(ctx, out, t0, peak) {
    const t = t0, end = t + 0.95;
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain(), am = ctx.createGain();
    o.type = "sawtooth"; o2.type = "square";
    o.frequency.setValueAtTime(190, t); o.frequency.linearRampToValueAtTime(240, t + 0.25); o.frequency.exponentialRampToValueAtTime(130, end);
    o2.frequency.setValueAtTime(95, t); o2.frequency.linearRampToValueAtTime(120, t + 0.25); o2.frequency.exponentialRampToValueAtTime(65, end);
    lp.type = "lowpass"; lp.Q.value = 3;
    lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(1300, t + 0.25); lp.frequency.exponentialRampToValueAtTime(400, end);
    // growl: wobble the volume quickly
    const lfo = ctx.createOscillator(), lfoG = ctx.createGain();
    lfo.frequency.value = 26; lfoG.gain.value = 0.45; am.gain.value = 0.6;
    lfo.connect(lfoG).connect(am.gain);
    const o2g = ctx.createGain(); o2g.gain.value = 0.35;
    o.connect(lp); o2.connect(o2g).connect(lp);
    const n = noise(ctx), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
    nf.type = "lowpass"; nf.frequency.value = 900; ng.gain.value = 0.5;
    n.connect(nf).connect(ng).connect(lp);
    env(ctx, g, t, peak * 2.4, 0.12, end);
    lp.connect(am).connect(g).connect(out);
    [o, o2, lfo, n].forEach((s) => { s.start(t); s.stop(end + 0.02); });
  }

  const PLAY = { chime, pop, woof, meow, squeak, roar };

  // kind: "focus" | "break" | "nudge". Hourly nudges always use the gentle chime.
  function play(ctx, { kind = "focus", volume = "soft", alarm = "chime", species = "tomato" } = {}) {
    if (!ctx || volume === "off") return;
    const peak = volume === "normal" ? 0.12 : 0.045;
    const which = kind === "nudge" ? "chime" : resolve(alarm, species);
    const out = ctx.createDynamicsCompressor(); out.connect(ctx.destination); // keeps the voices from clipping
    PLAY[which](ctx, out, ctx.currentTime + 0.05, peak, kind);
  }

  window.Sounds = { ALARMS, VOICE_FOR, resolve, play };
})();
