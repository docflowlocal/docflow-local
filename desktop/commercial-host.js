"use strict";

const crypto = require("crypto");
const path = require("path");

const MAX_CONFIGS = 32;
const INPUT_LIMITS = Object.freeze({
  maxBytes: 1024 * 1024,
  maxDepth: 12,
  maxNodes: 10000,
  maxArray: 2048,
  maxStringBytes: 256 * 1024
});
const OUTPUT_LIMITS = Object.freeze({
  maxBytes: 128 * 1024,
  maxDepth: 6,
  maxNodes: 2048,
  maxArray: 1000,
  maxStringBytes: 4096
});

const REQUIRED_ADAPTER_METHODS = Object.freeze([
  "getLicenseState",
  "importLicense",
  "requestTrial",
  "checkAutomationConfig",
  "runAutomationOnce",
  "startAutomationWatch",
  "stopAutomationWatch",
  "startAutomationSchedule",
  "stopAutomationSchedule",
  "listAutomationRuns",
  "getAutomationHistory",
  "shutdown"
]);

const PUBLIC_FEATURE_IDS = new Set([
  "approvals.workflow",
  "audit.records",
  "audit.reports",
  "automation.apiTrigger",
  "automation.retries",
  "automation.scheduled",
  "automation.unattendedApi",
  "connectors.commercial",
  "data.relational",
  "folders.watched",
  "licensing.centralized",
  "rules.advanced",
  "support.commercial",
  "templates.teamLibrary",
  "projects.history"
]);

const SAFE_ERROR_MESSAGES = Object.freeze({
  ACTIVATION_REQUIRED: "Complete a real local delivery package before requesting a Pro trial.",
  ADAPTER_BUSY: "Stop active commercial tasks before changing the commercial adapter.",
  ADAPTER_OUTPUT_INVALID: "The commercial component returned an unsupported response.",
  ADAPTER_OUTPUT_LIMIT: "The commercial component response exceeded the supported limit.",
  AUTOMATION_CONFIG_REJECTED: "The automation configuration was not accepted.",
  COMMERCIAL_ADAPTER_INVALID: "The commercial component is not compatible with this version.",
  COMMERCIAL_OPERATION_FAILED: "The commercial operation could not be completed.",
  CONFIG_LIMIT_REACHED: "The maximum number of automation configurations has been reached.",
  CONFIG_UNKNOWN: "The automation configuration is no longer available.",
  HOST_SHUTDOWN: "The commercial host has been shut down.",
  INPUT_INVALID: "The request is invalid.",
  LICENSE_REJECTED: "The license was not accepted.",
  PRO_UNAVAILABLE: "DocFlow Pro is not available in this installation.",
  SCHEDULE_LIMIT_REACHED: "The maximum number of active schedules has been reached.",
  SCHEDULE_UNKNOWN: "The schedule is no longer active.",
  TRIAL_ELIGIBLE: "This installation is eligible to request a Pro trial.",
  TRIAL_REQUEST_FAILED: "The Pro trial could not be started.",
  WATCH_LIMIT_REACHED: "The maximum number of active watched folders has been reached.",
  WATCH_UNKNOWN: "The watched-folder task is no longer active."
});

const LICENSE_FAILURE_CODES = new Set([
  "LICENSE_EXPIRED",
  "LICENSE_INVALID",
  "LICENSE_NOT_ACTIVE",
  "LICENSE_REVOKED",
  "LICENSE_ROLLBACK",
  "LICENSE_STALE",
  "PRO_LICENSE_INVALID",
  "feature_not_entitled",
  "license_invalid"
]);

function success(value = {}) {
  return Object.freeze({ ok: true, ...value });
}

function failure(code) {
  const safeCode = Object.hasOwn(SAFE_ERROR_MESSAGES, code)
    ? code
    : "COMMERCIAL_OPERATION_FAILED";
  return Object.freeze({
    ok: false,
    code: safeCode,
    message: SAFE_ERROR_MESSAGES[safeCode]
  });
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, allowedKeys) {
  if (!isPlainObject(value)) return false;
  const allowed = new Set(allowedKeys);
  return Reflect.ownKeys(value).every(key => typeof key === "string" && allowed.has(key));
}

