const { app, BrowserWindow, dialog, ipcMain, session, shell } = require("electron");
const crypto = require("crypto");
const fsConstants = require("fs").constants;
const fs = require("fs/promises");
const path = require("path");
const { createActivationLedger } = require("./activation-ledger");
const { createCommercialHost } = require("./commercial-host");
const { createLocalEngine } = require("./engine");
const { createProjectIo, safeProjectFilename } = require("./project-io");
const {
  buildProjectRecipe,
  readProjectRecipeFile,
  safeRecipeFilename,
  writeProjectRecipeFile
} = require("./project-recipe");

const HTML_RENDER_TIMEOUT_MS = 60_000;
const DOCX_RENDER_TIMEOUT_MS = 90_000;
const MAX_HTML_BYTES = 32 * 1024 * 1024;
const MAX_DOCX_BYTES = 100 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 512 * 1024 * 1024;
const MAX_AUTOMATION_CONFIG_BYTES = 1024 * 1024;
const RENDER_PARTITION = `docflow-render-${process.pid}`;
const RENDER_DEBUG = process.env.DOCFLOW_RENDER_DEBUG === "1";
const DOCX_PREVIEW_ENTRY = require.resolve("docx-preview");
const docxPreviewRequire = require("module").createRequire(DOCX_PREVIEW_ENTRY);
const DOCX_PREVIEW_BUNDLE = path.join(path.dirname(DOCX_PREVIEW_ENTRY), "docx-preview.min.js");
const JSZIP_BUNDLE = docxPreviewRequire.resolve("jszip/dist/jszip.min.js");

function renderDebug(...values) {
  if (RENDER_DEBUG) console.log("[DocFlow render]", ...values);
}

let mainWindow = null;
let localEngine = null;
let isQuitting = false;
let ipcRegistered = false;
let renderSessionConfigured = false;
let recentOutputPath = null;
let projectIo = null;
let activationLedger = null;
let commercialHost = null;
let activeProject = null;
let bootstrapStarted = false;
let shutdownStarted = false;
let shutdownFinished = false;
const activeRenderWindows = new Set();
let docxRendererSourcesPromise = null;

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

async function writeFileAtomically(destination, data, mode = 0o600) {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const temporary = path.join(
    path.dirname(destination),
    `.${path.basename(destination)}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`
  );
  let handle;
  try {
    handle = await fs.open(temporary, "wx", mode);
    await handle.writeFile(data);
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(temporary, destination);
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await fs.unlink(temporary).catch(() => {});
    throw error;
  }
}

function isTrustedMainRenderer(event) {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents || !localEngine) return false;
  if (event.senderFrame && event.sender.mainFrame && event.senderFrame !== event.sender.mainFrame) return false;
  try {
    const expectedOrigin = new URL(localEngine.origin).origin;
    const candidateUrls = [
      event.senderFrame?.url,
      event.sender.getURL()
    ].filter(Boolean);
    return candidateUrls.some(candidate => new URL(candidate).origin === expectedOrigin);
  } catch (_error) {
    return false;
  }
}

function requireTrustedMainRenderer(event) {
  if (!isTrustedMainRenderer(event)) throw new Error("Untrusted renderer");
}

function normalizeZipPayload(payload) {
  const candidate = payload && typeof payload === "object" && !Buffer.isBuffer(payload)
    ? (payload.data ?? payload.bytes ?? payload.buffer)
    : payload;
  let bytes;
  if (Buffer.isBuffer(candidate)) {
    bytes = Buffer.from(candidate);
  } else if (candidate instanceof ArrayBuffer) {
    bytes = Buffer.from(candidate);
  } else if (ArrayBuffer.isView(candidate)) {
    bytes = Buffer.from(candidate.buffer, candidate.byteOffset, candidate.byteLength);
  } else {
    throw new Error("Output data must be an ArrayBuffer or Uint8Array");
  }
  if (bytes.length < 22 || bytes.length > MAX_OUTPUT_BYTES) throw new Error("Output ZIP size is invalid");
  const signature = bytes.subarray(0, 4).toString("hex");
  if (!["504b0304", "504b0506", "504b0708"].includes(signature)) throw new Error("Output is not a valid ZIP package");
  return Buffer.from(bytes);
}

