// Focus Buddy — a little pet that lives on your desktop and keeps your Pomodoro timer.
// Main process: owns the timer, the windows, and everything saved to disk.
const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, nativeTheme, Notification, safeStorage, shell, powerMonitor } = require("electron");
const PKG = require("./package.json");
const path = require("path");
const fs = require("fs");
const ai = require("./ai");

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
const DEV = !app.isPackaged; // testing switches below only work when running from source, never in the shipped app
if (DEV && process.env.FB_USERDATA) app.setPath("userData", process.env.FB_USERDATA);
if (!app.requestSingleInstanceLock()) app.quit();

// ---------------------------------------------------------------- storage
const DATA_FILE = () => path.join(app.getPath("userData"), "pip-data.json");
const DEFAULT_SETTINGS = {
  focus: 25, short: 5, long: 15, every: 4,
  autoBreak: true, volume: "soft", hourly: true, notes: true,
  quietHours: true, quietFrom: 19, quietTo: 8,
  followUp: true, openAtLogin: false, petPos: null, alarm: "chime",
  pet: "tomato", petColor: "red", petName: "",
};
const SPECIES = { tomato: ["Pip", "tomato"], dog: ["Bo", "pup"], cat: ["Miso", "cat"], bunny: ["Hops", "bunny"], bear: ["Nori", "bear"] };
const COLORS = ["red", "violet", "chartreuse", "pink", "sky"];
const ALARMS = ["chime", "pop", "woof", "meow", "squeak", "roar"];
const petName = () => (S().petName || "").trim() || (SPECIES[S().pet] || SPECIES.tomato)[0];
const persona = () => ({ name: petName(), species: (SPECIES[S().pet] || SPECIES.tomato)[1] });
let data = { settings: { ...DEFAULT_SETTINGS }, reflections: [], timer: null, apiKeyEnc: "", insight: null };

function load() {
  let text;
  try { text = fs.readFileSync(DATA_FILE(), "utf8"); } catch { return; } // first run: no file yet
  try {
    const raw = JSON.parse(text);
    data = { ...data, ...raw, settings: { ...DEFAULT_SETTINGS, ...(raw.settings || {}) } };
    if (!Array.isArray(data.reflections)) data.reflections = [];
    if (!ALARMS.includes(data.settings.alarm)) data.settings.alarm = "chime"; // e.g. the removed "My buddy" option
    if (raw.settings && "sound" in raw.settings && !("volume" in raw.settings)) data.settings.volume = raw.settings.sound ? "soft" : "off";
    delete data.settings.sound;
  } catch (e) {
    // The file exists but can't be read: keep a copy before anything new is saved over it.
    const backup = DATA_FILE().replace(/\.json$/, `-damaged-${Date.now()}.json`);
    try { fs.copyFileSync(DATA_FILE(), backup); } catch {}
    console.error("data file unreadable, backed up to", backup, e.message);
  }
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(DATA_FILE()), { recursive: true });
      fs.writeFileSync(DATA_FILE() + ".tmp", JSON.stringify(data, null, 2));
      fs.renameSync(DATA_FILE() + ".tmp", DATA_FILE());
    } catch (e) { console.error("save failed", e); }
  }, 150);
}
function getApiKey() {
  if (!data.apiKeyEnc) return "";
  try {
    const buf = Buffer.from(data.apiKeyEnc, "base64");
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : "";
  } catch { return ""; }
}
function setApiKey(key) {
  key = (key || "").trim();
  if (!key) { data.apiKeyEnc = ""; return; }
  if (!safeStorage.isEncryptionAvailable()) throw new Error("encryption_unavailable"); // never store the key in plain text
  data.apiKeyEnc = safeStorage.encryptString(key).toString("base64");
}

// ---------------------------------------------------------------- timer
const S = () => data.settings;
let T = { mode: "idle", running: false, endAt: 0, remaining: 0, total: 0, round: 0, intent: "", startedAt: 0, lastNudge: Date.now(), lastNote: Date.now() };
const minsFor = (m) => (m === "focus" ? S().focus : m === "short" ? S().short : S().long);
const remaining = () => (T.running ? T.endAt - Date.now() : T.remaining);
function persistTimer() { data.timer = T; save(); }