function inspectJsonValue(value, limits) {
  const seen = new Set();
  let nodes = 0;
  let bytes = 0;

  function visit(current, depth) {
    nodes += 1;
    if (nodes > limits.maxNodes) return "limit";
    if (depth > limits.maxDepth) return "limit";

    if (current === null || typeof current === "boolean") {
      bytes += current === null ? 4 : (current ? 4 : 5);
      return bytes > limits.maxBytes ? "limit" : null;
    }
    if (typeof current === "number") {
      if (!Number.isFinite(current)) return "invalid";
      bytes += 24;
      return bytes > limits.maxBytes ? "limit" : null;
    }
    if (typeof current === "string") {
      const stringBytes = Buffer.byteLength(current, "utf8");
      if (stringBytes > limits.maxStringBytes) return "limit";
      bytes += stringBytes + 2;
      return bytes > limits.maxBytes ? "limit" : null;
    }
    if (typeof current !== "object") return "invalid";
    if (Buffer.isBuffer(current) || ArrayBuffer.isView(current) || current instanceof ArrayBuffer) {
      return "invalid";
    }
    if (seen.has(current)) return "invalid";
    seen.add(current);

    if (Array.isArray(current)) {
      if (current.length > limits.maxArray) return "limit";
      for (const item of current) {
        const result = visit(item, depth + 1);
        if (result) return result;
      }
      return null;
    }
    if (!isPlainObject(current)) return "invalid";
    for (const key of Reflect.ownKeys(current)) {
      if (typeof key !== "string") return "invalid";
      const keyBytes = Buffer.byteLength(key, "utf8");
      if (keyBytes > 256) return "limit";
      bytes += keyBytes;
      if (bytes > limits.maxBytes) return "limit";
      const result = visit(current[key], depth + 1);
      if (result) return result;
    }
    return null;
  }

  return visit(value, 0);
}

function cloneJsonInput(value) {
  try {
    const inspection = inspectJsonValue(value, INPUT_LIMITS);
    if (inspection) return null;
    return JSON.parse(JSON.stringify(value));
  } catch (_error) {
    return null;
  }
}

function cloneAdapterOutput(value) {
  try {
    const inspection = inspectJsonValue(value, OUTPUT_LIMITS);
    if (inspection) return { code: inspection === "limit" ? "ADAPTER_OUTPUT_LIMIT" : "ADAPTER_OUTPUT_INVALID" };
    const serialized = JSON.stringify(value);
    if (typeof serialized !== "string") return { code: "ADAPTER_OUTPUT_INVALID" };
    if (Buffer.byteLength(serialized, "utf8") > OUTPUT_LIMITS.maxBytes) {
      return { code: "ADAPTER_OUTPUT_LIMIT" };
    }
    return { value: JSON.parse(serialized) };
  } catch (_error) {
    return { code: "ADAPTER_OUTPUT_INVALID" };
  }
}

function opaqueToken(prefix) {
  return `${prefix}_${crypto.randomBytes(24).toString("base64url")}`;
}

function safeTimestamp(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function safeEnum(value, allowed, fallback) {
  return typeof value === "string" && allowed.has(value) ? value : fallback;
}

function safeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 1000000000 ? value : 0;
}

function safeFeatureList(value) {
  if (!Array.isArray(value)) return [];
  const features = [];
  for (const feature of value.slice(0, 128)) {
    if (typeof feature === "string" && PUBLIC_FEATURE_IDS.has(feature)) features.push(feature);
  }
  return [...new Set(features)].sort();
}

function unwrapLicense(value) {
  if (!isPlainObject(value)) return {};
  if (isPlainObject(value.license)) return value.license;
  if (isPlainObject(value.verification)) return value.verification;
  return value;
}

