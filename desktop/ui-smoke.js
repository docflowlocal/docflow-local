"use strict";

const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { app, session } = require("electron");
const {
  closeLocalEngine,
  createWindow,
  getMainWindow,
  registerIpcHandlers
} = require("./main");

const SCREENSHOT_PATH = process.env.DOCFLOW_UI_SCREENSHOT
  || path.join(os.tmpdir(), "docflow-local-ui-smoke.png");
const TEST_TIMEOUT_MS = 60_000;
const SIGNATURE_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function withTimeout(promise, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), TEST_TIMEOUT_MS);
    })
  ]).finally(() => clearTimeout(timer));
}

async function rendererCheck(window) {
  return window.webContents.executeJavaScript(`
    (async () => {
      const waitFor = async (predicate, label, timeout = 10000) => {
        const start = Date.now();
        while (!predicate()) {
          if (Date.now() - start > timeout) throw new Error(label + " timed out");
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      };
      const assert = (condition, message) => {
        if (!condition) throw new Error(message);
      };
      await waitFor(
        () => (
          document.readyState === "complete"
          && document.querySelectorAll(".template-card").length >= 2
          && document.querySelectorAll(".mapping-row").length >= 8
          && document.querySelectorAll(".rule-row").length >= 4
        ),
        "initial render"
      );

      const sidebar = document.querySelector(".sidebar");
      const readiness = document.querySelector(".readiness-card");
      assert(getComputedStyle(sidebar).position === "fixed", "Sidebar must remain fixed");
      assert(!["fixed", "sticky"].includes(getComputedStyle(readiness).position), "Readiness card must not overlay scrolled content");
      assert(Number.parseFloat(getComputedStyle(document.body).fontSize) >= 14, "Body text is smaller than the accepted baseline");
      assert(document.querySelectorAll(".mapping-row").length >= 8, "Field mapping rows did not render");
      assert(document.querySelectorAll(".rule-row").length >= 4, "Automation rules did not render");
      assert(document.querySelectorAll(".template-card .file-thumb.pdf").length >= 2, "Built-in output formats are mislabeled");
      assert(document.querySelector("#includeSourceDocx").disabled, "Source DOCX option must be disabled without a custom DOCX");
      assert(document.querySelector("#recentPackageCount").hidden, "Recent package badge must start empty");
      assert(document.querySelectorAll("#starterGrid .starter-card").length === 4, "Four industry starters must be available");
      document.querySelector("#starterModal").hidden = true;
      document.querySelector("#projectSwitch").click();
      await waitFor(() => !document.querySelector("#projectModal").hidden, "project workspace");
      assert(document.querySelector("#projectNameInput").value.trim(), "Project workspace has no project name");
      assert(document.querySelector("#projectModal").textContent.includes("不保存数据记录") || document.querySelector("#projectModal").textContent.includes("never data rows"), "Project privacy boundary is not visible");
      await waitFor(
        () => !document.querySelector("#localActivitySummary").textContent.includes("正在读取")
          && !document.querySelector("#localActivitySummary").textContent.includes("Reading"),
        "local activity summary"
      );
      document.querySelector("#recipeExport").click();
      await waitFor(() => !document.querySelector("#recipePreviewModal").hidden, "recipe privacy preview");
      assert(document.querySelector("#recipePreviewSummary").textContent.trim(), "Recipe preview has no structural summary");
      assert(document.querySelector("#recipePreviewModal").textContent.includes("不包含客户数据") || document.querySelector("#recipePreviewModal").textContent.includes("no customer data"), "Recipe privacy warning is missing");
      document.querySelector("#recipePreviewModal [data-close-recipe-preview]").click();
      await waitFor(() => document.querySelector("#recipePreviewModal").hidden, "close recipe preview");
      document.querySelector("#projectModal [data-close-project-modal]").click();
      await waitFor(() => document.querySelector("#projectModal").hidden, "close project workspace");
      document.querySelector("#openPro").click();
      await waitFor(() => !document.querySelector("#proModal").hidden, "Pro workbench");
      await waitFor(() => state.commercialState !== null, "commercial state");
      assert(
        document.querySelector("#proStartTrial").disabled,
        "Trial must not start before real activation: " + JSON.stringify({ commercial: state.commercialState, activation: state.activationSummary?.flags })
      );
      assert(document.querySelector("#proModal").textContent.includes("既有输出") || document.querySelector("#proModal").textContent.includes("existing output"), "Pro expiry must preserve Community projects and output");
      assert(document.querySelector("#proSelectConfig").disabled, "Automation controls must be gated without a verified Pro license");
      document.querySelector("#proModal [data-close-pro]").click();
      await waitFor(() => document.querySelector("#proModal").hidden, "close Pro workbench");

      const initialLanguage = document.documentElement.lang;
      document.querySelector("#languageToggle").click();
      await waitFor(() => document.documentElement.lang !== initialLanguage, "language switch");
      const switchedLanguage = document.documentElement.lang;
      assert(["zh-CN", "en"].includes(switchedLanguage), "Unsupported switched locale");
      assert(document.querySelector("#languageToggle").getAttribute("aria-label"), "Language control has no accessible label");
      if (document.documentElement.lang !== "en") {
        document.querySelector("#languageToggle").click();
        await waitFor(() => document.documentElement.lang === "en", "switch to English for error check");
      }
      const invalidTransfer = new DataTransfer();
      invalidTransfer.items.add(new File(["invalid"], "invalid.txt", { type: "text/plain" }));
      const dataInput = document.querySelector("#dataInput");
      dataInput.files = invalidTransfer.files;
      dataInput.dispatchEvent(new Event("change", { bubbles: true }));
      await waitFor(
        () => document.querySelector("#toastCopy").textContent.includes("Only JSON, CSV"),
        "English engine error localization"
      );

      document.querySelector("#addRule").click();
      await waitFor(() => !document.querySelector("#ruleModal").hidden, "rule editor");
      assert(document.querySelector("#ruleName") && document.querySelector("#ruleExpression"), "Rule editor fields are missing");
      document.querySelector("#ruleModal [data-close-rule-modal]").click();
      await waitFor(() => document.querySelector("#ruleModal").hidden, "close rule editor");

      const signatureBytes = Uint8Array.from(atob(${JSON.stringify(SIGNATURE_PNG)}), character => character.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(new File([signatureBytes], "signature.png", { type: "image/png" }));
      const signatureInput = document.querySelector("#signatureInput");
      signatureInput.files = transfer.files;
      signatureInput.dispatchEvent(new Event("change", { bubbles: true }));
      await waitFor(() => !document.querySelector("#signatureRemove").hidden, "signature upload");
      document.querySelector("#signatureRemove").click();
      assert(document.querySelector("#signatureRemove").hidden, "Signature remove action did not clear the asset");

      document.querySelector("#validateTop").click();
      await waitFor(() => !document.querySelector("#validationModal").hidden, "validation modal", 20000);
      assert(document.querySelector("#modalTitle").textContent.trim(), "Validation result has no title");
      document.querySelector("#validationModal [data-close-modal]").click();
      await waitFor(() => document.querySelector("#validationModal").hidden, "close validation modal");

      if (document.documentElement.lang !== "zh-CN") {
        document.querySelector("#languageToggle").click();
        await waitFor(() => document.documentElement.lang === "zh-CN", "restore Chinese locale");
      }
      document.querySelectorAll(".modal-backdrop").forEach(element => { element.hidden = true; });
      document.querySelector("#toast").classList.remove("show");
      window.scrollTo({ top: 0, behavior: "instant" });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return {
        locale: document.documentElement.lang,
        templates: document.querySelectorAll(".template-card").length,
        mappings: document.querySelectorAll(".mapping-row").length,
        rules: document.querySelectorAll(".rule-row").length,
        sidebarPosition: getComputedStyle(sidebar).position,
        readinessPosition: getComputedStyle(readiness).position,
        bodyFontSize: getComputedStyle(document.body).fontSize,
        signatureRemoval: document.querySelector("#signatureRemove").hidden,
        validation: true,
        recipePreview: true,
        proGating: true,
        languageSwitch: true
      };
    })()
  `, true);
}

