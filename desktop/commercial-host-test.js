"use strict";

const assert = require("assert");
const path = require("path");
const { test } = require("node:test");

const {
  MAX_CONFIGS,
  REQUIRED_ADAPTER_METHODS,
  createCommercialHost
} = require("./commercial-host");

function activeLicense(overrides = {}) {
  return {
    adapterVersion: 1,
    valid: true,
    status: "active",
    edition: "pro",
    licenseType: "trial",
    startsAt: "2026-08-01T00:00:00.000Z",
    expiresAt: "2026-08-22T00:00:00.000Z",
    remainingDays: 14,
    features: ["automation.scheduled", "folders.watched"],
    customerEmail: "private@example.test",
    licensePath: "/Users/customer/secret-license.json",
    ...overrides
  };
}

function createAdapter(overrides = {}) {
  const calls = [];
  let license = activeLicense();
  const adapter = {
    async getLicenseState() {
      calls.push(["getLicenseState"]);
      return license;
    },
    async importLicense(input) {
      calls.push(["importLicense", input]);
      license = activeLicense({ licenseType: "subscription", remainingDays: 300 });
      return license;
    },
    async requestTrial(input) {
      calls.push(["requestTrial", input]);
      license = activeLicense({ licenseType: "trial", remainingDays: 21 });
      return license;
    },
    async checkAutomationConfig(input) {
      calls.push(["checkAutomationConfig", input]);
      return {
        valid: true,
        localOnly: true,
        templateCount: 1,
        inputExtensions: [".csv"],
        requiredFeatures: ["folders.watched"],
        normalizedConfig: input.config
      };
    },
    async runAutomationOnce(input) {
      calls.push(["runAutomationOnce", input]);
      return {
        polls: 1,
        scanned: 3,
        processed: 3,
        failed: 0,
        aborted: false,
        outputPath: "/Customers/Acme/private",
        customerData: { name: "Acme" }
      };
    },
    async startAutomationWatch(input) {
      calls.push(["startAutomationWatch", input]);
      return { runId: "11111111-1111-4111-8111-111111111111", mode: "watch", status: "running", path: input.config.watchPath };
    },
    async stopAutomationWatch(input) {
      calls.push(["stopAutomationWatch", input]);
      return { stopped: true, path: "/Customers/Acme/private" };
    },
    async startAutomationSchedule(input) {
      calls.push(["startAutomationSchedule", input]);
      return { runId: "22222222-2222-4222-8222-222222222222", mode: "schedule", status: "running", path: input.config.outputPath };
    },
    async stopAutomationSchedule(input) {
      calls.push(["stopAutomationSchedule", input]);
      return { stopped: true };
    },
    async listAutomationRuns() {
      calls.push(["listAutomationRuns"]);
      return [{
        runId: "11111111-1111-4111-8111-111111111111",
        status: "running",
        mode: "watch",
        generated: 3,
        outputPath: "/Customers/Acme/private",
        customerName: "Acme"
      }];
    },
    async getAutomationHistory(input) {
      calls.push(["getAutomationHistory", input]);
      return [{ taskId: "secret-customer-task", status: "failed", recordedAt: "2026-08-07T00:00:00.000Z", counts: { failed: 1 }, errorPath: "/secret" }];
    },
    async shutdown() {
      calls.push(["shutdown"]);
      return { ok: true };
    },
    ...overrides
  };
  return {
    adapter,
    calls,
    setLicense(value) {
      license = value;
    }
  };
}

test("default host is a stable Community boundary without an Electron or Pro adapter", async () => {
  const host = createCommercialHost();
  const state = await host.getState();
  assert.deepStrictEqual(state, {
    ok: true,
    mode: "community",
    adapterReady: false,
    trialEligible: false,
    license: {
      adapterVersion: null,
      status: "community",
      valid: true,
      edition: "community",
      licenseType: "community",
      startsAt: null,
      expiresAt: null,
      remainingDays: null,
      features: []
    },
    registeredConfigCount: 0,
    activeWatchCount: 0,
    activeScheduleCount: 0
  });
  assert.strictEqual((await host.importLicenseFromPath("/tmp/license.json")).code, "PRO_UNAVAILABLE");
  assert.strictEqual((await host.requestTrial()).code, "PRO_UNAVAILABLE");
  assert.strictEqual((await host.registerAutomationConfig({ schema: "v1" })).code, "PRO_UNAVAILABLE");
  assert.strictEqual((await host.runOnce("cfg_not-a-token")).code, "CONFIG_UNKNOWN");
  assert.strictEqual((await host.listRuns()).code, "PRO_UNAVAILABLE");
  assert.strictEqual((await host.shutdown()).ok, true);
  assert.strictEqual((await host.getState()).mode, "community");
});