function publicLicenseState(value) {
  const source = unwrapLicense(value);
  const claims = isPlainObject(source.claims) ? source.claims : {};
  const status = safeEnum(
    source.status,
    new Set(["active", "community", "expired", "invalid", "missing", "revoked"]),
    source.ok === true || source.valid === true ? "active" : "missing"
  );
  const edition = safeEnum(
    source.edition ?? claims.edition,
    new Set(["community", "pro", "business"]),
    status === "active" ? "pro" : "community"
  );
  const licenseType = safeEnum(
    source.licenseType ?? claims.licenseType,
    new Set(["community", "trial", "subscription", "perpetual"]),
    status === "community" ? "community" : null
  );
  const features = safeFeatureList(source.features ?? claims.features);
  const startsAt = safeTimestamp(source.startsAt ?? source.issuedAt ?? claims.notBefore ?? claims.issuedAt);
  const expiresAt = safeTimestamp(source.expiresAt ?? claims.expiresAt);
  const remainingSource = source.remainingDays ?? source.daysRemaining;
  const remainingDays = Number.isSafeInteger(remainingSource)
    && remainingSource >= 0
    && remainingSource <= 36600
    ? remainingSource
    : null;
  return Object.freeze({
    adapterVersion: Number.isSafeInteger(source.adapterVersion) && source.adapterVersion > 0
      ? source.adapterVersion
      : null,
    status,
    valid: source.valid === true || (source.valid === undefined && status === "active"),
    edition,
    licenseType,
    startsAt,
    expiresAt,
    remainingDays,
    features: Object.freeze(features)
  });
}

function communityLicenseState() {
  return Object.freeze({
    adapterVersion: null,
    status: "community",
    valid: true,
    edition: "community",
    licenseType: "community",
    startsAt: null,
    expiresAt: null,
    remainingDays: null,
    features: Object.freeze([])
  });
}

function publicCounts(value) {
  if (!isPlainObject(value)) return Object.freeze({});
  const allowed = [
    "attempted", "completed", "duplicates", "failed", "generated", "inputFiles",
    "outputs", "polls", "processed", "requested", "retried", "retrying", "runs",
    "scanned", "skipped", "succeeded", "templates", "waiting", "warnings"
  ];
  const result = {};
  for (const key of allowed) {
    if (Object.hasOwn(value, key)) result[key] = safeCount(value[key]);
  }
  return Object.freeze(result);
}

function publicRun(value, tokenizeRunId = () => null, tokenOverride = null, triggerOverride = null) {
  if (!isPlainObject(value)) return null;
  const runIdSource = value.runId ?? value.id ?? value.taskId;
  const runToken = tokenOverride || ((typeof runIdSource === "string" || typeof runIdSource === "number")
    ? tokenizeRunId(String(runIdSource))
    : null);
  const status = safeEnum(
    value.status,
    new Set(["queued", "running", "stopping", "stopped", "succeeded", "failed", "blocked", "cancelled", "completed"]),
    "completed"
  );
  const trigger = triggerOverride || safeEnum(
    value.trigger ?? value.mode,
    new Set(["manual", "watch", "schedule", "api"]),
    "manual"
  );
  const counts = publicCounts(value.counts ?? value.summary ?? value);
  return Object.freeze({
    runToken,
    status,
    trigger,
    startedAt: safeTimestamp(value.startedAt),
    finishedAt: safeTimestamp(value.finishedAt ?? value.completedAt ?? value.recordedAt),
    blocked: value.blocked === true,
    counts
  });
}

function extractRuns(value, tokenizeRunId) {
  const source = Array.isArray(value)
    ? value
    : (isPlainObject(value) && Array.isArray(value.runs) ? value.runs : []);
  return Object.freeze(source.slice(0, OUTPUT_LIMITS.maxArray)
    .map(entry => publicRun(entry, tokenizeRunId))
    .filter(Boolean));
}

function publicAutomationSummary(value) {
  const counts = publicCounts(value);
  return Object.freeze({
    ...counts,
    aborted: value?.aborted === true
  });
}

