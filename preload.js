const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pip", {
  act: (name, payload) => ipcRenderer.invoke("act", name, payload),
  on: (channel, fn) => {
    if (!["state", "face", "say", "sayText", "chime", "event", "view"].includes(channel)) return;
    ipcRenderer.on(channel, (_e, payload) => fn(payload));
  },
});