test("trial authorization is gated only by local real activation", async () => {
  let realActivated = false;
  const fixture = createAdapter();
  const host = createCommercialHost({
    activationSummaryProvider: async () => ({
      flags: { realActivated },
      privateProjects: [{ customerName: "must never escape" }]
    })
  });
  await host.setAdapter(fixture.adapter);
  const blocked = await host.requestTrial();
  assert.strictEqual(blocked.ok, false);
  assert.strictEqual(blocked.code, "ACTIVATION_REQUIRED");
  realActivated = true;
  const allowed = await host.requestTrial();
  assert.strictEqual(allowed.ok, true);
  assert.strictEqual(allowed.license.licenseType, "trial");
  assert.deepStrictEqual(fixture.calls.find(call => call[0] === "requestTrial"), ["requestTrial", { consent: true }]);
  assert.strictEqual(JSON.stringify(allowed).includes("customer"), false);
  assert.strictEqual((await host.requestTrial({ email: "private@example.test" })).code, "INPUT_INVALID");
});

test("adapter contract is exact and license import remains atomic inside the adapter", async () => {
  const host = createCommercialHost({ activationSummaryProvider: () => ({ flags: { realActivated: true } }) });
  assert.strictEqual((await host.setAdapter({ getLicenseState() {} })).code, "COMMERCIAL_ADAPTER_INVALID");

  const fixture = createAdapter({
    async importLicense(input) {
      fixture.calls.push(["importLicense", input]);
      const error = new Error(`Older license at ${input.sourcePath} must not replace the active license for customer Acme`);
      error.code = "LICENSE_ROLLBACK";
      throw error;
    }
  });
  assert.strictEqual((await host.setAdapter(fixture.adapter)).ok, true);
  assert.deepStrictEqual(
    REQUIRED_ADAPTER_METHODS.filter(method => typeof fixture.adapter[method] !== "function"),
    []
  );
  const before = await host.getState();
  assert.strictEqual(before.license.startsAt, "2026-08-01T00:00:00.000Z");
  assert.strictEqual(before.license.remainingDays, 14);
  assert.strictEqual(Object.hasOwn(before.license, "issuedAt"), false);
  assert.strictEqual(Object.hasOwn(before.license, "daysRemaining"), false);
  const sourcePath = path.resolve("/Users/customer/private/older-license.json");
  const imported = await host.importLicenseFromPath(sourcePath);
  const after = await host.getState();
  assert.deepStrictEqual(imported, {
    ok: false,
    code: "LICENSE_REJECTED",
    message: "The license was not accepted."
  });
  assert.deepStrictEqual(after.license, before.license);
  assert.strictEqual(JSON.stringify(imported).includes(sourcePath), false);
  assert.strictEqual(JSON.stringify(before).includes("private@example.test"), false);
  assert.deepStrictEqual(
    fixture.calls.find(call => call[0] === "importLicense")[1],
    { sourcePath }
  );
  assert.strictEqual((await host.importLicenseFromPath("relative-license.json")).code, "INPUT_INVALID");
});

