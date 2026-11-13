// The little floating buddy: drag to move, click to open the panel, right-click for the menu.
const $ = (id) => document.getElementById(id);
const NOTES = {
  start: ["Okay! One thing at a time. I'll keep watch.", "Phone face-down? Great. Let's go!", "I'll hold the clock, you hold the thought.", "Deep breath in… and begin."],
  mid: ["You're doing great. Keep going!", "Wandered off? Just come back. No drama.", "Sip of water? I'll wait.", "Unclench your jaw. Drop your shoulders.", "Stuck? Write the messy version first.", "Halfway-ish. You've got this!"],
  short: ["Break time! Stand up and stretch way up high.", "Look at something far away for 20 seconds.", "Refill your water, I'll keep your seat warm.", "Roll your shoulders back five times.", "Open a window. Fresh air helps!"],
  long: ["Long break! Go for a little walk.", "You earned a proper rest. Screens off for a bit?", "Long break: snack, tea, sky."],
  breakDone: ["Break's over! Ready for another round?", "Feeling fresher? Tap me to start."],
  hourly: ["Psst! It's been an hour. Stretch and look away from the screen?", "Hourly check: shoulders down, water nearby. Tap me to check in."],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

let state = null, tempFace = null, tempFaceTimer = null, bubbleTimer = null;

// ---------- click-through: only Pip, the pill and the bubble catch the mouse
let dragging = false;
document.querySelectorAll(".hit").forEach((el) => {
  el.addEventListener("mouseenter", () => window.pip.act("setClickThrough", false));
  el.addEventListener("mouseleave", () => { if (!dragging) window.pip.act("setClickThrough", true); });
});

// ---------- drag vs click
const buddy = $("buddy");
let down = null, moved = false, raf = 0, last = null;
buddy.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  buddy.setPointerCapture(e.pointerId);
  down = { x: e.screenX, y: e.screenY };
  moved = false;
});
buddy.addEventListener("pointermove", (e) => {
  if (!down) return;
  const dx = e.screenX - down.x, dy = e.screenY - down.y;
  if (!moved && Math.hypot(dx, dy) > 4) { moved = true; dragging = true; buddy.classList.add("dragging"); window.pip.act("dragStart"); }
  if (moved) {
    last = { dx, dy };
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; window.pip.act("dragMove", last); });
  }
});
buddy.addEventListener("pointerup", (e) => {
  if (!down) return;
  buddy.releasePointerCapture(e.pointerId);
  if (moved) { window.pip.act("dragEnd"); buddy.classList.remove("dragging"); }
  else { unlockAudio(); window.pip.act("togglePanel"); }
  down = null; dragging = false;
});
buddy.addEventListener("contextmenu", (e) => { e.preventDefault(); window.pip.act("petMenu"); });
$("pill").addEventListener("click", () => { unlockAudio(); window.pip.act("togglePanel"); });
$("bubble").addEventListener("click", () => { hideBubble(); window.pip.act("togglePanel"); });

// ---------- speech bubble
function say(text, ms = 7000) {
  const b = $("bubble");
  b.textContent = text;
  b.classList.add("show");
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(hideBubble, ms);
}
function hideBubble() { $("bubble").classList.remove("show"); }

// ---------- faces
function showFace() { setPetFace(tempFace || faceForMode(state ? state.timer.mode : "idle")); }
function flashFace(face, ms = 5000) {
  tempFace = face; showFace();
  clearTimeout(tempFaceTimer);
  tempFaceTimer = setTimeout(() => { tempFace = null; showFace(); }, ms);
}

// ---------- sound
let actx = null;
function unlockAudio() { try { actx = actx || new AudioContext(); if (actx.state === "suspended") actx.resume(); } catch {} }
// A soft marimba-like chime: low-passed sine notes with a gentle attack, at a fraction of full volume.
function chime(opts) {
  const { kind = "focus", volume = "soft" } = typeof opts === "string" ? { kind: opts } : opts || {};
  if (volume === "off") return;
  unlockAudio();
  if (!actx) return;
  const peak = volume === "normal" ? 0.12 : 0.045;
  const notes = kind === "break" ? [523.3, 440, 349.2] : kind === "nudge" ? [440, 587.3] : [392, 493.9, 587.3, 784];
  const lp = actx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1800; lp.connect(actx.destination);
  notes.forEach((f, i) => {
    const t = actx.currentTime + 0.05 + i * 0.22;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = "sine"; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0005, t + 1.1);
    o.connect(g).connect(lp); o.start(t); o.stop(t + 1.2);
  });
}

// ---------- wiring
function render() {
  const t = state.timer;
  document.body.classList.remove("mode-idle", "mode-focus", "mode-short", "mode-long");
  document.body.classList.add("mode-" + t.mode);
  document.body.classList.toggle("paused", t.mode !== "idle" && !t.running);
  renderPet($("pet"), state.settings);
  $("updDot").hidden = !state.update;
  $("time").textContent = t.mode === "idle" ? "Tap me" : fmtTime(t.remainingMs) + (t.running ? "" : " ⏸");
  const frac = t.mode === "idle" || !t.total ? 0 : 1 - Math.max(0, t.remainingMs) / t.total;
  $("bar").style.width = (frac * 100).toFixed(1) + "%";
  showFace();
}
window.pip.on("state", (s) => { state = s; render(); });
window.pip.on("face", (f) => (f === "alert" || f === "proud" ? flashFace(f, 6000) : (tempFace = null, showFace())));
window.pip.on("say", (kind) => NOTES[kind] && say(pick(NOTES[kind]), kind === "hourly" || kind === "breakDone" ? 15000 : 7000));
window.pip.on("chime", chime);
window.pip.on("sayText", (text) => { say(text, 20000); flashFace("alert", 5000); });
function burst() {
  const colors = ["#6C4CF1", "#F68BD3", "#CFEF55", "#EA3A1F", "#74B6FF"];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI * 2 * i) / 6 + Math.random() * 0.5, r = 70 + Math.random() * 20;
    const el = document.createElement("div");
    el.className = "spark";
    el.style.setProperty("--dx", Math.cos(a) * r + "px");
    el.style.setProperty("--dy", Math.sin(a) * r * 0.8 - 20 + "px");
    el.innerHTML = Pets.sparkleSVG(colors[i % colors.length], 14 + Math.random() * 10);
    $("stage").appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }
}
window.pip.on("event", (ev) => {
  if (ev.type === "focusDone") { say("Ding! Round done. That's real progress!", 6000); if (!matchMedia("(prefers-reduced-motion: reduce)").matches) burst(); }
  document.body.classList.add("hop");
  setTimeout(() => document.body.classList.remove("hop"), 2000);
});
window.pip.act("getState").then((s) => { state = s; render(); say(`Hi, I'm ${Pets.nameFor(s.settings)}! Tap me to start a focus round.`, 6000); });
