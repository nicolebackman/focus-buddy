// Talking to the user's own AI: the buddy's follow-up questions and the dashboard insights.
// Only used when the user has added their own AI key in Settings. The kind of key decides where
// requests go: Claude (Anthropic), ChatGPT (OpenAI) or Gemini (Google). Nothing is sent anywhere else.
const Anthropic = require("@anthropic-ai/sdk").default;

const persona = (p) => `You are ${p.name}, a small, warm, gently playful cartoon ${p.species} who lives on the user's desktop as their focus and work-wellbeing buddy. ` +
  "You speak simply and kindly, like a supportive friend. Never lecture, never diagnose, no medical claims.";

const PROVIDERS = {
  claude:  { name: "Claude" },
  chatgpt: { name: "ChatGPT" },
  gemini:  { name: "Gemini" },
};
// Which AI a key belongs to, from its prefix. Returns null for a key we don't recognize.
function detectProvider(key) {
  key = String(key || "").trim();
  if (/^sk-ant-/.test(key)) return "claude";
  if (/^sk-/.test(key)) return "chatgpt";
  if (/^AIza/.test(key)) return "gemini";
  return null;
}

// For ChatGPT and Gemini, try each model in order and remember the first that works, so the app
// keeps working as the providers rename and retire models. The "latest" aliases follow their newest model.
const MODELS = {
  claude: ["claude-opus-5-5"],
  chatgpt: ["gpt-6.2-sol", "chat-latest"],
  gemini: ["gemini-flash-latest", "gemini-3.8-flash"],
};
const working = {};
const TIMEOUT = 60_000;

let cached = { key: "", client: null };
function claudeClient(key) {
  if (cached.key !== key) cached = { key, client: new Anthropic({ apiKey: key, timeout: TIMEOUT, maxRetries: 1 }) };
  return cached.client;
}

async function post(url, headers, body) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error((json.error && json.error.message) || `HTTP ${res.status}`); e.status = res.status; throw e; }
  return json;
}

const CALL = {
  async claude(key, model, { system, user, maxTokens, effort }) {
    const res = await claudeClient(key).beta.messages.create({
      model, max_tokens: maxTokens,
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      output_config: { effort },
      system, messages: [{ role: "user", content: user }],
    });
    if (res.stop_reason === "refusal") return null;
    return res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  },
  async chatgpt(key, model, { system, user, maxTokens }) {
    const res = await post("https://api.openai.com/v1/chat/completions", { Authorization: `Bearer ${key}` }, {
      model, max_completion_tokens: maxTokens,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    });
    return (res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content) || "";
  },
  async gemini(key, model, { system, user, maxTokens }) {
    const res = await post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { "x-goog-api-key": key }, {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    });
    const c = res.candidates && res.candidates[0];
    return ((c && c.content && c.content.parts) || []).map((p) => p.text || "").join("");
  },
};

async function ask(key, opts) {
  const provider = detectProvider(key);
  if (!provider) throw new Error("unknown_key");
  const models = working[provider] ? [working[provider]] : MODELS[provider];
  let lastErr;
  for (const model of models) {
    try {
      const text = await CALL[provider](key, model, opts);
      working[provider] = model;
      return (text || "").trim() || null;
    } catch (e) {
      lastErr = e;
      if (e.status !== 404 && e.status !== 400) throw e; // only a missing model is worth trying the next one
    }
  }
  throw lastErr;
}

// One short follow-up question after the user answers Pip's reflection question.
async function followUp(key, session, recent, who) {
  const convo = session.messages.map((m) => `${m.from === "pip" ? who.name : "User"}: ${m.text}`).join("\n");
  const user =
    `The user just finished a ${session.kind === "checkin" ? "hourly check-in" : `${session.minutes}-minute focus round`}` +
    (session.intent ? ` working on "${session.intent}"` : "") + ".\n" +
    `Self-ratings (1-5, 0 = skipped): focus ${session.focus}, energy ${session.energy}.\n\n` +
    `Conversation so far:\n${convo}\n\n` +
    `Their recent reflections, for context only:\n${JSON.stringify(recent)}\n\n` +
    "Ask exactly ONE short, curious follow-up question (max 25 words) that helps them reflect on how they work or how they feel while working. " +
    "You may start with a few words acknowledging what they said. Reply with only the message text.";
  return ask(key, { system: persona(who), user, maxTokens: 2000, effort: "low" });
}

// A look across many reflections: patterns in how they work and how they feel.
async function insight(key, who, reflections) {
  if (!reflections.length) return `${who.name} needs a few reflections first. Finish a focus round and answer the question.`;
  const user =
    "Here are the user's recent focus-round and check-in reflections as JSON (newest last). Each has their own words plus optional 1-5 focus and energy ratings.\n\n" +
    JSON.stringify(reflections) + "\n\n" +
    "Write a short, kind review for their dashboard in plain text with these four parts, each starting with its label on its own line:\n" +
    "What's going well\nPatterns I noticed\nHow you seem to be feeling\nTry this next\n" +
    "Under each label write 1-3 short sentences or '- ' bullets grounded in specifics from their data (times of day, tasks, things they said). " +
    "In 'Try this next' give 2-3 small, concrete experiments. Under 220 words total. No markdown headings or bold.";
  const text = await ask(key, { system: persona(who), user, maxTokens: 8000, effort: "medium" });
  return text || "Your buddy couldn't put together insights this time. Try again later.";
}

module.exports = { followUp, insight, detectProvider, PROVIDERS };
