// Dev helper: render an HTML file offscreen and save a PNG.  electron tools/snap.js <html> <out.png> [w] [h]
const { app, BrowserWindow } = require("electron");
const path = require("path"); const fs = require("fs");
const [file, out, w = "1100", h = "700"] = process.argv.slice(2).filter((a) => !a.startsWith("-") && !a.endsWith("snap.js") && a !== ".");
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: +w, height: +h, show: false, transparent: !!process.env.SNAP_TRANSPARENT, backgroundColor: process.env.SNAP_TRANSPARENT ? "#00000000" : undefined, webPreferences: { offscreen: true } });
  await win.loadFile(path.resolve(file));
  await new Promise((r) => setTimeout(r, 600));
  const img = await win.webContents.capturePage();
  fs.writeFileSync(out, img.toPNG()); app.quit();
});
