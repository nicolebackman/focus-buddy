// Dashboard: today's numbers, charts of how you work and feel, Buddy's review, and the journal.
const $ = (id) => document.getElementById(id);
const act = (n, p) => window.pip.act(n, p);
const DAY = 864e5;
const FOCUS = ["Scattered", "Wobbly", "Okay", "Good", "Deep"];
const ENERGY = ["Drained", "Low", "Steady", "Good", "Buzzing"];
let refl = [], state = null, insight = null;

const dayKey = (t) => new Date(t).toDateString();
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const hhmm = (t) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function header() {
  const h = new Date().getHours();
  const name = state ? Pets.nameFor(state.settings) : "Your buddy";
  $("greet").textContent = h < 12 ? "Good morning." : h < 18 ? "Good afternoon." : "Good evening.";
  $("reviewTitle").textContent = `${name}'s review`;
  $("privacyText").textContent = state && state.settings.hasKey
    ? `Saved on this Mac · answers go only to your ${state.settings.aiName || "AI"}`
    : "Your reflections stay on this Mac";
  const today = refl.filter((r) => dayKey(r.at) === dayKey(Date.now()));
  const mins = today.filter((r) => r.kind === "focus").reduce((a, r) => a + r.minutes, 0);
  $("summary").textContent = today.length
    ? `You've logged ${mins} focus minutes and ${today.length} reflection${today.length === 1 ? "" : "s"} today.`
    : `No reflections yet today. Start a round and ${name} will check in when it ends.`;
  $("say").textContent = today.length ? pickSay(mins) : "Ready when you are!";
}

function tiles() {
  const today = refl.filter((r) => dayKey(r.at) === dayKey(Date.now()));
  const week = refl.filter((r) => r.at >= startOfDay(Date.now()) - 6 * DAY);
  const f = today.filter((r) => r.kind === "focus");
  const fa = avg(today.map((r) => r.focus).filter(Boolean)), ea = avg(today.map((r) => r.energy).filter(Boolean));
  const weekMins = week.filter((r) => r.kind === "focus").reduce((a, r) => a + r.minutes, 0);
  const t = [
    [f.reduce((a, r) => a + r.minutes, 0), "focus minutes today", `${weekMins} this week`],
    [f.length, "rounds today", `${week.filter((r) => r.kind === "focus").length} this week`],
    [fa ? fa.toFixed(1) : "–", "avg focus today", fa ? FOCUS[Math.round(fa) - 1] : "out of 5"],
    [ea ? ea.toFixed(1) : "–", "avg energy today", ea ? ENERGY[Math.round(ea) - 1] : "out of 5"],
  ];
  $("tiles").innerHTML = t.map(([v, l, s]) => `<div class="tile"><b>${v}</b><span>${l}</span><small>${s}</small></div>`).join("");
}

