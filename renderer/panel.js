// The panel that opens when you tap Pip: timer controls, settings, and the reflection chat.
const $ = (id) => document.getElementById(id);
const act = (name, payload) => window.pip.act(name, payload);
let state = null, view = "home", chosenLen = null;
const FOCUS = ["Scattered", "Wobbly", "Okay", "Good", "Deep"];
const ENERGY = ["Drained", "Low", "Steady", "Good", "Buzzing"];

function show(v) {
  view = v;
  for (const id of ["home", "settings", "chat"]) $(id).hidden = id !== v;
  $("foot").hidden = v === "chat";
  if (v === "settings") fillSettings();
  if (v === "home") setTimeout(() => state && state.timer.mode === "idle" && $("intent").focus(), 50);
  render();
}

// ---------------- home
function renderHome() {
  const t = state.timer, s = state.settings;
  document.body.classList.remove("mode-idle", "mode-focus", "mode-short", "mode-long");
  document.body.classList.add("mode-" + t.mode);
  const label = { idle: "Ready when you are", focus: "Focus time", short: "Short break", long: "Long break" }[t.mode];
  $("modeLabel").textContent = label + (t.mode !== "idle" && !t.running ? " · paused" : "");
  const len = chosenLen || s.focus;
  $("clock").textContent = t.mode === "idle" ? fmtTime(len * 60000) : fmtTime(t.remainingMs);
  $("updBar").hidden = !state.update;
  if (state.update) $("updTitle").textContent = `Version ${state.update.version} is ready`;
  const td = state.today || { rounds: 0, minutes: 0 };
  $("todayLine").innerHTML = td.rounds ? `<b>${td.rounds}</b> round${td.rounds === 1 ? "" : "s"} · <b>${td.minutes}</b> min focused today` : "No rounds yet today. First one's the hardest!";
  document.querySelectorAll(".pet-slot").forEach((el) => renderPet(el, s));
  $("idleBox").hidden = t.mode !== "idle";
  $("runBox").hidden = t.mode === "idle";
  if (t.mode === "idle") {
    const opts = [...new Set([15, 25, 45, 50, s.focus])].sort((a, b) => a - b);
    const key = opts.join(",") + "|" + len;
    if ($("lens").dataset.key !== key) {
      $("lens").dataset.key = key;
      $("lens").innerHTML = "";
      opts.forEach((m) => {
        const b = document.createElement("button");
        b.className = "chip"; b.textContent = m + " min"; b.setAttribute("aria-pressed", String(m === len));
        b.onclick = () => { chosenLen = m; render(); };
        $("lens").appendChild(b);
      });
    }
    $("startBtn").textContent = `Start ${len}-min focus`;
  } else {
    $("working").innerHTML = "";
    if (t.mode === "focus" && t.intent) { $("working").append("Working on: "); const b = document.createElement("b"); b.textContent = t.intent; $("working").append(b); }
    else $("working").textContent = t.mode === "focus" ? `Heads down. ${Pets.nameFor(s)}'s got the clock.` : "Rest your eyes, stretch, sip some water.";
    $("pauseBtn").textContent = t.running ? "Pause" : "Resume";
    $("pauseBtn").className = "btn grow primary";
    $("earlyBtn").textContent = t.mode === "focus" ? "Finish early" : "Skip break";
  }
}
$("startBtn").onclick = () => { act("startFocus", { intent: $("intent").value, minutes: chosenLen || state.settings.focus }); $("intent").value = ""; chosenLen = null; act("hidePanel"); };
$("intent").addEventListener("keydown", (e) => { if (e.key === "Enter") $("startBtn").click(); });
$("breakBtn").onclick = () => act("startBreak");
$("pauseBtn").onclick = () => act("togglePause");
$("earlyBtn").onclick = () => act(state.timer.mode === "focus" ? "finishEarly" : "skipBreak");
$("stopBtn").onclick = () => act("stopAll");
$("closeHome").onclick = () => act("hidePanel");
$("updGet").onclick = () => act("openUpdate");
$("updX").onclick = () => act("dismissUpdate");
$("goCheckin").onclick = () => act("checkin");
$("goDash").onclick = () => act("openDashboard");
$("goSettings").onclick = () => show("settings");

