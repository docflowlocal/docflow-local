const { app, BrowserWindow, shell, session, ipcMain } = require("electron");
const fs = require("fs/promises");
const path = require("path");
const { createLocalEngine } = require("./engine");

let mainWindow = null;
let localEngine = null;
let isQuitting = false;

function preferencesPath() {
  return path.join(app.getPath("userData"), "preferences.json");
}

async function readPreferences() {
  try {
    return JSON.parse(await fs.readFile(preferencesPath(), "utf8"));
  } catch (_error) {
    return {};
  }
}

ipcMain.handle("docflow:get-locale", async () => {
  const preferences = await readPreferences();
  return ["zh-CN", "en"].includes(preferences.locale) ? preferences.locale : null;
});

ipcMain.handle("docflow:set-locale", async (_event, locale) => {
  if (!["zh-CN", "en"].includes(locale)) throw new Error("Unsupported locale");
  const preferences = await readPreferences();
  preferences.locale = locale;
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  const destination = preferencesPath();
  const temporary = `${destination}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(preferences, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temporary, destination);
  return locale;
});

function printHtmlToPdf(html) {
  return new Promise((resolve, reject) => {
    const printWindow = new BrowserWindow({
      show: false,
      width: 794,
      height: 1123,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    const cleanup = () => {
      if (!printWindow.isDestroyed()) printWindow.destroy();
    };

    printWindow.webContents.once("did-fail-load", (_event, code, description) => {
      cleanup();
      reject(new Error(`PDF 页面加载失败 (${code})：${description}`));
    });

    printWindow.webContents.once("did-finish-load", async () => {
      try {
        const pdf = await printWindow.webContents.printToPDF({
          pageSize: "A4",
          printBackground: true,
          preferCSSPageSize: true,
          margins: { top: 0, bottom: 0, left: 0, right: 0 }
        });
        cleanup();
        resolve(pdf);
      } catch (error) {
        cleanup();
        reject(error);
      }
    });

    printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  });
}

async function createWindow() {
  if (!localEngine) {
    localEngine = await createLocalEngine({
      staticDir: path.join(__dirname, "..", "static"),
      renderPdf: printHtmlToPdf
    });
  }

  mainWindow = new BrowserWindow({
    title: "DocFlow Local",
    width: 1440,
    height: 930,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: "#F2F5F7",
    show: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 18, y: 18 },
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: process.env.DOCFLOW_DEBUG === "1"
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(localEngine.origin)) event.preventDefault();
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    if (process.env.DOCFLOW_DEBUG === "1") mainWindow.webContents.openDevTools({ mode: "detach" });
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(localEngine.origin);
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    await createWindow();

    app.on("activate", async () => {
      if (BrowserWindow.getAllWindows().length === 0) await createWindow();
    });
  }).catch(error => {
    console.error(error);
    app.quit();
  });
}

app.on("before-quit", () => {
  isQuitting = true;
  if (localEngine) localEngine.close();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

process.on("uncaughtException", error => {
  console.error("DocFlow desktop error:", error);
  if (isQuitting) return;
});