async function cleanup(window) {
  if (window && !window.isDestroyed()) window.destroy();
  await closeLocalEngine();
}

async function main() {
  const profile = path.join(os.tmpdir(), `docflow-ui-smoke-${process.pid}`);
  await fs.mkdir(profile, { recursive: true });
  app.setPath("userData", profile);
  app.disableHardwareAcceleration();
  await app.whenReady();
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  registerIpcHandlers();
  await createWindow();
  const window = getMainWindow();
  if (!window) throw new Error("Main window was not created");

  try {
    const result = await withTimeout(rendererCheck(window), "Electron UI smoke test");
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("UI screenshot reload timed out")), 15_000);
      window.webContents.once("did-finish-load", () => {
        clearTimeout(timer);
        resolve();
      });
      window.webContents.reload();
    });
    await window.webContents.executeJavaScript(`
      new Promise((resolve, reject) => {
        const started = Date.now();
        const poll = () => {
          if (
            document.documentElement.lang === "zh-CN"
            && document.querySelectorAll(".mapping-row").length >= 8
            && document.querySelectorAll(".rule-row").length >= 4
          ) {
            document.querySelectorAll(".modal-backdrop").forEach(element => { element.hidden = true; });
            document.querySelector("#toast").classList.remove("show");
            window.scrollTo(0, 0);
            requestAnimationFrame(() => requestAnimationFrame(resolve));
            return;
          }
          if (Date.now() - started > 10000) {
            reject(new Error("Screenshot state did not settle"));
            return;
          }
          setTimeout(poll, 50);
        };
        poll();
      })
    `, true);
    await new Promise(resolve => setTimeout(resolve, 250));
    const screenshot = await window.webContents.capturePage();
    await fs.writeFile(SCREENSHOT_PATH, screenshot.toPNG());
    console.log("DocFlow Electron UI smoke test passed:", {
      ...result,
      screenshot: SCREENSHOT_PATH
    });
  } finally {
    await cleanup(window);
  }
}

main()
  .then(() => app.exit(0))
  .catch(async error => {
    console.error(error);
    await cleanup(getMainWindow()).catch(() => {});
    app.exit(1);
  });