// ---------------- settings
function fillSettings() {
  const s = state.settings;
  $("sFocus").value = s.focus; $("sShort").value = s.short; $("sLong").value = s.long; $("sEvery").value = s.every;
  document.querySelectorAll("input[data-key]").forEach((el) => (el.checked = !!s[el.dataset.key]));
  const vp = $("volPick"); vp.innerHTML = "";
  [["off", "Off"], ["soft", "Soft"], ["normal", "Normal"]].forEach(([v, label]) => {
    const b = document.createElement("button");
    b.className = "chip"; b.textContent = label; b.setAttribute("aria-pressed", String(s.volume === v));
    b.onclick = () => act("saveSettings", { volume: v }).then(() => { if (v !== "off") act("previewChime", v); refresh(); });
    vp.appendChild(b);
  });
  const ap = $("alarmPick"); ap.innerHTML = "";
  Object.entries(Sounds.ALARMS).forEach(([v, { label }]) => {
    const b = document.createElement("button");
    b.className = "chip"; b.textContent = label; b.setAttribute("aria-pressed", String((s.alarm || "chime") === v));
    b.onclick = () => act("saveSettings", { alarm: v }).then(() => { act("previewChime", { alarm: v }); refresh(); });
    ap.appendChild(b);
  });
  for (const [id, key] of [["qFrom", "quietFrom"], ["qTo", "quietTo"]]) {
    const sel = $(id);
    if (!sel.options.length) for (let h = 0; h < 24; h++) sel.add(new Option(String(h).padStart(2, "0") + ":00", h));
    sel.value = s[key];
    sel.disabled = !s.quietHours;
  }
  $("keySaved").hidden = !s.hasKey;
  $("keyRow").hidden = s.hasKey;
  $("keyNote").textContent = s.hasKey ? "For safety the key itself is never shown. Remove it to paste a new one." : "No key saved. Your buddy uses its own built-in questions.";
  if (document.activeElement !== $("petName")) { $("petName").value = s.petName || ""; $("petName").placeholder = Pets.SPECIES[s.pet].name; }
  const pick = $("petPick"); pick.innerHTML = "";
  Object.entries(Pets.SPECIES).forEach(([id, sp]) => {
    const b = document.createElement("button");
    b.className = "petpick"; b.setAttribute("aria-pressed", String(s.pet === id)); b.title = sp.label;
    b.innerHTML = `<div class="p">${Pets.petSVG(id, s.pet === id ? s.petColor : sp.defaultColor)}</div>${sp.label}`;
    b.onclick = () => act("saveSettings", { pet: id, petColor: sp.defaultColor }).then(refresh);
    pick.appendChild(b);
  });
  const sw = $("swatches"); sw.innerHTML = "";
  Object.entries(Pets.COLORS).forEach(([id, c]) => {
    const b = document.createElement("button");
    b.className = "sw"; b.style.background = c.body; b.title = c.label; b.setAttribute("aria-label", c.label + " color");
    b.setAttribute("aria-pressed", String(s.petColor === id));
    b.onclick = () => act("saveSettings", { petColor: id }).then(refresh);
    sw.appendChild(b);
  });
}
[["sFocus", "focus"], ["sShort", "short"], ["sLong", "long"], ["sEvery", "every"]].forEach(([id, key]) => {
  $(id).addEventListener("change", () => act("saveSettings", { [key]: $(id).value }).then(fillSettings));
});
document.querySelectorAll("input[data-key]").forEach((el) => el.addEventListener("change", () => act("saveSettings", { [el.dataset.key]: el.checked })));
$("qFrom").addEventListener("change", () => act("saveSettings", { quietFrom: $("qFrom").value }));
$("qTo").addEventListener("change", () => act("saveSettings", { quietTo: $("qTo").value }));
$("tQuiet").addEventListener("change", () => setTimeout(refresh, 50));
$("petName").addEventListener("change", () => act("saveSettings", { petName: $("petName").value }));
async function refresh() { state = await act("getState"); fillSettings(); }
$("saveKey").onclick = async () => {
  try {
    await act("saveSettings", { apiKey: $("apiKey").value });
    $("apiKey").value = "";
    setTimeout(fillSettings, 50);
  } catch {
    $("keyNote").textContent = "This Mac couldn't encrypt the key, so it wasn't saved.";
  }
};
$("removeKey").onclick = () => act("saveSettings", { apiKey: "" }).then(refresh);
$("backSettings").onclick = () => show("home");

