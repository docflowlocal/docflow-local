"use strict";

const assert = require("assert/strict");
const Module = require("module");

function loadPreloadApi() {
  const originalLoad = Module._load;
  const calls = [];
  let api = null;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "electron") {
      return {
        contextBridge: {
          exposeInMainWorld(name, value) {
            assert.equal(name, "docflowDesktop");
            api = value;
          }
        },
        ipcRenderer: {
          invoke(...args) {
            calls.push(args);
            return Promise.resolve({ ok: true });
          }
        }
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  const preloadPath = require.resolve("./preload");
  delete require.cache[preloadPath];
  try {
    require(preloadPath);
  } finally {
    Module._load = originalLoad;
    delete require.cache[preloadPath];
  }
  return { api, calls };
}

async function main() {
  const { api, calls } = loadPreloadApi();
  const cfg = `cfg_${"A".repeat(32)}`;
  const watch = `watch_${"B".repeat(32)}`;
  const schedule = `schedule_${"C".repeat(32)}`;

  await api.getCommercialState();
  await api.requestProTrial();
  await api.importProLicense();
  await api.selectAutomationConfig();
  await api.runAutomationOnce({ configToken: cfg });
  await api.startAutomationWatch({ configToken: cfg });
  await api.stopAutomationWatch({ runToken: watch });
  await api.startAutomationSchedule({ configToken: cfg, everyMs: 60_000, runImmediately: true });
  await api.stopAutomationSchedule({ runToken: schedule });
  await api.listAutomationRuns();
  await api.getAutomationHistory({ configToken: cfg, limit: 20 });

  assert.deepEqual(calls, [
    ["docflow:commercial-state"],
    ["docflow:commercial-request-trial"],
    ["docflow:commercial-import-license"],
    ["docflow:commercial-select-config"],
    ["docflow:commercial-run-once", { configToken: cfg }],
    ["docflow:commercial-start-watch", { configToken: cfg }],
    ["docflow:commercial-stop-watch", { watchToken: watch }],
    ["docflow:commercial-start-schedule", { configToken: cfg, everyMs: 60_000, runImmediately: true }],
    ["docflow:commercial-stop-schedule", { scheduleToken: schedule }],
    ["docflow:commercial-list-runs"],
    ["docflow:commercial-history", { configToken: cfg, limit: 20 }]
  ]);

  assert.throws(
    () => api.runAutomationOnce({ configToken: cfg, customerPath: "/private/customer" }),
    /unsupported field/
  );
  assert.throws(
    () => api.stopAutomationWatch({ runToken: schedule }),
    /watch token is invalid/
  );
  assert.throws(
    () => api.startAutomationSchedule({ configToken: cfg, everyMs: 999 }),
    /interval is invalid/
  );
  assert.throws(
    () => api.getAutomationHistory({ configToken: `cfg_${"!".repeat(32)}` }),
    /configuration token is invalid/
  );

  assert.equal(Object.prototype.hasOwnProperty.call(api, "readAutomationConfig"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(api, "getLicensePath"), false);
  console.log("preload commercial API tests passed");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