function begin(mode, minutes) {
  T.mode = mode;
  T.total = Math.round((minutes || minsFor(mode)) * 60000);
  T.endAt = Date.now() + T.total;
  T.remaining = T.total;
  T.running = true;
  T.lastNote = Date.now();
  if (mode === "focus") T.startedAt = Date.now();
  persistTimer();
}
function startFocus(intent, minutes) {
  if (typeof intent === "string") T.intent = intent.trim().slice(0, 140);
  begin("focus", minutes);
  petSay("start");
  petFace("focus");
}
function startBreak(fromFocus) {
  const long = fromFocus && T.round > 0 && T.round % S().every === 0;
  begin(long ? "long" : "short");
  petFace("rest");
  petSay(long ? "long" : "short");
}
function togglePause() {
  if (T.mode === "idle") return startFocus();
  if (T.running) { T.remaining = T.endAt - Date.now(); T.running = false; }
  else { T.endAt = Date.now() + T.remaining; T.running = true; }
  persistTimer();
}
function stopAll() {
  Object.assign(T, { mode: "idle", running: false, intent: "", lastNudge: Date.now() });
  petFace("idle");
  persistTimer();
}
function finishFocus(early, quiet) {
  const minutes = early ? Math.max(1, Math.round((T.total - remaining()) / 60000)) : Math.round(T.total / 60000);
  T.round += 1;
  const session = { kind: "focus", minutes, intent: T.intent, endedAt: Date.now() };
  T.lastNudge = Date.now();
  notify("Focus round done!", `Time for a break. Tell ${petName()} how it went.`, quiet); // task text stays out of notifications
  sendPet("event", { type: "focusDone" });
  if (S().autoBreak) startBreak(true);
  else { Object.assign(T, { mode: "idle", running: false }); persistTimer(); }
  petFace("proud");
  openReflection(session);
}
function breakDone(quiet) {
  notify("Break's over", "Ready for another focus round?", quiet);
  Object.assign(T, { mode: "idle", running: false, lastNudge: Date.now() });
  persistTimer();
  petFace("alert");
  petSay("breakDone");
  sendPet("event", { type: "breakDone" });
}

// Nudges only count time you actually spend at the computer.
const AWAY_MS = 5 * 60000;            // idle this long = you stepped away
let lastWake = Date.now();
function inQuietHours(d = new Date()) {
  const s = S(); if (!s.quietHours) return false;
  const h = d.getHours(), from = s.quietFrom, to = s.quietTo;
  return from === to ? false : from < to ? h >= from && h < to : h >= from || h < to;
}
function onBackAtComputer() { lastWake = Date.now(); T.lastNudge = Date.now(); persistTimer(); }

function tick() {
  let idleMs = 0;
  try { idleMs = powerMonitor.getSystemIdleTime() * 1000; } catch {}
  if (idleMs > AWAY_MS) T.lastNudge = Date.now();      // away from the keyboard: restart the hourly countdown
  if (T.running && T.endAt <= Date.now()) {
    // A timer that ran out while the Mac was asleep (or long ago) finishes without a sound.
    const quiet = Date.now() - T.endAt > 60000 || Date.now() - lastWake < 60000;
    if (T.mode === "focus") finishFocus(false, quiet); else breakDone(quiet);
  } else if (T.running && T.mode === "focus" && S().notes && Date.now() - T.lastNote > 10 * 60000 && T.endAt - Date.now() > 60000) {
    T.lastNote = Date.now();
    petSay("mid");
  } else if (T.mode === "idle" && S().hourly && Date.now() - T.lastNudge > 60 * 60000 && Date.now() - lastWake > 60000 && !inQuietHours()) {
    T.lastNudge = Date.now();
    persistTimer();
    notify("Hourly stretch", `Stand up, look away from the screen, and check in with ${petName()}.`);
    petFace("alert");
    petSay("hourly");
    sendPet("event", { type: "nudge" });
  }
  broadcast();
}