test("opaque tokens isolate configurations and all public automation output is allowlisted", async () => {
  const fixture = createAdapter();
  const host = createCommercialHost();
  await host.setAdapter(fixture.adapter);
  const config = {
    schema: "docflow-pro-automation/v1",
    watchPath: "/Customers/Acme/incoming",
    outputPath: "/Customers/Acme/delivery",
    template: "/Customers/Acme/contract.docx",
    privateRecord: { customerName: "Acme", amount: 99123 }
  };
  const first = await host.registerAutomationConfig(config);
  const second = await host.registerAutomationConfig(config);
  assert.match(first.configToken, /^cfg_[A-Za-z0-9_-]{32}$/);
  assert.match(second.configToken, /^cfg_[A-Za-z0-9_-]{32}$/);
  assert.notStrictEqual(first.configToken, second.configToken);
  assert.strictEqual(JSON.stringify(first).includes("Customers"), false);
  assert.strictEqual(JSON.stringify(first).includes("privateRecord"), false);
  assert.deepStrictEqual(first.check, {
    valid: true,
    localOnly: true,
    templateCount: 1,
    inputExtensions: [".csv"],
    requiredFeatures: ["folders.watched"],
    issueCount: 0
  });
  assert.deepStrictEqual(
    fixture.calls.find(call => call[0] === "checkAutomationConfig")[1],
    { config }
  );

  const run = await host.runOnce(first.configToken);
  assert.deepStrictEqual(run, {
    ok: true,
    summary: { failed: 0, polls: 1, processed: 3, scanned: 3, aborted: false }
  });
  assert.deepStrictEqual(
    fixture.calls.find(call => call[0] === "runAutomationOnce")[1],
    { config }
  );
  const listed = await host.listRuns();
  const history = await host.getHistory({ configToken: first.configToken, limit: 10 });
  assert.match(history.runs[0].runToken, /^run_[A-Za-z0-9_-]{32}$/);
  assert.deepStrictEqual(
    fixture.calls.find(call => call[0] === "getAutomationHistory")[1],
    { config, limit: 10 }
  );
  for (const result of [run, listed, history]) {
    const serialized = JSON.stringify(result);
    assert.strictEqual(serialized.includes("/Customers"), false);
    assert.strictEqual(serialized.includes("customerName"), false);
    assert.strictEqual(serialized.includes("errorPath"), false);
    assert.strictEqual(serialized.includes("secret-customer-task"), false);
    assert.strictEqual(serialized.includes("Acme"), false);
  }
  assert.strictEqual((await host.runOnce("cfg_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).code, "CONFIG_UNKNOWN");
});

test("active automation can be stopped after the license expires", async () => {
  const fixture = createAdapter();
  const host = createCommercialHost();
  await host.setAdapter(fixture.adapter);
  const registered = await host.registerAutomationConfig({
    schema: "docflow-pro-automation/v1",
    watchPath: "/private/watch",
    outputPath: "/private/output"
  });
  const watch = await host.startWatch(registered.configToken);
  const schedule = await host.startSchedule({
    configToken: registered.configToken,
    everyMs: 60000,
    runImmediately: true
  });
  assert.match(watch.watchToken, /^watch_/);
  assert.match(schedule.scheduleToken, /^schedule_/);
  assert.strictEqual(JSON.stringify(watch).includes("private"), false);
  assert.deepStrictEqual(
    fixture.calls.find(call => call[0] === "startAutomationWatch")[1],
    { config: {
      schema: "docflow-pro-automation/v1",
      watchPath: "/private/watch",
      outputPath: "/private/output"
    } }
  );
  assert.deepStrictEqual(
    fixture.calls.find(call => call[0] === "startAutomationSchedule")[1],
    {
      config: {
        schema: "docflow-pro-automation/v1",
        watchPath: "/private/watch",
        outputPath: "/private/output"
      },
      everyMs: 60000,
      runImmediately: true
    }
  );
  const activeRuns = await host.listRuns();
  const publicWatch = activeRuns.runs.find(run => run.runToken === watch.watchToken);
  const publicSchedule = activeRuns.runs.find(run => run.runToken === schedule.scheduleToken);
  assert.deepStrictEqual({ trigger: publicWatch.trigger, status: publicWatch.status }, { trigger: "watch", status: "running" });
  assert.deepStrictEqual({ trigger: publicSchedule.trigger, status: publicSchedule.status }, { trigger: "schedule", status: "running" });
  assert.strictEqual(JSON.stringify(activeRuns).includes("11111111-1111-4111-8111-111111111111"), false);
  assert.strictEqual(JSON.stringify(activeRuns).includes("22222222-2222-4222-8222-222222222222"), false);

  fixture.setLicense(activeLicense({ status: "expired", valid: false, remainingDays: 0 }));
  assert.strictEqual((await host.getState()).license.status, "expired");
  assert.deepStrictEqual(await host.stopWatch(watch.watchToken), { ok: true, stopped: true });
  assert.deepStrictEqual(await host.stopSchedule(schedule.scheduleToken), { ok: true, stopped: true });
  assert.ok(fixture.calls.some(call => call[0] === "stopAutomationWatch"
    && call[1].runId === "11111111-1111-4111-8111-111111111111"));
  assert.ok(fixture.calls.some(call => call[0] === "stopAutomationSchedule"
    && call[1].runId === "22222222-2222-4222-8222-222222222222"));
});

test("input and adapter output limits fail closed without echoing data", async () => {
  const cycle = {};
  cycle.self = cycle;
  const fixture = createAdapter();
  const host = createCommercialHost();
  await host.setAdapter(fixture.adapter);
  assert.strictEqual((await host.registerAutomationConfig(cycle)).code, "INPUT_INVALID");
  assert.strictEqual((await host.registerAutomationConfig({ value: () => "secret" })).code, "INPUT_INVALID");
  assert.strictEqual((await host.registerAutomationConfig({ value: "x".repeat(300 * 1024) })).code, "INPUT_INVALID");
  assert.strictEqual((await host.getHistory({ configToken: "cfg_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", limit: 0 })).code, "CONFIG_UNKNOWN");
  assert.strictEqual((await host.listRuns({ config: "/private" })).code, "INPUT_INVALID");

  const boundedConfig = await host.registerAutomationConfig({ schema: "v1", bounded: true });
  assert.strictEqual((await host.startSchedule({ configToken: boundedConfig.configToken, everyMs: 999 })).code, "INPUT_INVALID");
  assert.strictEqual((await host.startSchedule({ configToken: boundedConfig.configToken, everyMs: 1000, runImmediately: "yes" })).code, "INPUT_INVALID");
  assert.strictEqual((await host.getHistory({ configToken: boundedConfig.configToken, limit: 0 })).code, "INPUT_INVALID");

  for (let index = 1; index < MAX_CONFIGS; index += 1) {
    const result = await host.registerAutomationConfig({ schema: "v1", index });
    assert.strictEqual(result.ok, true);
  }
  assert.strictEqual((await host.registerAutomationConfig({ schema: "v1", index: 33 })).code, "CONFIG_LIMIT_REACHED");

  const oversized = createAdapter({
    async listAutomationRuns() {
      return [{ id: "run_oversized", outputPath: `/${"secret".repeat(10000)}` }];
    }
  });
  const boundedHost = createCommercialHost();
  await boundedHost.setAdapter(oversized.adapter);
  assert.deepStrictEqual(await boundedHost.listRuns(), {
    ok: false,
    code: "ADAPTER_OUTPUT_LIMIT",
    message: "The commercial component response exceeded the supported limit."
  });

  const invalidOutput = createAdapter({
    async listAutomationRuns() {
      return { runs: [], leak() { return "/private"; } };
    }
  });
  const invalidHost = createCommercialHost();
  await invalidHost.setAdapter(invalidOutput.adapter);
  assert.strictEqual((await invalidHost.listRuns()).code, "ADAPTER_OUTPUT_INVALID");

  const throwingGetter = createAdapter({
    async listAutomationRuns() {
      const value = {};
      Object.defineProperty(value, "runs", {
        enumerable: true,
        get() {
          throw new Error("/private/customer-path");
        }
      });
      return value;
    }
  });
  const getterHost = createCommercialHost();
  await getterHost.setAdapter(throwingGetter.adapter);
  assert.strictEqual((await getterHost.listRuns()).code, "ADAPTER_OUTPUT_INVALID");
});

test("shutdown stops private handles, clears tokens, and is idempotent", async () => {
  const fixture = createAdapter();
  const host = createCommercialHost();
  await host.setAdapter(fixture.adapter);
  const registered = await host.registerAutomationConfig({
    schema: "docflow-pro-automation/v1",
    watchPath: "/private/watch",
    outputPath: "/private/output"
  });
  await host.startWatch(registered.configToken);
  await host.startSchedule({ configToken: registered.configToken, everyMs: 60000 });
  assert.deepStrictEqual(await host.shutdown(), { ok: true, stoppedWatches: 1, stoppedSchedules: 1 });
  assert.deepStrictEqual(await host.shutdown(), { ok: true, stoppedWatches: 0, stoppedSchedules: 0 });
  assert.strictEqual((await host.runOnce(registered.configToken)).code, "HOST_SHUTDOWN");
  assert.ok(fixture.calls.some(call => call[0] === "shutdown"));
});