function publicConfigCheck(value) {
  if (!isPlainObject(value)) {
    return Object.freeze({
      valid: true,
      localOnly: true,
      templateCount: 0,
      inputExtensions: Object.freeze([]),
      requiredFeatures: Object.freeze([]),
      issueCount: 0
    });
  }
  const issueSource = Array.isArray(value.issues)
    ? value.issues
    : (Array.isArray(value.errors) ? value.errors : []);
  const issueCount = Math.min(issueSource.length, 32);
  const inputExtensions = Array.isArray(value.inputExtensions)
    ? value.inputExtensions.slice(0, 32).filter(item => typeof item === "string" && /^\.[a-z0-9]{1,10}$/i.test(item))
    : [];
  return Object.freeze({
    valid: value.valid !== false && value.ok !== false && issueCount === 0,
    localOnly: value.localOnly === true,
    templateCount: safeCount(value.templateCount),
    inputExtensions: Object.freeze([...new Set(inputExtensions)].sort()),
    requiredFeatures: Object.freeze(safeFeatureList(value.requiredFeatures)),
    issueCount
  });
}

function adapterFailureCode(errorOrValue, operation) {
  let sourceCode = null;
  try {
    sourceCode = isPlainObject(errorOrValue)
      ? errorOrValue.code
      : (errorOrValue && typeof errorOrValue === "object" ? errorOrValue.code : null);
  } catch (_error) {
    sourceCode = null;
  }
  if (LICENSE_FAILURE_CODES.has(sourceCode)) return "LICENSE_REJECTED";
  if (operation === "importLicense") return "LICENSE_REJECTED";
  if (operation === "requestTrial") return "TRIAL_REQUEST_FAILED";
  if (operation === "checkAutomationConfig") return "AUTOMATION_CONFIG_REJECTED";
  return "COMMERCIAL_OPERATION_FAILED";
}

function adapterRejected(value) {
  return isPlainObject(value) && value.ok === false;
}

function adapterHandle(value, preferredKeys) {
  if (typeof value === "string" || typeof value === "number") return value;
  if (!isPlainObject(value)) return value;
  for (const key of preferredKeys) {
    if (typeof value[key] === "string" || typeof value[key] === "number") return value[key];
  }
  return value;
}