// ---------------------------------------------------------------- reflections
let reflectSession = null; // { kind, minutes, intent, messages: [], focus, energy, stage }
const QUESTIONS = {
  focus: ["How did that focus time feel?", "What did you focus on?", "What did you get done this round?", "How was that round for you?"],
  checkin: ["How has the past hour been?", "What have you been working on this past hour?", "How are you feeling right now?"],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function openReflection(session) {
  const q = session.kind === "checkin" ? pick(QUESTIONS.checkin) : (session.intent ? pick(QUESTIONS.focus.filter((x) => !x.startsWith("What did you focus"))) : pick(QUESTIONS.focus));
  reflectSession = { ...session, id: "r" + Date.now().toString(36), messages: [{ from: "pip", text: q }], focus: 0, energy: 0, stage: "answer" };
  showPanel("chat");
  broadcast();
}
function cannedFollowUp(s) {
  if (s.focus && s.focus <= 2) return "That sounds like a bumpy one. What got in the way, and what might help next round?";
  if (s.focus >= 4) return "Love that! What helped you stay in the zone?";
  if (s.energy && s.energy <= 2) return "Your energy sounds low. What would help you recharge on this break?";
  return "What's one small thing you'd change for the next round?";
}
async function handleAnswer(text) {
  const s = reflectSession;
  if (!s || !text.trim()) return;
  s.messages.push({ from: "me", text: text.trim().slice(0, 1500) });
  if (s.stage === "answer") {
    s.stage = "rate";
    s.messages.push({ from: "pip", text: "Thanks! Tap how focused and how energized you felt (or skip)." });
  } else if (s.stage === "followup") {
    finishReflection("Got it, saved. Thanks for checking in with me!");
  }
  broadcast();
}
async function handleRating({ focus, energy }) {
  const s = reflectSession;
  if (!s || s.stage !== "rate") return;
  s.focus = focus || 0; s.energy = energy || 0;
  if (!S().followUp) return finishReflection(closing(s));
  s.stage = "thinking";
  broadcast();
  let q = null;
  const key = getApiKey();
  if (key) {
    try { q = await ai.followUp(key, s, recentContext(), persona()); } catch (e) { console.error("follow-up failed", e.message); }
  }
  if (reflectSession !== s) return;
  s.messages.push({ from: "pip", text: q || cannedFollowUp(s) });
  s.stage = "followup";
  broadcast();
}
function closing(s) {
  if (T.mode === "short" || T.mode === "long") return "Saved! Now go enjoy your break. Stretch, sip some water, look out a window.";
  return "Saved! Noticing how you work is how you get better at it.";
}
function finishReflection(msg) {
  const s = reflectSession;
  if (!s) return;
  const answers = s.messages.filter((m) => m.from === "me");
  if (answers.length) {
    data.reflections.push({
      id: s.id, at: Date.now(), kind: s.kind, minutes: s.minutes || 0, intent: s.intent || "",
      focus: s.focus || 0, energy: s.energy || 0,
      conversation: s.messages.map((m) => ({ from: m.from, text: m.text })),
    });
    save();
  }
  s.messages.push({ from: "pip", text: msg || closing(s) });
  s.stage = "done";
  if (answers.length) petFace("proud");
  broadcast();
}
function skipReflection() { reflectSession = null; hidePanel(); broadcast(); }
function recentContext() {
  return data.reflections.slice(-12).map((r) => ({
    when: new Date(r.at).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }),
    kind: r.kind, minutes: r.minutes, intent: r.intent, focus: r.focus, energy: r.energy,
    said: r.conversation.filter((m) => m.from === "me").map((m) => m.text).join(" / "),
  }));
}

// ---------------------------------------------------------------- windows
let pet = null, panel = null, dash = null, tray = null;
const PET_W = 230, PET_H = 250;
const PANEL_W = 330, PANEL_H = 500;