// ---------------- chat
let renderedMsgs = -1, renderedStage = null, rFocus = 0, rEnergy = 0;
function renderChat() {
  const r = state.reflect;
  if (!r) return;
  document.querySelectorAll(".pet-slot").forEach((el) => renderPet(el, state.settings));
  $("chatTitle").textContent = r.kind === "checkin" ? `Check-in with ${Pets.nameFor(state.settings)}` : "How did it go?";
  if (renderedMsgs !== r.messages.length || renderedStage !== r.stage) {
    const box = $("msgs");
    box.innerHTML = "";
    r.messages.forEach((m) => {
      const d = document.createElement("div");
      d.className = "msg " + (m.from === "pip" ? "pip" : "me");
      d.textContent = m.text;
      box.appendChild(d);
    });
    if (r.stage === "thinking") box.insertAdjacentHTML("beforeend", `<div class="typing"><i></i><i></i><i></i></div>`);
    box.scrollTop = box.scrollHeight;
    renderedMsgs = r.messages.length;
  }
  if (renderedStage !== r.stage) { renderedStage = r.stage; renderControls(r); }
}
function renderControls(r) {
  const c = $("chatCtl");
  c.innerHTML = "";
  if (r.stage === "answer" || r.stage === "followup") {
    c.innerHTML = `<div class="compose"><textarea id="answer" placeholder="Type your answer…" aria-label="Your answer"></textarea><button class="send" id="send" title="Send" aria-label="Send"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button></div>
      <div class="row" style="margin-top:6px; justify-content:space-between"><span class="note">Enter to send</span><button class="linkbtn" id="skip">${r.stage === "answer" ? "Not now" : "Skip question"}</button></div>`;
    const ta = $("answer");
    const send = () => { if (ta.value.trim()) { act("answer", ta.value); ta.value = ""; } };
    $("send").onclick = send;
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
    ta.addEventListener("input", () => { ta.style.height = "46px"; ta.style.height = Math.min(110, ta.scrollHeight) + "px"; });
    $("skip").onclick = () => act(r.stage === "answer" ? "skipReflection" : "skipFollowUp");
    setTimeout(() => ta.focus(), 30);
  } else if (r.stage === "rate") {
    rFocus = 0; rEnergy = 0;
    c.innerHTML = `<div class="rate"><span class="sec">Focus</span><div class="scale" id="sf"></div><span class="sec">Energy</span><div class="scale" id="se"></div>
      <div class="row" style="margin-top:6px"><button class="btn primary grow" id="rateDone">Done</button><button class="btn ghost" id="rateSkip">Skip</button></div></div>`;
    scale($("sf"), FOCUS, () => rFocus, (v) => (rFocus = v));
    scale($("se"), ENERGY, () => rEnergy, (v) => (rEnergy = v));
    $("rateDone").onclick = () => act("rate", { focus: rFocus, energy: rEnergy });
    $("rateSkip").onclick = () => act("rate", {});
  } else if (r.stage === "done") {
    c.innerHTML = `<div class="row"><button class="btn primary grow" id="doneClose">Close</button><button class="btn ghost" id="doneDash">See dashboard</button></div>`;
    $("doneClose").onclick = () => act("closeReflection");
    $("doneDash").onclick = () => { act("closeReflection"); act("openDashboard"); };
  }
}
function scale(el, labels, get, set) {
  el.innerHTML = "";
  labels.forEach((l, i) => {
    const b = document.createElement("button");
    b.innerHTML = `<b>${i + 1}</b>${l}`;
    b.setAttribute("aria-pressed", String(get() === i + 1));
    b.onclick = () => { set(get() === i + 1 ? 0 : i + 1); scale(el, labels, get, set); };
    el.appendChild(b);
  });
}
$("closeChat").onclick = () => {
  const r = state.reflect;
  if (r && r.stage === "done") act("closeReflection"); else act("hidePanel");
};

// ---------------- wiring
function render() {
  if (!state) return;
  setPetFace(faceForMode(state.timer.mode));
  if (view === "home") renderHome();
  if (view === "chat") renderChat();
}
let hadReflect = false;
window.pip.on("state", (s) => {
  state = s;
  if (view === "chat" && hadReflect && !s.reflect) show("home");
  hadReflect = !!s.reflect;
  render();
});
window.pip.on("view", (v) => { renderedMsgs = -1; renderedStage = null; show(v); });
window.addEventListener("keydown", (e) => { if (e.key === "Escape") act("hidePanel"); });
window.pip.act("getState").then((s) => { state = s; show("home"); });
