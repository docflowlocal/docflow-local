const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("docflowDesktop", Object.freeze({
  isDesktop: true,
  platform: process.platform,
  versions: Object.freeze({
    electron: process.versions.electron,
    chrome: process.versions.chrome
  }),
  getLocale: () => ipcRenderer.invoke("docflow:get-locale"),
  setLocale: locale => ipcRenderer.invoke("docflow:set-locale", locale)
}));
