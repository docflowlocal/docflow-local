const { contextBridge, ipcRenderer } = require("electron");

function transferableBytes(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw new TypeError("Output data must be an ArrayBuffer or typed array");
}

contextBridge.exposeInMainWorld("docflowDesktop", Object.freeze({
  isDesktop: true,
  platform: process.platform,
  versions: Object.freeze({
    electron: process.versions.electron,
    chrome: process.versions.chrome
  }),
  getLocale: () => ipcRenderer.invoke("docflow:get-locale"),
  setLocale: locale => ipcRenderer.invoke("docflow:set-locale", locale),
  getSessionToken: () => ipcRenderer.invoke("docflow:get-session-token"),
  saveOutput: (data, suggestedName) => ipcRenderer.invoke("docflow:save-output", {
    data: transferableBytes(data),
    suggestedName: String(suggestedName || "DocFlow-Package.zip")
  }),
  showRecentOutput: () => ipcRenderer.invoke("docflow:show-recent-output")
}));