function createPet() {
  const wa = screen.getPrimaryDisplay().workArea;
  const pos = S().petPos || { x: wa.x + wa.width - PET_W - 24, y: wa.y + wa.height - PET_H - 24 };
  pet = new BrowserWindow({
    width: PET_W, height: PET_H, x: pos.x, y: pos.y,
    transparent: true, frame: false, resizable: false, hasShadow: false,
    alwaysOnTop: true, skipTaskbar: true, fullscreenable: false, maximizable: false, minimizable: false,
    backgroundColor: "#00000000",
    webPreferences: { preload: path.join(__dirname, "preload.js") },
  });
  pet.setAlwaysOnTop(true, "floating");
  pet.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  pet.setIgnoreMouseEvents(true, { forward: true });
  pet.loadFile(path.join(__dirname, "renderer", "pet.html"));
  pet.on("moved", () => { const [x, y] = pet.getPosition(); S().petPos = { x, y }; save(); });
  pet.on("closed", () => (pet = null));
}
function placePanel() {
  if (!panel || !pet) return;
  const [px, py] = pet.getPosition();
  const d = screen.getDisplayMatching(pet.getBounds()).workArea;
  let x = px - PANEL_W + 30;                  // prefer the left of Pip
  if (x < d.x + 8) x = px + PET_W - 30;      // not enough room: go right
  let y = py + PET_H - PANEL_H;
  y = Math.max(d.y + 8, Math.min(y, d.y + d.height - PANEL_H - 8));
  x = Math.max(d.x + 8, Math.min(x, d.x + d.width - PANEL_W - 8));
  panel.setPosition(Math.round(x), Math.round(y));
}
function createPanel() {
  panel = new BrowserWindow({
    width: PANEL_W, height: PANEL_H, show: false,
    transparent: true, frame: false, resizable: false, hasShadow: true,
    alwaysOnTop: true, skipTaskbar: true, fullscreenable: false, maximizable: false, minimizable: false,
    backgroundColor: "#00000000",
    webPreferences: { preload: path.join(__dirname, "preload.js") },
  });
  panel.setAlwaysOnTop(true, "floating");
  panel.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  panel.loadFile(path.join(__dirname, "renderer", "panel.html"));
  panel.on("blur", () => {
    // stay open while Pip is waiting for an answer
    if (reflectSession && reflectSession.stage !== "done") return;
    setTimeout(() => { if (panel && !panel.isFocused()) hidePanel(); }, 120);
  });
  panel.on("closed", () => (panel = null));
}
function showPanel(view) {
  if (!panel) createPanel();
  placePanel();
  panel.webContents.send("view", view || "home");
  panel.show();
  panel.focus();
}
function hidePanel() {
  if (panel && panel.isVisible()) panel.hide();
  if (reflectSession && reflectSession.stage === "done") reflectSession = null;
}
function togglePanel() {
  if (panel && panel.isVisible()) return hidePanel();
  showPanel(reflectSession && reflectSession.stage !== "done" ? "chat" : "home");
}
function openDashboard() {
  hidePanel();
  if (dash) { dash.show(); dash.focus(); return; }
  if (app.dock) app.dock.show();
  dash = new BrowserWindow({
    width: 1040, height: 760, minWidth: 420, minHeight: 500,
    titleBarStyle: "hiddenInset", title: "Focus Buddy", backgroundColor: nativeTheme.shouldUseDarkColors ? "#16141A" : "#FAF7F2",
    webPreferences: { preload: path.join(__dirname, "preload.js") },
  });
  dash.loadFile(path.join(__dirname, "renderer", "dashboard.html"));
  dash.on("closed", () => { dash = null; if (app.dock) app.dock.hide(); });
}

// ---------------------------------------------------------------- pet helpers
function sendPet(ch, payload) { if (pet) pet.webContents.send(ch, payload); }
function petFace(face) { sendPet("face", face); }
function petSay(kind) { sendPet("say", kind); }
function notify(title, body, quiet) {
  try { if (Notification.isSupported()) new Notification({ title, body, silent: true }).show(); } catch {}
  if (!quiet && S().volume !== "off") sendPet("chime", { kind: title.startsWith("Hourly") ? "nudge" : title.startsWith("Break") ? "break" : "focus", volume: S().volume, alarm: S().alarm, species: S().pet });
}

