// Time's-up sounds. "chime" is the standard sound; the others are little voices for each buddy.
// The pop, woof, meow and roar are real recordings in renderer/sounds/ (made from sounds-raw/ by
// tools/make-sounds.js). The chime and the bunny squeak are synthesized with Web Audio.
(function () {
  const ALARMS = {
    chime:  { label: "Chime" },
    pop:    { label: "Tomato pop", species: "tomato" },
    woof:   { label: "Pup woof",   species: "dog" },
    meow:   { label: "Cat meow",   species: "cat" },
    squeak: { label: "Bunny squeak", species: "bunny" },
    roar:   { label: "Bear roar",  species: "bear" },
  };
  const RECORDED = ["pop", "woof", "meow", "roar"];
  // recordings are leveled to the same loudness; these keep them in line with the soft chime
  const FILE_VOLUME = { soft: 0.3, normal: 0.75 };

  const resolve = (alarm) => (ALARMS[alarm] ? alarm : "chime");

  // the original soft marimba-like chime
  function chime(ctx, t0, peak, kind) {
    const notes = kind === "break" ? [523.3, 440, 349.2] : kind === "nudge" ? [440, 587.3] : [392, 493.9, 587.3, 784];
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1800; lp.connect(ctx.destination);
    notes.forEach((f, i) => {
      const t = t0 + i * 0.22, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0005, t + 1.1);
      o.connect(g).connect(lp); o.start(t); o.stop(t + 1.2);
    });
  }

  // Hops: three quick, high squeaks
  function squeak(ctx, t0, peak) {
    [0, 0.12, 0.24].forEach((dt, i) => {
      const t = t0 + dt, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(1300 + i * 120, t); o.frequency.exponentialRampToValueAtTime(2100 + i * 160, t + 0.07);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak * 2, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.11);
    });
  }

  const cache = {};
  function playFile(name, volume) {
    const a = cache[name] || (cache[name] = new Audio(`sounds/${name}.wav`));
    a.volume = FILE_VOLUME[volume] || FILE_VOLUME.soft;
    a.currentTime = 0;
    a.play().catch(() => {});
  }

  // kind: "focus" | "break" | "nudge". Hourly nudges always use the gentle chime.
  function play(ctx, { kind = "focus", volume = "soft", alarm = "chime" } = {}) {
    if (volume === "off") return;
    const which = kind === "nudge" ? "chime" : resolve(alarm);
    if (RECORDED.includes(which)) return playFile(which, volume);
    if (!ctx) return;
    const peak = volume === "normal" ? 0.12 : 0.045;
    if (which === "squeak") squeak(ctx, ctx.currentTime + 0.05, peak);
    else chime(ctx, ctx.currentTime + 0.05, peak, kind);
  }

  // load the recordings up front so the first one plays without a delay
  if (typeof Audio !== "undefined") RECORDED.forEach((n) => { cache[n] = new Audio(`sounds/${n}.wav`); cache[n].preload = "auto"; });

  window.Sounds = { ALARMS, resolve, play };
})();
