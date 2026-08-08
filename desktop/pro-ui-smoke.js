"use strict";

const assert = require("assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { app, session } = require("electron");
const {
  closeLocalEngine,
  configureCommercialAdapter,
  createWindow,
  getCommercialHost,
  getMainWindow,
  registerIpcHandlers
} = require("./main");

function fakeAdapter() {
  const runs = new Map();
  return {
    async getLicenseState() {
      return {
        adapterVersion: 1,
        licenseType: "subscription",
        valid: true,
        status: "active",
        startsAt: "2026-08-01T00:00:00.000Z",
        expiresAt: "2027-08-01T00:00:00.000Z",
        remainingDays: 358,
        edition: "pro",
        features: ["folders.watched", "automation.scheduled", "projects.history"]
      };
    },
    async importLicense() {
      return this.getLicenseState();
    },
    async requestTrial() {
      return this.getLicenseState();
    },
    async checkAutomationConfig() {
      return { valid: true, localOnly: true, templateCount: 1, inputExtensions: [".xlsx"] };
    },
    async runAutomationOnce() {
      return { processed: 2, failed: 0, skipped: 0, aborted: false };
    },
    async startAutomationWatch() {
      const runId = crypto.randomUUID();
      runs.set(runId, { runId, mode: "watch", status: "running", startedAt: new Date().toISOString() });
      return runs.get(runId);
    },
    async stopAutomationWatch({ runId }) {
      const run = runs.get(runId);
      if (run) run.status = "stopped";
      return run;
    },
    async startAutomationSchedule() {
      const runId = crypto.randomUUID();
      runs.set(runId, { runId, mode: "schedule", status: "running", startedAt: new Date().toISOString() });
      return runs.get(runId);
    },
    async stopAutomationSchedule({ runId }) {
      const run = runs.get(runId);
      if (run) run.status = "stopped";
      return run;
    },
    async listAutomationRuns() {
      return [...runs.values()];
    },
    async getAutomationHistory() {
      return [{
        taskId: "private-task-id",
        status: "completed",
        recordedAt: "2026-08-08T00:00:00.000Z",
        counts: { outputs: 2, succeeded: 2, failed: 0 },
        customerPath: "/private/customer"
      }];
    },
    async shutdown() {
      runs.clear();
      return { stopped: 0 };
    }
  };
}

async function cleanup() {
  const window = getMainWindow();
  if (window && !window.isDestroyed()) window.destroy();
  await closeLocalEngine();
  await getCommercialHost().shutdown();
}

async function main() {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "docflow-pro-ui-smoke-"));
  app.setPath("userData", profile);
  app.disableHardwareAcceleration();
  await app.whenReady();
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  await configureCommercialAdapter(fakeAdapter());
  registerIpcHandlers();
  await createWindow();

  const registered = await getCommercialHost().registerAutomationConfig({
    schema: "docflow-pro-automation/v1",
    opaqueFixture: true
  });
  assert.equal(registered.ok, true);

  const result = await getMainWindow().webContents.executeJavaScript(`
    (async () => {
      const state = await window.docflowDesktop.getCommercialState();
      const once = await window.docflowDesktop.runAutomationOnce({ configToken: ${JSON.stringify(registered.configToken)} });
      const watch = await window.docflowDesktop.startAutomationWatch({ configToken: ${JSON.stringify(registered.configToken)} });
      const schedule = await window.docflowDesktop.startAutomationSchedule({
        configToken: ${JSON.stringify(registered.configToken)},
        everyMs: 60000,
        runImmediately: true
      });
      const running = await window.docflowDesktop.listAutomationRuns();
      const history = await window.docflowDesktop.getAutomationHistory({
        configToken: ${JSON.stringify(registered.configToken)},
        limit: 20
      });
      await window.docflowDesktop.stopAutomationWatch({ runToken: watch.watchToken });
      await window.docflowDesktop.stopAutomationSchedule({ runToken: schedule.scheduleToken });
      return { state, once, watch, schedule, running, history };
    })()
  `, true);

  assert.equal(result.state.license.edition, "pro");
  assert.equal(result.state.license.valid, true);
  assert.deepEqual(result.once.summary, { failed: 0, processed: 2, skipped: 0, aborted: false });
  assert.match(result.watch.watchToken, /^watch_[A-Za-z0-9_-]{32}$/);
  assert.match(result.schedule.scheduleToken, /^schedule_[A-Za-z0-9_-]{32}$/);
  assert.equal(result.running.runs.filter(run => run.status === "running").length, 2);
  assert.equal(JSON.stringify(result).includes("private-task-id"), false);
  assert.equal(JSON.stringify(result).includes("/private/customer"), false);
  assert.equal(result.history.runs[0].counts.outputs, 2);
  console.log("DocFlow Pro renderer bridge smoke test passed");
}

main()
  .then(async () => {
    await cleanup();
    app.exit(0);
  })
  .catch(async error => {
    console.error(error);
    await cleanup().catch(() => {});
    app.exit(1);
  });
