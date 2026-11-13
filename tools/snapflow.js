// Dev-only: drive the app through its screens and save screenshots. Run with FB_SNAP=<dir>.
const fs = require("fs"); const path = require("path");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
module.exports = async ({ handlers, showPanel, openReflection, getPanel, getPet, getDash }) => {
  const dir = process.env.FB_SNAP; fs.mkdirSync(dir, { recursive: true });
  const snap = async (win, name) => { const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(dir, name + ".png"), img.toPNG()); };
  const { app } = require("electron");
  try {
    if (process.env.FB_PET) handlers.saveSettings({ pet: process.env.FB_PET, petColor: process.env.FB_COLOR });
    await wait(1500);
    await snap(getPet(), "1-pet-idle");
    handlers.startFocus({ intent: "Draft the project brief", minutes: 25 });
    await wait(400); showPanel("home"); await wait(700);
    await snap(getPet(), "2-pet-focus"); await snap(getPanel(), "3-panel-focus");
    handlers.stopAll(); await wait(300);
    showPanel("settings"); await wait(700); await snap(getPanel(), "4-panel-settings");
    await getPanel().webContents.executeJavaScript("document.getElementById('settings').scrollTop = 420"); await wait(300); await snap(getPanel(), "4b-panel-settings-sound");
    openReflection({ kind: "focus", minutes: 25, intent: "Draft the project brief" }); await wait(500);
    await handlers.answer("Pretty good! Got the outline done but Slack kept pulling me away."); await wait(300);
    await handlers.rate({ focus: 3, energy: 4 }); await wait(800);
    await snap(getPanel(), "5-panel-chat");
    await handlers.answer("Maybe close Slack during focus rounds."); await wait(500);
    await snap(getPanel(), "6-panel-chat-done");
    handlers.closeReflection();
    handlers.openDashboard(); await wait(1800); await snap(getDash(), "7-dashboard");
  } catch (e) { console.error("SNAP FAILED", e); }
  app.exit(0);
};