function safeZipFilename(value) {
  const cleaned = path.basename(String(value || "DocFlow-Package.zip"))
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[ .]+|[ .]+$/g, "")
    .slice(0, 160);
  const base = cleaned || "DocFlow-Package.zip";
  return base.toLowerCase().endsWith(".zip") ? base : `${base}.zip`;
}

function getProjectIo() {
  if (!projectIo) projectIo = createProjectIo({ userDataDir: app.getPath("userData") });
  return projectIo;
}

function getActivationLedger() {
  if (!activationLedger) {
    activationLedger = createActivationLedger({ userDataDir: app.getPath("userData") });
  }
  return activationLedger;
}

function getCommercialHost() {
  if (!commercialHost) {
    commercialHost = createCommercialHost({
      activationSummaryProvider: () => getActivationLedger().getSummary()
    });
  }
  return commercialHost;
}

function commercialResultOrThrow(result) {
  if (result && result.ok === true) return result;
  const error = new Error(
    typeof result?.message === "string"
      ? result.message
      : "The commercial operation could not be completed."
  );
  if (typeof result?.code === "string") error.code = result.code;
  throw error;
}

async function readAutomationConfigFile(filePath) {
  let handle;
  try {
    const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0);
    handle = await fs.open(filePath, flags);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 2 || stat.size > MAX_AUTOMATION_CONFIG_BYTES) {
      throw new Error("invalid config file");
    }
    const bytes = await handle.readFile();
    if (bytes.length !== stat.size || bytes.includes(0)) throw new Error("invalid config bytes");
    const config = JSON.parse(bytes.toString("utf8"));
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      throw new Error("invalid config object");
    }
    return config;
  } catch (_error) {
    throw new Error("The automation configuration could not be read.");
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function configureCommercialAdapter(adapter) {
  return commercialResultOrThrow(await getCommercialHost().setAdapter(adapter));
}

function validProjectToken(value) {
  return typeof value === "string" && /^project_[a-f0-9]{48}$/.test(value);
}

function newProjectToken() {
  return `project_${crypto.randomBytes(24).toString("hex")}`;
}

function publicActiveProject(manifest, filePath, token, recent = null, recentIndexSaved = true) {
  return {
    cancelled: false,
    projectToken: token,
    filename: path.basename(filePath),
    manifest,
    recent,
    recentIndexSaved
  };
}

async function rememberProjectWithoutBreakingPrimaryAction(filePath, manifest) {
  try {
    return {
      recent: await getProjectIo().rememberProject(filePath, manifest),
      recentIndexSaved: true
    };
  } catch (error) {
    console.error("DocFlow recent-project index error:", error);
    return { recent: null, recentIndexSaved: false };
  }
}

async function openProjectAt(filePath) {
  if (!localEngine) throw new Error("Local engine is unavailable");
  const parsed = await getProjectIo().readProjectFile(filePath);
  // replaceTemplates validates every embedded template before clearing the
  // active in-memory registry, so a damaged project cannot partially load.
  const templates = await localEngine.replaceTemplates(parsed.templates);
  const token = newProjectToken();
  activeProject = {
    filePath: path.resolve(filePath),
    projectId: parsed.manifest.project.id,
    token
  };
  const recentResult = await rememberProjectWithoutBreakingPrimaryAction(
    activeProject.filePath,
    parsed.manifest
  );
  return {
    ...publicActiveProject(
      parsed.manifest,
      activeProject.filePath,
      token,
      recentResult.recent,
      recentResult.recentIndexSaved
    ),
    templates
  };
}

async function saveProjectFromRenderer(payload, forceSaveAs = false) {
  if (!localEngine) throw new Error("Local engine is unavailable");
  const archive = getProjectIo().createArchive(payload, references => (
    localEngine.exportTemplates(references)
  ));
  const requestedToken = payload?.projectToken;
  let destination = null;

  if (
    !forceSaveAs
    && activeProject
    && validProjectToken(requestedToken)
    && requestedToken === activeProject.token
  ) {
    if (archive.manifest.project.id !== activeProject.projectId) {
      throw new Error("Project identity changed; use Save As to create a new project file");
    }
    destination = activeProject.filePath;
  } else {
    const preferences = await readPreferences();
    const title = preferences.locale === "en" ? "Save DocFlow project" : "保存 DocFlow 项目";
    const suggestedName = safeProjectFilename(
      payload?.suggestedName || archive.manifest.project.name,
      preferences.locale === "en" ? "DocFlow-Project.docflow" : "DocFlow-项目.docflow"
    );
    const defaultDirectory = forceSaveAs && activeProject
      ? path.dirname(activeProject.filePath)
      : app.getPath("documents");
    const result = await dialog.showSaveDialog(mainWindow, {
      title,
      defaultPath: path.join(defaultDirectory, suggestedName),
      filters: [{ name: "DocFlow Project", extensions: ["docflow"] }],
      properties: ["createDirectory", "showOverwriteConfirmation"]
    });
    if (result.canceled || !result.filePath) return { cancelled: true };
    destination = result.filePath;
  }

  const saved = await getProjectIo().writeProjectFile(destination, archive.buffer);
  const token = newProjectToken();
  activeProject = {
    filePath: saved.filePath,
    projectId: saved.manifest.project.id,
    token
  };
  const recentResult = await rememberProjectWithoutBreakingPrimaryAction(
    saved.filePath,
    saved.manifest
  );
  return publicActiveProject(
    saved.manifest,
    saved.filePath,
    token,
    recentResult.recent,
    recentResult.recentIndexSaved
  );
}

function registerIpcHandlers() {
  if (ipcRegistered) return;
  ipcRegistered = true;

  ipcMain.handle("docflow:get-locale", async event => {
    requireTrustedMainRenderer(event);
    const preferences = await readPreferences();
    return ["zh-CN", "en"].includes(preferences.locale) ? preferences.locale : null;
  });

  ipcMain.handle("docflow:set-locale", async (event, locale) => {
    requireTrustedMainRenderer(event);
    if (!["zh-CN", "en"].includes(locale)) throw new Error("Unsupported locale");
    const preferences = await readPreferences();
    preferences.locale = locale;
    await writeFileAtomically(preferencesPath(), `${JSON.stringify(preferences, null, 2)}\n`);
    return locale;
  });

  ipcMain.handle("docflow:get-session-token", event => {
    requireTrustedMainRenderer(event);
    return localEngine.token;
  });

  ipcMain.handle("docflow:save-output", async (event, payload) => {
    requireTrustedMainRenderer(event);
    const bytes = normalizeZipPayload(payload);
    const suggestedName = safeZipFilename(payload?.suggestedName || payload?.filename);
    const preferences = await readPreferences();
    const title = preferences.locale === "en" ? "Save DocFlow delivery package" : "保存 DocFlow 交付包";
    const result = await dialog.showSaveDialog(mainWindow, {
      title,
      defaultPath: path.join(app.getPath("downloads"), suggestedName),
      filters: [{ name: "ZIP", extensions: ["zip"] }],
      properties: ["createDirectory", "showOverwriteConfirmation"]
    });
    if (result.canceled || !result.filePath) return { cancelled: true, path: null };
    await writeFileAtomically(result.filePath, bytes);
    recentOutputPath = result.filePath;
    return { cancelled: false, path: result.filePath };
  });

  ipcMain.handle("docflow:show-recent-output", async event => {
    requireTrustedMainRenderer(event);
    if (!recentOutputPath) return { shown: false, path: null };
    try {
      const stat = await fs.stat(recentOutputPath);
      if (!stat.isFile()) return { shown: false, path: null };
    } catch (_error) {
      recentOutputPath = null;
      return { shown: false, path: null };
    }
    shell.showItemInFolder(recentOutputPath);
    return { shown: true, path: recentOutputPath };
  });

  ipcMain.handle("docflow:save-project", async (event, payload) => {
    requireTrustedMainRenderer(event);
    return saveProjectFromRenderer(payload, false);
  });

  ipcMain.handle("docflow:save-project-as", async (event, payload) => {
    requireTrustedMainRenderer(event);
    return saveProjectFromRenderer(payload, true);
  });

  ipcMain.handle("docflow:open-project", async event => {
    requireTrustedMainRenderer(event);
    const preferences = await readPreferences();
    const title = preferences.locale === "en" ? "Open DocFlow project" : "打开 DocFlow 项目";
    const result = await dialog.showOpenDialog(mainWindow, {
      title,
      defaultPath: app.getPath("documents"),
      filters: [{ name: "DocFlow Project", extensions: ["docflow"] }],
      properties: ["openFile"]
    });
    if (result.canceled || result.filePaths.length !== 1) return { cancelled: true };
    return openProjectAt(result.filePaths[0]);
  });

  ipcMain.handle("docflow:open-recent-project", async (event, recentId) => {
    requireTrustedMainRenderer(event);
    if (typeof recentId !== "string" || !/^recent_[a-f0-9]{24}$/.test(recentId)) {
      throw new Error("Recent project identifier is invalid");
    }
    const filePath = await getProjectIo().resolveRecentProject(recentId);
    if (!filePath) return { cancelled: false, missing: true };
    return openProjectAt(filePath);
  });

  ipcMain.handle("docflow:get-recent-projects", async event => {
    requireTrustedMainRenderer(event);
    return getProjectIo().listRecentProjects();
  });

  ipcMain.handle("docflow:preview-project-recipe", async (event, payload) => {
    requireTrustedMainRenderer(event);
    return buildProjectRecipe(payload).recipe;
  });

  ipcMain.handle("docflow:export-project-recipe", async (event, payload) => {
    requireTrustedMainRenderer(event);
    const built = buildProjectRecipe(payload);
    const preferences = await readPreferences();
    const title = preferences.locale === "en" ? "Export safe project recipe" : "导出安全项目配方";
    const suggestedName = safeRecipeFilename(`DocFlow-${built.recipe.scenario}-Recipe.docflowrecipe`);
    const result = await dialog.showSaveDialog(mainWindow, {
      title,
      defaultPath: path.join(app.getPath("documents"), suggestedName),
      filters: [{ name: "DocFlow Recipe", extensions: ["docflowrecipe"] }],
      properties: ["createDirectory", "showOverwriteConfirmation"]
    });
    if (result.canceled || !result.filePath) return { cancelled: true };
    const saved = await writeProjectRecipeFile(result.filePath, built.buffer);
    return { cancelled: false, recipe: saved.recipe };
  });

  ipcMain.handle("docflow:import-project-recipe", async event => {
    requireTrustedMainRenderer(event);
    const preferences = await readPreferences();
    const title = preferences.locale === "en" ? "Import project recipe" : "导入项目配方";
    const result = await dialog.showOpenDialog(mainWindow, {
      title,
      defaultPath: app.getPath("documents"),
      filters: [{ name: "DocFlow Recipe", extensions: ["docflowrecipe"] }],
      properties: ["openFile"]
    });
    if (result.canceled || result.filePaths.length !== 1) return { cancelled: true };
    return {
      cancelled: false,
      recipe: await readProjectRecipeFile(result.filePaths[0])
    };
  });

  ipcMain.handle("docflow:activation-create-project", async (event, payload) => {
    requireTrustedMainRenderer(event);
    return getActivationLedger().createProject(payload);
  });

  ipcMain.handle("docflow:activation-begin-batch", async (event, payload) => {
    requireTrustedMainRenderer(event);
    return getActivationLedger().beginBatch(payload);
  });

  ipcMain.handle("docflow:activation-record-progress", async (event, payload) => {
    requireTrustedMainRenderer(event);
    return getActivationLedger().recordProgress(payload);
  });

  ipcMain.handle("docflow:activation-summary", async event => {
    requireTrustedMainRenderer(event);
    return getActivationLedger().getSummary();
  });

  ipcMain.handle("docflow:activation-export-summary", async event => {
    requireTrustedMainRenderer(event);
    const exported = await getActivationLedger().createExport();
    const preferences = await readPreferences();
    const title = preferences.locale === "en" ? "Export local activation summary" : "导出本地激活摘要";
    const date = exported.summary.updatedAt.slice(0, 10);
    const result = await dialog.showSaveDialog(mainWindow, {
      title,
      defaultPath: path.join(app.getPath("documents"), `DocFlow-Activation-Summary-${date}.json`),
      filters: [{ name: "JSON", extensions: ["json"] }],
      properties: ["createDirectory", "showOverwriteConfirmation"]
    });
    if (result.canceled || !result.filePath) return { cancelled: true };
    const destination = path.extname(result.filePath).toLowerCase() === ".json"
      ? result.filePath
      : `${result.filePath}.json`;
    await writeFileAtomically(destination, exported.buffer, 0o600);
    return { cancelled: false, summary: exported.summary };
  });

  ipcMain.handle("docflow:activation-clear", async event => {
    requireTrustedMainRenderer(event);
    return getActivationLedger().clear();
  });

  ipcMain.handle("docflow:commercial-state", async event => {
    requireTrustedMainRenderer(event);
    return commercialResultOrThrow(await getCommercialHost().getState());
  });

  ipcMain.handle("docflow:commercial-request-trial", async event => {
    requireTrustedMainRenderer(event);
    return commercialResultOrThrow(await getCommercialHost().requestTrial({}));
  });

  ipcMain.handle("docflow:commercial-import-license", async event => {
    requireTrustedMainRenderer(event);
    const preferences = await readPreferences();
    const title = preferences.locale === "en" ? "Import DocFlow Pro license" : "导入 DocFlow Pro 许可证";
    const result = await dialog.showOpenDialog(mainWindow, {
      title,
      defaultPath: app.getPath("documents"),
      filters: [{ name: "DocFlow License", extensions: ["json", "docflowlicense"] }],
      properties: ["openFile"]
    });
    if (result.canceled || result.filePaths.length !== 1) return { cancelled: true };
    const imported = commercialResultOrThrow(
      await getCommercialHost().importLicenseFromPath(result.filePaths[0])
    );
    return { ...imported, cancelled: false };
  });

  ipcMain.handle("docflow:commercial-select-config", async event => {
    requireTrustedMainRenderer(event);
    const preferences = await readPreferences();
    const title = preferences.locale === "en" ? "Select Pro automation configuration" : "选择 Pro 自动化配置";
    const result = await dialog.showOpenDialog(mainWindow, {
      title,
      defaultPath: app.getPath("documents"),
      filters: [{ name: "JSON", extensions: ["json"] }],
      properties: ["openFile"]
    });
    if (result.canceled || result.filePaths.length !== 1) return { cancelled: true };
    const config = await readAutomationConfigFile(result.filePaths[0]);
    const registered = commercialResultOrThrow(
      await getCommercialHost().registerAutomationConfig(config)
    );
    return { ...registered, cancelled: false };
  });

  ipcMain.handle("docflow:commercial-run-once", async (event, input) => {
    requireTrustedMainRenderer(event);
    return commercialResultOrThrow(await getCommercialHost().runOnce(input.configToken));
  });

  ipcMain.handle("docflow:commercial-start-watch", async (event, input) => {
    requireTrustedMainRenderer(event);
    return commercialResultOrThrow(await getCommercialHost().startWatch(input.configToken));
  });

  ipcMain.handle("docflow:commercial-stop-watch", async (event, input) => {
    requireTrustedMainRenderer(event);
    return commercialResultOrThrow(await getCommercialHost().stopWatch(input.watchToken));
  });

  ipcMain.handle("docflow:commercial-start-schedule", async (event, input) => {
    requireTrustedMainRenderer(event);
    return commercialResultOrThrow(await getCommercialHost().startSchedule(input));
  });

  ipcMain.handle("docflow:commercial-stop-schedule", async (event, input) => {
    requireTrustedMainRenderer(event);
    return commercialResultOrThrow(await getCommercialHost().stopSchedule(input.scheduleToken));
  });

  ipcMain.handle("docflow:commercial-list-runs", async event => {
    requireTrustedMainRenderer(event);
    return commercialResultOrThrow(await getCommercialHost().listRuns({}));
  });

  ipcMain.handle("docflow:commercial-history", async (event, input) => {
    requireTrustedMainRenderer(event);
    return commercialResultOrThrow(await getCommercialHost().getHistory(input));
  });
}

function configureRenderSession(renderSession) {
  if (renderSessionConfigured) return;
  renderSessionConfigured = true;
  renderSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  renderSession.setPermissionCheckHandler(() => false);
  renderSession.webRequest.onBeforeRequest(
    { urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] },
    (_details, callback) => callback({ cancel: true })
  );
}

