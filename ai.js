// Talking to Claude: the buddy's follow-up questions and the dashboard insights.
// Only used when the user has added their own Anthropic API key in Settings.
const Anthropic = require("@anthropic-ai/sdk").default;

const MODEL = "claude-opus-5-5";
const persona = (p) => `You are ${p.name}, a small, warm, gently playful cartoon ${p.species} who lives on the user's desktop as their focus and work-wellbeing buddy. ` +
  "You speak simply and kindly, like a supportive friend. Never lecture, never diagnose, no medical claims.";

let cached = { key: "", client: null };
function client(key) {
  if (cached.key !== key) cached = { key, client: new Anthropic({ apiKey: key, timeout: 60_000, maxRetries: 1 }) };
  return cached.client;
}

async function ask(key, { system, user, maxTokens, effort }) {
  const res = await client(key).beta.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort },
    system,
    messages: [{ role: "user", content: user }],
  });
  if (res.stop_reason === "refusal") return null;
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  return text || null;
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

module.exports = { followUp, insight };