// ---------------------------------------------------------------- state to windows
function fmt(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); }
function publicState() {
  const { petPos, ...settings } = S();
  return {
    now: Date.now(),
    timer: { ...T, remainingMs: T.mode === "idle" ? S().focus * 60000 : remaining() },
    settings: { ...settings, hasKey: !!data.apiKeyEnc },
    reflect: reflectSession,
    version: app.getVersion(),
    update: update && data.updateDismissed !== update.version ? update : null,
    today: (() => {
      const k = new Date().toDateString();
      const f = data.reflections.filter((r) => r.kind === "focus" && new Date(r.at).toDateString() === k);
      return { rounds: f.length, minutes: f.reduce((a, r) => a + (r.minutes || 0), 0) };
    })(),
  };
}
function broadcast() {
  const st = publicState();
  for (const w of [pet, panel, dash]) if (w && !w.isDestroyed()) w.webContents.send("state", st);
  updateTray(st);
}
function updateTray(st) {
  if (!tray) return;
  const t = st.timer;
  tray.setTitle(t.mode === "idle" ? "" : " " + fmt(t.remainingMs) + (t.running ? "" : " ⏸"), { fontType: "monospacedDigit" });
  tray.setToolTip(t.mode === "idle" ? `${petName()} — ready when you are` : `${petName()} — ${t.mode === "focus" ? "focus" : "break"} ${fmt(t.remainingMs)}`);
}
// ---------------------------------------------------------------- update notice
// Checks the GitHub releases page named in package.json ("updateRepo": "owner/repo").
// The app can't replace itself (that needs Apple code signing), so it tells you and opens the download.
let update = null;
const newer = (a, b) => {
  const pa = String(a).replace(/^v/, "").split(".").map(Number), pb = String(b).replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return false;
};
async function checkForUpdate() {
  const url = (DEV && process.env.FB_UPDATE_URL) || (PKG.updateRepo ? `https://api.github.com/repos/${PKG.updateRepo}/releases/latest` : "");
  if (!url) return;
  try {
    const res = await fetch(url, { headers: { Accept: "application/vnd.github+json", "User-Agent": "FocusBuddy-update-check" } });
    if (!res.ok) return;
    const rel = await res.json();
    const version = String(rel.tag_name || "").replace(/^v/, "");
    if (!version || !newer(version, app.getVersion())) { update = null; return; }
    const zip = (rel.assets || []).find((a) => /\.zip$/i.test(a.name));
    update = { version, url: zip ? zip.browser_download_url : rel.html_url, page: rel.html_url, notes: String(rel.body || "").slice(0, 400) };
    if (tray) tray.setContextMenu(buildTrayMenu());
    if (data.updateSeen !== version) {
      data.updateSeen = version; save();
      try { if (Notification.isSupported()) new Notification({ title: "Focus Buddy update", body: `Version ${version} is ready to download.`, silent: true }).show(); } catch {}
      sendPet("sayText", `Psst! I've got an update (version ${version}). Tap me to get it.`);
    }
    broadcast();
  } catch (e) { console.error("update check failed", e.message); }
}
// Only ever open https links on github.com, whatever the release data says.
function openSafe(url) {
  try {
    const u = new URL(url);
    if (u.protocol === "https:" && u.hostname === "github.com") return shell.openExternal(u.toString());
  } catch {}
  console.error("refused to open", url);
}
function openUpdate() { if (update) openSafe(update.url); }

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    ...(update ? [{ label: `Download update (version ${update.version})`, click: openUpdate }, { type: "separator" }] : []),
    { label: "Start / pause", click: () => { togglePause(); broadcast(); } },
    { label: "Stop timer", click: () => { stopAll(); broadcast(); } },
    { type: "separator" },
    { label: "Show buddy", click: () => { if (!pet) createPet(); pet.showInactive(); } },
    { label: "Hide buddy", click: () => { if (pet) pet.hide(); hidePanel(); } },
    { label: "Quick check-in", click: () => openReflection({ kind: "checkin", minutes: 60, intent: "" }) },
    { label: "Open dashboard", click: openDashboard },
    { label: "Move buddy back to the corner", click: () => { S().petPos = null; save(); if (pet) { const wa = screen.getPrimaryDisplay().workArea; pet.setPosition(wa.x + wa.width - PET_W - 24, wa.y + wa.height - PET_H - 24); pet.showInactive(); } } },
    { type: "separator" },
    { label: "Quit Focus Buddy", role: "quit" },
  ]);
}