function createCommercialHost({ activationSummaryProvider = async () => ({ flags: { realActivated: false } }) } = {}) {
  if (typeof activationSummaryProvider !== "function") {
    throw new TypeError("activationSummaryProvider must be a function");
  }

  let adapter = null;
  let closed = false;
  const configs = new Map();
  const watches = new Map();
  const schedules = new Map();
  const runTokens = new Map();

  function tokenizeRunId(runId) {
    if (runTokens.has(runId)) return runTokens.get(runId);
    if (runTokens.size >= OUTPUT_LIMITS.maxNodes) {
      const oldest = runTokens.keys().next().value;
      runTokens.delete(oldest);
    }
    const token = opaqueToken("run");
    runTokens.set(runId, token);
    return token;
  }

  async function activationEligible() {
    try {
      const summary = await activationSummaryProvider();
      return isPlainObject(summary) && isPlainObject(summary.flags) && summary.flags.realActivated === true;
    } catch (_error) {
      return false;
    }
  }

  async function invoke(method, ...args) {
    if (closed) return failure("HOST_SHUTDOWN");
    if (!adapter) return failure("PRO_UNAVAILABLE");
    let value;
    try {
      value = await adapter[method](...args);
    } catch (error) {
      return failure(adapterFailureCode(error, method));
    }
    const cloned = cloneAdapterOutput(value);
    if (cloned.code) return failure(cloned.code);
    if (adapterRejected(cloned.value)) return failure(adapterFailureCode(cloned.value, method));
    return { ok: true, value: cloned.value };
  }

  function requireConfigToken(value) {
    if (typeof value !== "string" || !/^cfg_[A-Za-z0-9_-]{32}$/.test(value)) return null;
    return configs.get(value) || null;
  }

  async function getState() {
    const eligible = await activationEligible();
    if (!adapter || closed) {
      return success({
        mode: "community",
        adapterReady: false,
        trialEligible: eligible,
        license: communityLicenseState(),
        registeredConfigCount: configs.size,
        activeWatchCount: watches.size,
        activeScheduleCount: schedules.size
      });
    }
    const result = await invoke("getLicenseState");
    if (!result.ok) {
      return success({
        mode: "community",
        adapterReady: true,
        trialEligible: eligible,
        license: communityLicenseState(),
        registeredConfigCount: configs.size,
        activeWatchCount: watches.size,
        activeScheduleCount: schedules.size
      });
    }
    const license = publicLicenseState(result.value);
    return success({
      mode: license.status === "active" && license.edition !== "community" ? "commercial" : "community",
      adapterReady: true,
      trialEligible: eligible,
      license,
      registeredConfigCount: configs.size,
      activeWatchCount: watches.size,
      activeScheduleCount: schedules.size
    });
  }

  async function setAdapter(nextAdapter) {
    if (closed) return failure("HOST_SHUTDOWN");
    if (watches.size || schedules.size) return failure("ADAPTER_BUSY");
    if (nextAdapter === null) {
      if (adapter) {
        try {
          await adapter.shutdown();
        } catch (_error) {
          // Detaching is fail-closed; adapter diagnostics remain private.
        }
      }
      adapter = null;
      configs.clear();
      runTokens.clear();
      return success({ adapterReady: false });
    }
    if ((typeof nextAdapter !== "object" && typeof nextAdapter !== "function") || !nextAdapter) {
      return failure("COMMERCIAL_ADAPTER_INVALID");
    }
    for (const method of REQUIRED_ADAPTER_METHODS) {
      if (typeof nextAdapter[method] !== "function") return failure("COMMERCIAL_ADAPTER_INVALID");
    }
    if (adapter && adapter !== nextAdapter) {
      try {
        await adapter.shutdown();
      } catch (_error) {
        // Replacing an inactive adapter is fail-closed and does not expose diagnostics.
      }
    }
    adapter = nextAdapter;
    configs.clear();
    return success({ adapterReady: true });
  }

  async function requestTrial(input = {}) {
    if (closed) return failure("HOST_SHUTDOWN");
    if (!hasExactKeys(input, [])) return failure("INPUT_INVALID");
    if (!adapter) return failure("PRO_UNAVAILABLE");
    if (!(await activationEligible())) return failure("ACTIVATION_REQUIRED");
    const result = await invoke("requestTrial", { consent: true });
    if (!result.ok) return result;
    return success({ license: publicLicenseState(result.value) });
  }

  async function importLicenseFromPath(filePath) {
    if (closed) return failure("HOST_SHUTDOWN");
    if (typeof filePath !== "string" || filePath.length < 1 || filePath.length > 4096
      || filePath.includes("\0") || !path.isAbsolute(filePath)) {
      return failure("INPUT_INVALID");
    }
    const result = await invoke("importLicense", { sourcePath: path.resolve(filePath) });
    if (!result.ok) return result;
    return success({ license: publicLicenseState(result.value) });
  }

  async function registerAutomationConfig(config) {
    if (closed) return failure("HOST_SHUTDOWN");
    if (configs.size >= MAX_CONFIGS) return failure("CONFIG_LIMIT_REACHED");
    if (!isPlainObject(config)) return failure("INPUT_INVALID");
    const copy = cloneJsonInput(config);
    if (!copy) return failure("INPUT_INVALID");
    const result = await invoke("checkAutomationConfig", { config: copy });
    if (!result.ok) return result;
    const check = publicConfigCheck(result.value);
    if (!check.valid) return failure("AUTOMATION_CONFIG_REJECTED");
    const configToken = opaqueToken("cfg");
    configs.set(configToken, cloneJsonInput(copy));
    return success({ configToken, check });
  }

  async function runOnce(configToken) {
    if (closed) return failure("HOST_SHUTDOWN");
    const config = requireConfigToken(configToken);
    if (!config) return failure("CONFIG_UNKNOWN");
    const result = await invoke("runAutomationOnce", { config: cloneJsonInput(config) });
    if (!result.ok) return result;
    return success({ summary: publicAutomationSummary(result.value) });
  }

  async function startWatch(configToken) {
    if (closed) return failure("HOST_SHUTDOWN");
    const config = requireConfigToken(configToken);
    if (!config) return failure("CONFIG_UNKNOWN");
    if (watches.size >= MAX_CONFIGS) return failure("WATCH_LIMIT_REACHED");
    const result = await invoke("startAutomationWatch", { config: cloneJsonInput(config) });
    if (!result.ok) return result;
    const watchToken = opaqueToken("watch");
    const runId = adapterHandle(result.value, ["runId"]);
    if (typeof runId !== "string") return failure("ADAPTER_OUTPUT_INVALID");
    watches.set(watchToken, Object.freeze({ runId }));
    return success({ watchToken });
  }

  async function stopWatch(watchToken) {
    if (closed) return failure("HOST_SHUTDOWN");
    if (typeof watchToken !== "string" || !watches.has(watchToken)) return failure("WATCH_UNKNOWN");
    if (!adapter) return failure("PRO_UNAVAILABLE");
    let value;
    try {
      value = await adapter.stopAutomationWatch({ runId: watches.get(watchToken).runId });
    } catch (error) {
      return failure(adapterFailureCode(error, "stopAutomationWatch"));
    }
    const cloned = cloneAdapterOutput(value);
    if (cloned.code) return failure(cloned.code);
    if (adapterRejected(cloned.value)) return failure(adapterFailureCode(cloned.value, "stopAutomationWatch"));
    watches.delete(watchToken);
    return success({ stopped: true });
  }

  async function startSchedule(input = {}) {
    if (closed) return failure("HOST_SHUTDOWN");
    if (!hasExactKeys(input, ["configToken", "everyMs", "runImmediately"])) return failure("INPUT_INVALID");
    if (!Number.isSafeInteger(input.everyMs) || input.everyMs < 1000 || input.everyMs > 2678400000) {
      return failure("INPUT_INVALID");
    }
    if (input.runImmediately !== undefined && typeof input.runImmediately !== "boolean") {
      return failure("INPUT_INVALID");
    }
    const config = requireConfigToken(input.configToken);
    if (!config) return failure("CONFIG_UNKNOWN");
    if (schedules.size >= MAX_CONFIGS) return failure("SCHEDULE_LIMIT_REACHED");
    const result = await invoke("startAutomationSchedule", {
      config: cloneJsonInput(config),
      everyMs: input.everyMs,
      ...(input.runImmediately === undefined ? {} : { runImmediately: input.runImmediately })
    });
    if (!result.ok) return result;
    const scheduleToken = opaqueToken("schedule");
    const runId = adapterHandle(result.value, ["runId"]);
    if (typeof runId !== "string") return failure("ADAPTER_OUTPUT_INVALID");
    schedules.set(scheduleToken, Object.freeze({ runId }));
    return success({ scheduleToken });
  }

  async function stopSchedule(scheduleToken) {
    if (closed) return failure("HOST_SHUTDOWN");
    if (typeof scheduleToken !== "string" || !schedules.has(scheduleToken)) return failure("SCHEDULE_UNKNOWN");
    if (!adapter) return failure("PRO_UNAVAILABLE");
    let value;
    try {
      value = await adapter.stopAutomationSchedule({ runId: schedules.get(scheduleToken).runId });
    } catch (error) {
      return failure(adapterFailureCode(error, "stopAutomationSchedule"));
    }
    const cloned = cloneAdapterOutput(value);
    if (cloned.code) return failure(cloned.code);
    if (adapterRejected(cloned.value)) return failure(adapterFailureCode(cloned.value, "stopAutomationSchedule"));
    schedules.delete(scheduleToken);
    return success({ stopped: true });
  }

  async function listRuns(input = {}) {
    if (closed) return failure("HOST_SHUTDOWN");
    if (!hasExactKeys(input, [])) return failure("INPUT_INVALID");
    const result = await invoke("listAutomationRuns");
    if (!result.ok && watches.size === 0 && schedules.size === 0) return result;
    const source = result.ok && Array.isArray(result.value)
      ? result.value
      : (result.ok && Array.isArray(result.value?.runs) ? result.value.runs : []);
    const seen = new Set();
    const activeRuns = [];
    const retainedRuns = [];
    for (const entry of source.slice(0, OUTPUT_LIMITS.maxArray)) {
      if (!isPlainObject(entry)) continue;
      const rawRunId = typeof entry.runId === "string" ? entry.runId : null;
      let publicToken = null;
      let trigger = null;
      if (rawRunId !== null) {
        for (const [token, active] of watches) {
          if (active.runId === rawRunId) {
            publicToken = token;
            trigger = "watch";
            seen.add(token);
            break;
          }
        }
        if (publicToken === null) {
          for (const [token, active] of schedules) {
            if (active.runId === rawRunId) {
              publicToken = token;
              trigger = "schedule";
              seen.add(token);
              break;
            }
          }
        }
      }
      if (publicToken !== null) {
        if (seen.has(`rendered:${publicToken}`)) continue;
        seen.add(`rendered:${publicToken}`);
        const safe = publicRun({ ...entry, status: "running" }, tokenizeRunId, publicToken, trigger);
        if (safe) activeRuns.push(safe);
      } else {
        const safe = publicRun(entry, tokenizeRunId);
        if (safe) retainedRuns.push(safe);
      }
    }
    for (const token of watches.keys()) {
      if (!seen.has(token)) activeRuns.push(publicRun({ status: "running", mode: "watch" }, tokenizeRunId, token, "watch"));
    }
    for (const token of schedules.keys()) {
      if (!seen.has(token)) activeRuns.push(publicRun({ status: "running", mode: "schedule" }, tokenizeRunId, token, "schedule"));
    }
    return success({
      runs: Object.freeze([...activeRuns, ...retainedRuns].slice(0, OUTPUT_LIMITS.maxArray))
    });
  }

  async function getHistory(input = {}) {
    if (closed) return failure("HOST_SHUTDOWN");
    if (!hasExactKeys(input, ["configToken", "limit"])) return failure("INPUT_INVALID");
    const config = requireConfigToken(input.configToken);
    if (!config) return failure("CONFIG_UNKNOWN");
    const limit = input.limit === undefined ? 100 : input.limit;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) return failure("INPUT_INVALID");
    const result = await invoke("getAutomationHistory", { config: cloneJsonInput(config), limit });
    if (!result.ok) return result;
    return success({ runs: Object.freeze(extractRuns(result.value, tokenizeRunId).slice(0, limit)) });
  }

  async function shutdown() {
    if (closed) return success({ stoppedWatches: 0, stoppedSchedules: 0 });
    let stoppedWatches = 0;
    let stoppedSchedules = 0;
    if (adapter) {
      for (const [token, handle] of [...watches]) {
        try {
          await adapter.stopAutomationWatch({ runId: handle.runId });
          watches.delete(token);
          stoppedWatches += 1;
        } catch (_error) {
          // Shutdown is best effort and never leaks adapter details.
        }
      }
      for (const [token, handle] of [...schedules]) {
        try {
          await adapter.stopAutomationSchedule({ runId: handle.runId });
          schedules.delete(token);
          stoppedSchedules += 1;
        } catch (_error) {
          // Shutdown is best effort and never leaks adapter details.
        }
      }
      try {
        await adapter.shutdown();
      } catch (_error) {
        // The host is closed even when a commercial adapter cleanup fails.
      }
    }
    watches.clear();
    schedules.clear();
    configs.clear();
    runTokens.clear();
    adapter = null;
    closed = true;
    return success({ stoppedWatches, stoppedSchedules });
  }

  return Object.freeze({
    setAdapter,
    getState,
    requestTrial,
    importLicenseFromPath,
    registerAutomationConfig,
    runOnce,
    startWatch,
    stopWatch,
    startSchedule,
    stopSchedule,
    listRuns,
    getHistory,
    shutdown
  });
}

module.exports = Object.freeze({
  MAX_CONFIGS,
  REQUIRED_ADAPTER_METHODS,
  createCommercialHost
});