// ---- charts (hand-drawn SVG, one scale per chart)
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
function weekChart() {
  const svg = $("weekChart"), W = 440, H = 200, L = 34, R = 10, T = 14, B = 26;
  const days = Array.from({ length: 7 }, (_, i) => startOfDay(Date.now()) - (6 - i) * DAY);
  const vals = days.map((d) => refl.filter((r) => r.kind === "focus" && r.at >= d && r.at < d + DAY).reduce((a, r) => a + r.minutes, 0));
  const max = Math.max(60, Math.ceil(Math.max(...vals) / 30) * 30);
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const step = (W - L - R) / 7, bw = step * 0.56;
  let out = "";
  for (let g = 0; g <= max; g += max / 3) out += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(g)}" y2="${y(g)}"/><text x="${L - 6}" y="${y(g) + 4}" text-anchor="end">${Math.round(g)}</text>`;
  vals.forEach((v, i) => {
    const x = L + step * i + (step - bw) / 2;
    const isToday = i === 6;
    out += `<rect x="${x}" y="${y(v)}" width="${bw}" height="${Math.max(0, y(0) - y(v))}" rx="6" fill="${css("--violet")}" opacity="${isToday ? 1 : 0.35}"/>`;
    if (v) out += `<text x="${x + bw / 2}" y="${y(v) - 5}" text-anchor="middle" style="fill:${css("--ink")};font-weight:700">${v}</text>`;
    out += `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${isToday ? "Today" : new Date(days[i]).toLocaleDateString([], { weekday: "short" })}</text>`;
  });
  svg.innerHTML = out;
}
function feelChart() {
  const svg = $("feelChart"), W = 440, H = 200, L = 26, R = 10, T = 12, B = 26;
  const days = Array.from({ length: 14 }, (_, i) => startOfDay(Date.now()) - (13 - i) * DAY);
  const series = (k) => days.map((d) => avg(refl.filter((r) => r.at >= d && r.at < d + DAY && r[k]).map((r) => r[k])));
  const x = (i) => L + ((W - L - R) * i) / 13;
  const y = (v) => T + (H - T - B) * (1 - (v - 1) / 4);
  let out = "";
  for (let g = 1; g <= 5; g++) out += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(g)}" y2="${y(g)}"/><text x="${L - 8}" y="${y(g) + 4}" text-anchor="end">${g}</text>`;
  [0, 6, 13].forEach((i) => (out += `<text x="${x(i)}" y="${H - 8}" text-anchor="${i === 0 ? "start" : i === 13 ? "end" : "middle"}">${i === 13 ? "Today" : new Date(days[i]).toLocaleDateString([], { month: "short", day: "numeric" })}</text>`));
  const any = [["focus", css("--violet")], ["energy", css("--pink")]].map(([k, color]) => {
    const s = series(k);
    const pts = s.map((v, i) => (v == null ? null : [x(i), y(v)])).filter(Boolean);
    if (pts.length > 1) out += `<polyline points="${pts.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    pts.forEach((p, i) => (out += `<circle cx="${p[0]}" cy="${p[1]}" r="${i === pts.length - 1 ? 4.5 : 3}" fill="${color}"/>`));
    return pts.length;
  }).some(Boolean);
  if (!any) out += `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" style="font-size:13px">Rate your rounds to see this fill in</text>`;
  svg.innerHTML = out;
}
function todChart() {
  const svg = $("todChart"), W = 440, H = 180, L = 26, R = 10, T = 12, B = 26;
  const since = Date.now() - 30 * DAY;
  const blocks = [["Morning", 5, 12], ["Midday", 12, 15], ["Afternoon", 15, 18], ["Evening", 18, 29]];
  const inBlock = (r, a, b) => { let h = new Date(r.at).getHours(); if (h < 5) h += 24; return h >= a && h < b; };
  const y = (v) => T + (H - T - B) * (1 - v / 5);
  const step = (W - L - R) / blocks.length, bw = step * 0.3;
  let out = "", any = false;
  for (let g = 0; g <= 5; g++) out += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(g)}" y2="${y(g)}"/><text x="${L - 8}" y="${y(g) + 4}" text-anchor="end">${g}</text>`;
  blocks.forEach(([label, a, b], i) => {
    const rs = refl.filter((r) => r.at >= since && inBlock(r, a, b));
    const fv = avg(rs.map((r) => r.focus).filter(Boolean)), ev = avg(rs.map((r) => r.energy).filter(Boolean));
    const cx = L + step * i + step / 2;
    [[fv, css("--violet"), cx - bw - 2], [ev, css("--pink"), cx + 2]].forEach(([v, c, x]) => {
      if (v == null) return;
      any = true;
      out += `<rect x="${x}" y="${y(v)}" width="${bw}" height="${y(0) - y(v)}" rx="4" fill="${c}"/><text x="${x + bw / 2}" y="${y(v) - 4}" text-anchor="middle" style="fill:${css("--ink")};font-weight:700">${v.toFixed(1)}</text>`;
    });
    out += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${label}</text>`;
  });
  if (!any) out += `<text x="${W / 2}" y="${H / 2 - 10}" text-anchor="middle" style="font-size:13px">Not enough ratings yet</text>`;
  svg.innerHTML = out;
}

// ---- Buddy's review: Claude's words if available, otherwise simple observations
function observations() {
  const r30 = refl.filter((r) => r.at >= Date.now() - 30 * DAY);
  if (r30.length < 3) return ["Finish a few focus rounds and answer your buddy's questions. Patterns show up after about three reflections."];
  const out = [];
  const byBlock = [["mornings", 5, 12], ["middays", 12, 15], ["afternoons", 15, 18], ["evenings", 18, 29]].map(([l, a, b]) => {
    const xs = r30.filter((r) => { let h = new Date(r.at).getHours(); if (h < 5) h += 24; return h >= a && h < b && r.focus; }).map((r) => r.focus);
    return [l, avg(xs), xs.length];
  }).filter(([, v, n]) => v != null && n >= 2).sort((a, b) => b[1] - a[1]);
  if (byBlock.length >= 2) out.push(`Your focus is strongest in the ${byBlock[0][0]} (${byBlock[0][1].toFixed(1)}/5) and lowest in the ${byBlock[byBlock.length - 1][0]} (${byBlock[byBlock.length - 1][1].toFixed(1)}/5). Try saving your hardest task for the ${byBlock[0][0]}.`);
  const days = new Set(r30.filter((r) => r.kind === "focus").map((r) => dayKey(r.at)));
  const rounds = r30.filter((r) => r.kind === "focus").length;
  if (days.size) out.push(`On days you use your buddy you do about ${(rounds / days.size).toFixed(1)} focus rounds.`);
  const lowE = r30.filter((r) => r.energy && r.energy <= 2).length, rated = r30.filter((r) => r.energy).length;
  if (rated >= 3) out.push(lowE / rated > 0.4 ? `Your energy was low in ${lowE} of ${rated} check-ins. Longer breaks, food or a short walk might help.` : `Your energy has mostly held up: low in only ${lowE} of ${rated} check-ins.`);
  return out;
}
function renderReview() {
  const box = $("review");
  if (insight && insight.text) {
    const labels = ["What's going well", "Patterns I noticed", "How you seem to be feeling", "Try this next"];
    const html = esc(insight.text).split("\n").map((line) => (labels.includes(line.trim()) ? `<span class="lab">${line.trim()}</span>` : line)).join("\n");
    box.innerHTML = `<div class="review-body">${html}</div><p class="sub" style="margin:6px 0 0">Written with ${(state && state.settings.aiName) || "your AI"} on ${new Date(insight.at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}</p>`;
  } else {
    box.innerHTML = `<ul class="obs">${observations().map((o) => `<li>${esc(o)}</li>`).join("")}</ul>`;
  }
  const hasKey = state && state.settings.hasKey;
  $("askBtn").hidden = !hasKey;
  $("askNote").textContent = hasKey ? "" : "Add your own AI key in Settings and your buddy can write a fuller review from your own words.";
}
$("askBtn").onclick = async () => {
  $("askBtn").disabled = true; $("askNote").textContent = "Reading your reflections…";
  try { insight = await act("askInsight"); $("askNote").textContent = ""; }
  catch { $("askNote").textContent = `Couldn't reach ${(state && state.settings.aiName) || "your AI"}. Check your key and internet connection, then try again.`; }
  $("askBtn").disabled = false;
  renderReview();
};

// ---- journal
function journal() {
  const box = $("journal");
  if (!refl.length) { box.innerHTML = `<div class="empty">Your reflections will collect here. After each focus round your buddy asks a question, and your answers show up in this journal.</div>`; return; }
  const groups = new Map();
  refl.slice().reverse().slice(0, 150).forEach((r) => { const k = dayKey(r.at); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
  box.innerHTML = "";
  groups.forEach((items, k) => {
    const d = document.createElement("div"); d.className = "day";
    const label = k === dayKey(Date.now()) ? "Today" : k === dayKey(Date.now() - DAY) ? "Yesterday" : new Date(items[0].at).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
    d.innerHTML = `<h3>${label}</h3>`;
    items.forEach((r) => {
      const e = document.createElement("div"); e.className = "entry";
      const meta = [`<span class="tag ${r.kind === "checkin" ? "checkin" : ""}">${r.kind === "checkin" ? "Check-in" : r.minutes + " min focus"}</span>`];
      if (r.intent) meta.push(`<span>${esc(r.intent)}</span>`);
      if (r.focus) meta.push(`<span>Focus: ${FOCUS[r.focus - 1]}</span>`);
      if (r.energy) meta.push(`<span>Energy: ${ENERGY[r.energy - 1]}</span>`);
      const qa = r.conversation.filter((m) => !/^(Thanks! Tap how|Saved!|Got it, saved)/.test(m.text))
        .map((m) => `<div class="${m.from === "pip" ? "q" : "a"}">${esc(m.text)}</div>`).join("");
      e.innerHTML = `<time>${hhmm(r.at)}</time><div><div class="meta">${meta.join("")}</div><div class="qa">${qa}</div></div><button class="del" title="Delete this reflection">Delete</button>`;
      e.querySelector(".del").onclick = async () => { await act("deleteReflection", r.id); load(); };
      d.appendChild(e);
    });
    box.appendChild(d);
  });
}

function pickSay(mins) { return mins >= 100 ? "Big focus day!" : mins >= 50 ? "Look at you go!" : "Nice start today!"; }
// Asterisks sit on a loose ring around the buddy — fixed positions, one of each brand color, not random confetti.
function placeSparkles() {
  const box = $("stagebox");
  if (box.querySelector(".ast")) return;
  [["#6C4CF1", 26, 8, 30], ["#F68BD3", 20, 86, 22], ["#CFEF55", 18, 4, 74], ["#EA3A1F", 24, 90, 70]].forEach(([c, size, x, y]) => {
    const el = document.createElement("div"); el.className = "ast";
    el.style.left = x + "%"; el.style.top = y + "%"; el.innerHTML = Pets.sparkleSVG(c, size);
    box.appendChild(el);
  });
}
$("startBtn").onclick = () => act("startFocus", {});
$("checkinBtn").onclick = () => act("checkin");

async function load() {
  [refl, state, insight] = await Promise.all([act("getReflections"), act("getState"), act("getInsight")]);
  renderPet($("heroPet"), state.settings); placeSparkles();
  header(); tiles(); weekChart(); feelChart(); todChart(); renderReview(); journal();
  $("startBtn").textContent = state.timer.mode === "idle" ? "Start focus" : state.timer.running ? "Pause timer" : "Resume timer";
}
let lastCount = -1;
window.pip.on("state", (s) => {
  state = s;
  setPetFace(faceForMode(s.timer.mode));
  document.body.classList.remove("mode-idle", "mode-focus", "mode-short", "mode-long"); document.body.classList.add("mode-" + s.timer.mode);
  renderPet($("heroPet"), s.settings);
  $("startBtn").textContent = s.timer.mode === "idle" ? "Start focus" : s.timer.running ? "Pause timer" : "Resume timer";
  $("startBtn").onclick = () => act(s.timer.mode === "idle" ? "startFocus" : "togglePause", {});
  // refresh when a reflection is saved
  if (s.reflect && s.reflect.stage === "done" && lastCount !== -2) { lastCount = -2; load(); }
  if (!s.reflect || s.reflect.stage !== "done") lastCount = -1;
});
window.addEventListener("focus", load);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", load);
load();