// ---------------------------------------------------------------- IPC
const handlers = {
  getState: () => publicState(),
  getReflections: () => data.reflections,
  getInsight: () => data.insight,
  startFocus: ({ intent, minutes } = {}) => startFocus(intent, minutes),
  startBreak: () => startBreak(false),
  togglePause, stopAll,
  finishEarly: () => T.mode === "focus" && finishFocus(true),
  skipBreak: () => { if (T.mode === "short" || T.mode === "long") { Object.assign(T, { mode: "idle", running: false, lastNudge: Date.now() }); petFace("idle"); persistTimer(); } },
  togglePanel, hidePanel, openDashboard,
  openUpdate,
  previewChime: (p) => {
    const o = typeof p === "string" ? { volume: p } : p || {};
    sendPet("chime", {
      kind: o.alarm ? "focus" : "nudge",
      volume: ["soft", "normal"].includes(o.volume) ? o.volume : S().volume === "normal" ? "normal" : "soft",
      alarm: ALARMS.includes(o.alarm) ? o.alarm : S().alarm,
      species: S().pet,
    });
  },
  dismissUpdate: () => { if (update) { data.updateDismissed = update.version; save(); } },
  openUpdatePage: () => update && openSafe(update.page),
  showPanel: (view) => showPanel(view),
  checkin: () => openReflection({ kind: "checkin", minutes: 60, intent: "" }),
  answer: (text) => handleAnswer(String(text || "")),
  rate: (r) => handleRating(r || {}),
  skipFollowUp: () => finishReflection(),
  skipReflection,
  closeReflection: () => { reflectSession = null; hidePanel(); },
  saveSettings: (patch = {}) => {
    const n = (v, lo, hi, d) => Math.min(hi, Math.max(lo, Math.round(Number(v)) || d));
    const s = S();
    if ("focus" in patch) s.focus = n(patch.focus, 1, 180, s.focus);
    if ("short" in patch) s.short = n(patch.short, 1, 60, s.short);
    if ("long" in patch) s.long = n(patch.long, 1, 90, s.long);
    if ("every" in patch) s.every = n(patch.every, 2, 8, s.every);
    for (const k of ["autoBreak", "hourly", "notes", "followUp", "quietHours"]) if (k in patch) s[k] = !!patch[k];
    if ("volume" in patch && ["off", "soft", "normal"].includes(patch.volume)) s.volume = patch.volume;
    if ("alarm" in patch && ALARMS.includes(patch.alarm)) s.alarm = patch.alarm;
    if ("quietFrom" in patch) s.quietFrom = n(patch.quietFrom, 0, 23, s.quietFrom);
    if ("quietTo" in patch) s.quietTo = n(patch.quietTo, 0, 23, s.quietTo);
    if ("openAtLogin" in patch) {
      s.openAtLogin = !!patch.openAtLogin;
      try { app.setLoginItemSettings({ openAtLogin: s.openAtLogin }); } catch {}
    }
    if ("apiKey" in patch) setApiKey(patch.apiKey);
    if ("pet" in patch && SPECIES[patch.pet]) s.pet = patch.pet;
    if ("petColor" in patch && COLORS.includes(patch.petColor)) s.petColor = patch.petColor;
    if ("petName" in patch) s.petName = String(patch.petName || "").trim().slice(0, 24);
    save();
  },
  deleteReflection: (id) => { data.reflections = data.reflections.filter((r) => r.id !== id); save(); },
  askInsight: async () => {
    const key = getApiKey();
    if (!key) throw new Error("no_key");
    const text = await ai.insight(key, persona(), data.reflections.slice(-60).map((r) => ({
      when: new Date(r.at).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
      kind: r.kind, minutes: r.minutes, intent: r.intent, focus_1to5: r.focus || null, energy_1to5: r.energy || null,
      conversation: r.conversation.map((m) => `${m.from === "pip" ? "Buddy" : "Me"}: ${m.text}`).join("\n"),
    })));
    data.insight = { at: Date.now(), text };
    save();
    return data.insight;
  },
  // dragging Pip around
  dragStart: () => { dragOrigin = pet ? pet.getPosition() : null; if (panel && panel.isVisible()) panel.hide(); },
  dragMove: ({ dx, dy }) => { if (pet && dragOrigin) pet.setPosition(Math.round(dragOrigin[0] + dx), Math.round(dragOrigin[1] + dy)); },
  dragEnd: () => { dragOrigin = null; if (pet) { const [x, y] = pet.getPosition(); S().petPos = { x, y }; save(); } },
  setClickThrough: (ignore) => { if (pet) pet.setIgnoreMouseEvents(!!ignore, { forward: true }); },
  petMenu: () => buildTrayMenu().popup({ window: pet }),
};
let dragOrigin = null;
const RENDERER_DIR = "file://" + path.join(__dirname, "renderer") + "/";
ipcMain.handle("act", async (e, name, payload) => {
  const from = e.senderFrame && e.senderFrame.url;
  if (!from || !decodeURI(from).startsWith(RENDERER_DIR)) throw new Error("not allowed");
  if (typeof name !== "string" || !Object.hasOwn(handlers, name)) throw new Error("unknown action");
  const fn = handlers[name];
  const out = await fn(payload);
  broadcast();
  return out;
});