function createRenderWindow() {
  renderDebug("creating hidden window");
  const renderSession = session.fromPartition(RENDER_PARTITION, { cache: false });
  configureRenderSession(renderSession);
  const renderWindow = new BrowserWindow({
    show: false,
    width: 900,
    height: 1273,
    backgroundColor: "#ffffff",
    webPreferences: {
      partition: RENDER_PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      backgroundThrottling: false,
      devTools: process.env.DOCFLOW_DEBUG === "1",
      spellcheck: false
    }
  });
  renderWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  renderWindow.webContents.on("will-navigate", event => event.preventDefault());
  renderWindow.webContents.on("will-attach-webview", event => event.preventDefault());
  activeRenderWindows.add(renderWindow);
  renderWindow.once("closed", () => activeRenderWindows.delete(renderWindow));
  renderWindow.webContents.on("did-start-loading", () => renderDebug("did-start-loading"));
  renderWindow.webContents.on("did-finish-load", () => renderDebug("did-finish-load", renderWindow.webContents.getURL().split(/[?#]/, 1)[0]));
  renderWindow.webContents.on("render-process-gone", (_event, details) => renderDebug("render-process-gone", details));
  renderDebug("hidden window created", renderWindow.id, "active", activeRenderWindows.size);
  return renderWindow;
}

function guardedRender(label, timeoutMs, operation) {
  renderDebug(label, "started");
  const renderWindow = createRenderWindow();
  let settled = false;
  let closing = false;
  let rejectFailure;
  const failure = new Promise((_resolve, reject) => {
    rejectFailure = reject;
  });
  const timeout = setTimeout(
    () => rejectFailure(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)} seconds`)),
    timeoutMs
  );

  const failLoad = (_event, code, description, validatedUrl, isMainFrame) => {
    renderDebug(label, "did-fail-load", code, description, validatedUrl, isMainFrame);
    if (isMainFrame === false) return;
    rejectFailure(new Error(`${label} page failed to load (${code}): ${description} (${validatedUrl || "unknown URL"})`));
  };
  const processGone = (_event, details) => {
    renderDebug(label, "process gone", details);
    rejectFailure(new Error(`${label} renderer exited unexpectedly: ${details.reason} (${details.exitCode})`));
  };
  const closed = () => {
    renderDebug(label, "window closed", { closing });
    if (!closing) rejectFailure(new Error(`${label} window closed before rendering finished`));
  };

  renderWindow.webContents.on("did-fail-load", failLoad);
  renderWindow.webContents.once("render-process-gone", processGone);
  renderWindow.once("closed", closed);

  const cleanup = () => {
    renderDebug(label, "cleanup");
    clearTimeout(timeout);
    renderWindow.webContents.removeListener("did-fail-load", failLoad);
    renderWindow.webContents.removeListener("render-process-gone", processGone);
    renderWindow.removeListener("closed", closed);
    closing = true;
    if (!renderWindow.isDestroyed()) {
      renderWindow.destroy();
    } else {
      activeRenderWindows.delete(renderWindow);
    }
  };

  return Promise.race([Promise.resolve().then(() => operation(renderWindow)), failure])
    .then(result => {
      renderDebug(label, "operation complete");
      settled = true;
      return result;
    })
    .finally(() => {
      if (!settled) settled = true;
      cleanup();
    });
}

async function waitForDocumentResources(renderWindow) {
  await renderWindow.webContents.executeJavaScript(`
    (async () => {
      const timeout = delay => new Promise(resolve => setTimeout(resolve, delay));
      if (document.fonts && document.fonts.ready) {
        await Promise.race([document.fonts.ready, timeout(15000)]);
      }
      const images = Array.from(document.images);
      await Promise.all(images.map(image => {
        if (image.complete) {
          if (image.naturalWidth === 0) throw new Error("A document image failed to load");
          return undefined;
        }
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("Timed out waiting for a document image")), 15000);
          image.addEventListener("load", () => { clearTimeout(timer); resolve(); }, { once: true });
          image.addEventListener("error", () => { clearTimeout(timer); reject(new Error("A document image failed to load")); }, { once: true });
        });
      }));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { images: images.length };
    })()
  `, true);
}

function assertPdfBuffer(value, label) {
  const pdf = Buffer.from(value || []);
  if (pdf.length < 1_000 || pdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error(`${label} did not produce a valid PDF`);
  }
  if (!pdf.subarray(Math.max(0, pdf.length - 2_048)).includes(Buffer.from("%%EOF"))) {
    throw new Error(`${label} produced a truncated PDF`);
  }
  return pdf;
}

async function printWindowToPdf(renderWindow, label, overrides = {}) {
  await waitForDocumentResources(renderWindow);
  const pdf = await renderWindow.webContents.printToPDF({
    pageSize: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    ...overrides
  });
  return assertPdfBuffer(pdf, label);
}

async function renderHtmlToPdf(html) {
  if (typeof html !== "string") throw new Error("HTML renderer requires a string");
  if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) throw new Error("HTML document exceeds the 32 MB render limit");
  return guardedRender("HTML PDF render", HTML_RENDER_TIMEOUT_MS, async renderWindow => {
    renderDebug("HTML PDF render", "loading data URL", Buffer.byteLength(html, "utf8"));
    await renderWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    // Without an explicit title Chromium copies the complete data URL into
    // PDF metadata, including any customer fields embedded in the document.
    await renderWindow.webContents.executeJavaScript(
      `document.title = "DocFlow Local document"; document.title`,
      true
    );
    renderDebug("HTML PDF render", "data URL loaded");
    return printWindowToPdf(renderWindow, "HTML renderer");
  });
}

function docxInputBuffer(input) {
  const candidate = input && typeof input === "object" && !Buffer.isBuffer(input) && !(input instanceof Uint8Array)
    ? (input.docxBuffer ?? input.buffer ?? input.data)
    : input;
  let buffer;
  if (Buffer.isBuffer(candidate)) {
    buffer = Buffer.from(candidate);
  } else if (candidate instanceof ArrayBuffer) {
    buffer = Buffer.from(candidate);
  } else if (ArrayBuffer.isView(candidate)) {
    buffer = Buffer.from(candidate.buffer, candidate.byteOffset, candidate.byteLength);
  } else {
    throw new Error("DOCX renderer requires a Buffer, ArrayBuffer, or Uint8Array");
  }
  if (!buffer.length || buffer.length > MAX_DOCX_BYTES) throw new Error("DOCX size is outside the supported range");
  if (buffer.subarray(0, 2).toString("ascii") !== "PK") throw new Error("DOCX is not a ZIP-based Office document");
  return Buffer.from(buffer);
}

async function loadDocxRendererLibraries(renderWindow) {
  if (!docxRendererSourcesPromise) {
    docxRendererSourcesPromise = Promise.all([
      fs.readFile(JSZIP_BUNDLE, "utf8"),
      fs.readFile(DOCX_PREVIEW_BUNDLE, "utf8")
    ]);
  }
  const [jszipSource, docxPreviewSource] = await docxRendererSourcesPromise;
  await renderWindow.webContents.executeJavaScript(`${jszipSource}\nvoid 0;`, true);
  await renderWindow.webContents.executeJavaScript(`${docxPreviewSource}\nvoid 0;`, true);
}

function docxPrintOptions(result) {
  const widthPx = Number(result?.pageWidthPx);
  const heightPx = Number(result?.pageHeightPx);
  if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx) || widthPx < 96 || heightPx < 96 || widthPx > 19_200 || heightPx > 19_200) {
    throw new Error("DOCX renderer returned an invalid page size");
  }

  // Electron's printToPDF custom Size values are inches. Normalize to portrait
  // dimensions, then let Chromium rotate the sheet for landscape Word sections.
  const landscape = widthPx > heightPx;
  const shortEdge = Math.min(widthPx, heightPx);
  const longEdge = Math.max(widthPx, heightPx);
  return {
    landscape,
    pageSize: {
      width: Number((shortEdge / 96).toFixed(4)),
      height: Number((longEdge / 96).toFixed(4))
    },
    preferCSSPageSize: false
  };
}

async function renderDocxToPdf(input) {
  const docxBuffer = docxInputBuffer(input);
  const encoded = docxBuffer.toString("base64");
  return guardedRender("DOCX PDF render", DOCX_RENDER_TIMEOUT_MS, async renderWindow => {
    await renderWindow.loadFile(path.join(__dirname, "docx-render.html"));
    await loadDocxRendererLibraries(renderWindow);
    const result = await renderWindow.webContents.executeJavaScript(
      `window.docflowRenderDocx(${JSON.stringify(encoded)})`,
      true
    );
    if (!result || !Number.isInteger(result.pages) || result.pages < 1) {
      throw new Error("DOCX renderer did not create any pages");
    }
    return printWindowToPdf(renderWindow, "DOCX renderer", docxPrintOptions(result));
  });
}

async function createWindow() {
  if (!localEngine) {
    localEngine = await createLocalEngine({
      staticDir: path.join(__dirname, "..", "static"),
      renderHtmlToPdf,
      renderDocxToPdf,
      // Kept during the engine API migration so existing built-in templates remain usable.
      renderPdf: renderHtmlToPdf
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
      webSecurity: true,
      allowRunningInsecureContent: false,
      navigateOnDragDrop: false,
      safeDialogs: true,
      spellcheck: false,
      devTools: process.env.DOCFLOW_DEBUG === "1"
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") void shell.openExternal(parsed.href);
    } catch (_error) {
      // Invalid URLs are denied below.
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, destination) => {
    try {
      if (new URL(destination).origin === new URL(localEngine.origin).origin) return;
    } catch (_error) {
      // Invalid destinations are denied below.
    }
    event.preventDefault();
  });
  mainWindow.webContents.on("will-attach-webview", event => event.preventDefault());

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    if (process.env.DOCFLOW_DEBUG === "1") mainWindow.webContents.openDevTools({ mode: "detach" });
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(localEngine.origin);
}

function closeLocalEngine() {
  const engine = localEngine;
  localEngine = null;
  activeProject = null;
  if (!engine) return Promise.resolve();
  return new Promise(resolve => {
    try {
      engine.close(() => resolve());
    } catch (_error) {
      resolve();
    }
  });
}

function bootstrap() {
  if (bootstrapStarted) return;
  bootstrapStarted = true;
  const hasLock = app.requestSingleInstanceLock();
  if (!hasLock) {
    app.quit();
    return;
  }

  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    registerIpcHandlers();
    try {
      await getActivationLedger().getSummary();
    } catch (error) {
      // Usage milestones are non-authoritative and must never block document work.
      console.error("DocFlow activation ledger initialization error:", error);
    }
    await createWindow();

    app.on("activate", async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        try {
          await createWindow();
        } catch (error) {
          console.error(error);
          app.exit(1);
        }
      }
    });
  }).catch(error => {
    console.error(error);
    app.exit(1);
  });

  app.on("before-quit", event => {
    isQuitting = true;
    if (shutdownFinished) return;
    event.preventDefault();
    if (shutdownStarted) return;
    shutdownStarted = true;
    Promise.allSettled([
      closeLocalEngine(),
      getCommercialHost().shutdown()
    ]).finally(() => {
      shutdownFinished = true;
      app.quit();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
      return;
    }
    void closeLocalEngine();
  });

  process.on("uncaughtException", error => {
    console.error("DocFlow desktop error:", error);
    if (!isQuitting) app.exit(1);
  });
}

renderDebug("module identity", {
  filename: module.filename,
  parent: module.parent?.filename || null,
  main: require.main?.filename || null
});
// Electron's packaged bootstrap requires the configured main module, so
// `module.parent` is not reliably null inside app.asar. `app.isPackaged`
// identifies that real entry path while source tests can still require this
// module without starting the application.
if (process.env.DOCFLOW_DESKTOP_EXTERNAL_BOOTSTRAP !== "1" && (app.isPackaged || module.parent == null)) {
  if (process.argv.includes("--docflow-release-smoke")) {
    require("./release-smoke").main().catch(error => {
      console.error("DOCFLOW_PACKAGED_SMOKE_FAILED", error);
      app.exit(1);
    });
  } else {
    bootstrap();
  }
}

module.exports = {
  assertPdfBuffer,
  bootstrap,
  closeLocalEngine,
  configureCommercialAdapter,
  createWindow,
  getCommercialHost,
  getMainWindow: () => mainWindow,
  registerIpcHandlers,
  renderDocxToPdf,
  renderHtmlToPdf
};