// ---------------------------------------------------------------- lock down every window
app.on("web-contents-created", (_e, wc) => {
  wc.on("will-navigate", (ev) => ev.preventDefault());
  wc.on("will-redirect", (ev) => ev.preventDefault());
  wc.on("will-attach-webview", (ev) => ev.preventDefault());
  wc.setWindowOpenHandler(() => ({ action: "deny" }));
});
app.on("ready", () => {
  // refuse camera, microphone, location and every other permission request
  require("electron").session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
});

// ---------------------------------------------------------------- boot
app.whenReady().then(() => {
  load();
  if (data.timer) {
    T = { ...T, ...data.timer };
    if (T.running && T.endAt <= Date.now()) {
      // finished while Pip was closed
      if (T.mode === "focus") { T.round += 1; setTimeout(() => openReflection({ kind: "focus", minutes: Math.round(T.total / 60000), intent: T.intent }), 1500); }
      Object.assign(T, { mode: "idle", running: false });
    }
    T.lastNudge = Date.now();
  }
  // reset round counter on a new day
  const lastAt = data.reflections.length ? data.reflections[data.reflections.length - 1].at : 0;
  if (lastAt && new Date(lastAt).toDateString() !== new Date().toDateString() && T.mode === "idle") T.round = 0;

  if (app.dock) app.dock.hide();
  const trayIcon = nativeImage.createFromPath(path.join(__dirname, "build", "tray.png"));
  tray = new Tray(trayIcon.isEmpty() ? nativeImage.createEmpty() : trayIcon);
  tray.setContextMenu(buildTrayMenu());
  createPet();
  createPanel();
  for (const ev of ["resume", "unlock-screen", "user-did-become-active"]) powerMonitor.on(ev, onBackAtComputer);
  setTimeout(checkForUpdate, DEV && process.env.FB_UPDATE_URL ? 800 : 8000);
  setInterval(checkForUpdate, 6 * 60 * 60 * 1000);
  setInterval(tick, 500);
  broadcast();
  if (DEV && process.env.FB_SNAP) require("./tools/snapflow")({ handlers, showPanel, openReflection, getPanel: () => panel, getPet: () => pet, getDash: () => dash, data, S });
});
app.on("second-instance", () => { if (pet) pet.showInactive(); });
app.on("window-all-closed", () => { /* keep running in the menu bar */ });
app.on("before-quit", () => { data.timer = T; try { fs.writeFileSync(DATA_FILE(), JSON.stringify(data, null, 2)); } catch {} });
