"use strict";

const crypto = require("crypto");
const { constants: FS_CONSTANTS } = require("fs");
const fs = require("fs/promises");
const path = require("path");
const { writeFileAtomically } = require("./project-io");

const SCHEMA_VERSION = 1;
const MAX_LEDGER_BYTES = 1024 * 1024;
const MAX_PROJECTS = 256;
const MAX_BATCHES_PER_PROJECT = 128;
const MAX_WEEK_BUCKETS = 26;
const PROJECT_ID_PATTERN = /^actprj_[a-f0-9]{32}$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/i;
const HMAC_PATTERN = /^[a-f0-9]{64}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const PROJECT_EVENTS = new Set([
  "scenario_selected",
  "guided_issue_seen",
  "guided_issue_resolved",
  "user_data_selected",
  "user_template_selected",
  "mappings_confirmed",
  "project_saved"
]);
const BATCH_EVENTS = new Set([
  "preflight_passed",
  "artifact_generated",
  "package_saved"
]);
const PRO_INTENT_EVENT = "pro_feature_intent";
const PRO_INTENT_FEATURES = new Set([
  "folders.watched",
  "automation.scheduled",
  "automation.unattendedApi",
  "automation.retries",
  "data.relational",
  "rules.advanced",
  "approvals.workflow",
  "audit.records",
  "connectors.commercial"
]);

const COUNT_KEYS = Object.freeze([
  "projectsCreated",
  "batchesStarted",
  "preflightsPassed",
  "samplePackagesSaved",
  "realPackagesSaved",
  "projectsSaved",
  "proIntentActions",
  "guidedActivations",
  "realActivations",
  "usagePqlSignals",
  "intentPqlSignals",
  "threeBatchSignals",
  "multiTemplateSignals"
]);
const GLOBAL_FLAG_KEYS = Object.freeze([
  "guidedActivated",
  "realActivated",
  "usagePql",
  "intentPql",
  "threeRealBatches",
  "multiTemplate"
]);
const MILESTONE_KEYS = Object.freeze([
  "guidedActivatedAt",
  "firstRealPackageAt",
  "realActivatedAt",
  "usagePqlAt",
  "intentPqlAt",
  "threeRealBatchesAt",
  "multiTemplateAt"
]);
const PROJECT_FLAG_KEYS = Object.freeze([
  "scenarioSelected",
  "guidedIssueSeen",
  "guidedIssueResolved",
  "userDataPresent",
  "userTemplatePresent",
  "mappingsConfirmed",
  "projectSaved"
]);
const PROJECT_COUNT_KEYS = Object.freeze([
  "realPackagesSaved",
  "samplePackagesSaved",
  "projectsSaved",
  "proIntentActions"
]);
const BATCH_BOOLEAN_KEYS = Object.freeze([
  "real",
  "twoOrMoreTemplates",
  "preflightPassed",
  "artifactGenerated",
  "outputSaved"
]);

class ActivationLedgerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ActivationLedgerError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new ActivationLedgerError(code, message);
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactObject(value, allowedKeys, label) {
  if (!isPlainObject(value)) fail("INVALID_LEDGER_INPUT", `${label} must be a plain object`);
  const allowed = new Set(allowedKeys);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.has(key)) {
      fail("UNKNOWN_LEDGER_FIELD", `${label} contains an unknown field`);
    }
  }
  return value;
}

function safeCount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) fail("INVALID_LEDGER", `${label} is invalid`);
  return value;
}

function safeBoolean(value, label) {
  if (typeof value !== "boolean") fail("INVALID_LEDGER", `${label} is invalid`);
  return value;
}

function safeTimestamp(value, label, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    fail("INVALID_LEDGER", `${label} is invalid`);
  }
  return new Date(value).toISOString();
}

function nowIso(now) {
  const value = now();
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) fail("INVALID_CLOCK", "now returned an invalid timestamp");
  return date.toISOString();
}

function localDayKey(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localWeekStart(timestamp) {
  const date = new Date(timestamp);
  const dayOffset = (date.getDay() + 6) % 7;
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - dayOffset);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}T00:00:00.000Z`;
}

function withinCalendarDays(startTimestamp, endTimestamp, days) {
  const start = new Date(startTimestamp);
  const end = new Date(endTimestamp);
  const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  const difference = Math.floor((endDay - startDay) / DAY_MS);
  return difference >= 0 && difference < days;
}

function emptyCounts(keys) {
  return Object.fromEntries(keys.map(key => [key, 0]));
}

function emptyFlags(keys) {
  return Object.fromEntries(keys.map(key => [key, false]));
}

function freshState(timestamp) {
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: timestamp,
    updatedAt: timestamp,
    counts: emptyCounts(COUNT_KEYS),
    flags: emptyFlags(GLOBAL_FLAG_KEYS),
    milestones: Object.fromEntries(MILESTONE_KEYS.map(key => [key, null])),
    weeklyRealPackages: [],
    projects: []
  };
}

function normalizeNamedCounts(value, keys, label) {
  const source = exactObject(value, keys, label);
  return Object.fromEntries(keys.map(key => [key, safeCount(source[key], `${label}.${key}`)]));
}

function normalizeNamedFlags(value, keys, label) {
  const source = exactObject(value, keys, label);
  return Object.fromEntries(keys.map(key => [key, safeBoolean(source[key], `${label}.${key}`)]));
}

function normalizeMilestones(value) {
  const source = exactObject(value, MILESTONE_KEYS, "ledger.milestones");
  return Object.fromEntries(MILESTONE_KEYS.map(key => [
    key,
    safeTimestamp(source[key], `ledger.milestones.${key}`, true)
  ]));
}

function normalizeBatch(value, projectIndex, batchIndex) {
  const label = `ledger.projects[${projectIndex}].batches[${batchIndex}]`;
  const source = exactObject(value, [
    "sequence",
    "dedupeHmac",
    "createdAt",
    "updatedAt",
    "savedAt",
    ...BATCH_BOOLEAN_KEYS
  ], label);
  if (!HMAC_PATTERN.test(source.dedupeHmac)) fail("INVALID_LEDGER", `${label}.dedupeHmac is invalid`);
  return {
    sequence: safeCount(source.sequence, `${label}.sequence`),
    dedupeHmac: source.dedupeHmac,
    createdAt: safeTimestamp(source.createdAt, `${label}.createdAt`),
    updatedAt: safeTimestamp(source.updatedAt, `${label}.updatedAt`),
    savedAt: safeTimestamp(source.savedAt, `${label}.savedAt`, true),
    ...Object.fromEntries(BATCH_BOOLEAN_KEYS.map(key => [
      key,
      safeBoolean(source[key], `${label}.${key}`)
    ]))
  };
}

function normalizeProject(value, index) {
  const label = `ledger.projects[${index}]`;
  const source = exactObject(value, [
    "id",
    "sampleOrigin",
    "createdAt",
    "updatedAt",
    "nextBatchSequence",
    "flags",
    "counts",
    "batches"
  ], label);
  if (typeof source.id !== "string" || !PROJECT_ID_PATTERN.test(source.id)) {
    fail("INVALID_LEDGER", `${label}.id is invalid`);
  }
  if (!Array.isArray(source.batches) || source.batches.length > MAX_BATCHES_PER_PROJECT) {
    fail("INVALID_LEDGER", `${label}.batches is invalid`);
  }
  const batches = source.batches.map((batch, batchIndex) => normalizeBatch(batch, index, batchIndex));
  const sequenceSet = new Set(batches.map(batch => batch.sequence));
  const hmacSet = new Set(batches.map(batch => batch.dedupeHmac));
  if (sequenceSet.size !== batches.length || hmacSet.size !== batches.length) {
    fail("INVALID_LEDGER", `${label}.batches contains duplicates`);
  }
  const nextBatchSequence = safeCount(source.nextBatchSequence, `${label}.nextBatchSequence`);
  if (batches.some(batch => batch.sequence >= nextBatchSequence)) {
    fail("INVALID_LEDGER", `${label}.nextBatchSequence is invalid`);
  }
  return {
    id: source.id,
    sampleOrigin: safeBoolean(source.sampleOrigin, `${label}.sampleOrigin`),
    createdAt: safeTimestamp(source.createdAt, `${label}.createdAt`),
    updatedAt: safeTimestamp(source.updatedAt, `${label}.updatedAt`),
    nextBatchSequence,
    flags: normalizeNamedFlags(source.flags, PROJECT_FLAG_KEYS, `${label}.flags`),
    counts: normalizeNamedCounts(source.counts, PROJECT_COUNT_KEYS, `${label}.counts`),
    batches
  };
}

function normalizeState(value) {
  const source = exactObject(value, [
    "schemaVersion",
    "createdAt",
    "updatedAt",
    "counts",
    "flags",
    "milestones",
    "weeklyRealPackages",
    "projects"
  ], "ledger");
  if (source.schemaVersion !== SCHEMA_VERSION) fail("INVALID_LEDGER", "Unsupported activation ledger schema");
  if (!Array.isArray(source.weeklyRealPackages) || source.weeklyRealPackages.length > MAX_WEEK_BUCKETS) {
    fail("INVALID_LEDGER", "ledger.weeklyRealPackages is invalid");
  }
  const weeklyRealPackages = source.weeklyRealPackages.map((entry, index) => {
    const item = exactObject(entry, ["weekStartedAt", "count"], `ledger.weeklyRealPackages[${index}]`);
    const weekStartedAt = safeTimestamp(item.weekStartedAt, `ledger.weeklyRealPackages[${index}].weekStartedAt`);
    if (!/T00:00:00\.000Z$/.test(weekStartedAt)) fail("INVALID_LEDGER", "Weekly bucket timestamp is invalid");
    return { weekStartedAt, count: safeCount(item.count, `ledger.weeklyRealPackages[${index}].count`) };
  });
  if (!Array.isArray(source.projects) || source.projects.length > MAX_PROJECTS) {
    fail("INVALID_LEDGER", "ledger.projects is invalid");
  }
  const projects = source.projects.map(normalizeProject);
  if (new Set(projects.map(project => project.id)).size !== projects.length) {
    fail("INVALID_LEDGER", "ledger.projects contains duplicate identifiers");
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: safeTimestamp(source.createdAt, "ledger.createdAt"),
    updatedAt: safeTimestamp(source.updatedAt, "ledger.updatedAt"),
    counts: normalizeNamedCounts(source.counts, COUNT_KEYS, "ledger.counts"),
    flags: normalizeNamedFlags(source.flags, GLOBAL_FLAG_KEYS, "ledger.flags"),
    milestones: normalizeMilestones(source.milestones),
    weeklyRealPackages,
    projects
  };
}

async function readRegularFile(filePath, maximumBytes, label) {
  const noFollow = process.platform === "win32" ? 0 : (FS_CONSTANTS.O_NOFOLLOW || 0);
  let handle;
  try {
    handle = await fs.open(filePath, FS_CONSTANTS.O_RDONLY | noFollow);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > maximumBytes) {
      fail("INVALID_LEDGER", `${label} is not a supported regular file`);
    }
    const data = await handle.readFile();
    if (data.length !== stat.size) fail("INVALID_LEDGER", `${label} changed while it was being read`);
    return data;
  } finally {
    await handle?.close().catch(() => {});
  }
}

function publicProject(project) {
  const latestBatch = project.batches[project.batches.length - 1] || null;
  return {
    projectId: project.id,
    sampleOrigin: project.sampleOrigin,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    flags: { ...project.flags },
    counts: { ...project.counts },
    currentBatch: latestBatch ? {
      sequence: latestBatch.sequence,
      real: latestBatch.real,
      twoOrMoreTemplates: latestBatch.twoOrMoreTemplates,
      preflightPassed: latestBatch.preflightPassed,
      artifactGenerated: latestBatch.artifactGenerated,
      outputSaved: latestBatch.outputSaved,
      createdAt: latestBatch.createdAt,
      updatedAt: latestBatch.updatedAt,
      savedAt: latestBatch.savedAt
    } : null
  };
}

function publicSummary(state) {
  return {
    schemaVersion: state.schemaVersion,
    firstLaunchAt: state.createdAt,
    updatedAt: state.updatedAt,
    counts: { ...state.counts },
    flags: { ...state.flags },
    milestones: { ...state.milestones },
    weeklyRealPackages: state.weeklyRealPackages.map(entry => ({ ...entry })),
    projects: state.projects.map(publicProject)
  };
}

function createActivationLedger({
  userDataDir,
  now = () => new Date(),
  randomBytes = crypto.randomBytes
} = {}) {
  if (typeof userDataDir !== "string" || !path.isAbsolute(userDataDir)) {
    throw new TypeError("userDataDir must be an absolute path");
  }
  if (typeof now !== "function" || typeof randomBytes !== "function") {
    throw new TypeError("now and randomBytes must be functions");
  }

  const ledgerPath = path.join(path.resolve(userDataDir), "activation-ledger.json");
  const secretPath = path.join(path.resolve(userDataDir), "activation-ledger.key");
  let queue = Promise.resolve();
  let initialized = false;

  function withLock(operation) {
    const result = queue.then(operation, operation);
    queue = result.catch(() => {});
    return result;
  }

  async function readState() {
    try {
      const data = await readRegularFile(ledgerPath, MAX_LEDGER_BYTES, "activation ledger");
      return normalizeState(JSON.parse(data.toString("utf8")));
    } catch (error) {
      if (error?.code !== "ENOENT") {
        // The milestone ledger is non-authoritative. A corrupt or unsupported
        // file must never prevent the user from generating documents.
        console.error("DocFlow activation ledger reset:", error.message);
      }
      return freshState(nowIso(now));
    }
  }

  async function writeState(state) {
    state.updatedAt = nowIso(now);
    state.projects.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    if (state.projects.length > MAX_PROJECTS) state.projects.length = MAX_PROJECTS;
    state.weeklyRealPackages.sort((left, right) => right.weekStartedAt.localeCompare(left.weekStartedAt));
    if (state.weeklyRealPackages.length > MAX_WEEK_BUCKETS) state.weeklyRealPackages.length = MAX_WEEK_BUCKETS;
    const normalized = normalizeState(state);
    const body = Buffer.from(`${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    if (body.length > MAX_LEDGER_BYTES) fail("LEDGER_LIMIT", "Activation ledger is too large");
    await writeFileAtomically(ledgerPath, body, 0o600);
    initialized = true;
    return normalized;
  }

  async function hmacSecret() {
    try {
      const existing = await readRegularFile(secretPath, 32, "activation ledger key");
      if (existing.length !== 32) fail("INVALID_LEDGER_KEY", "Activation ledger key is invalid");
      return existing;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const generated = Buffer.from(randomBytes(32));
      if (generated.length !== 32) fail("INVALID_RANDOM", "randomBytes returned an invalid key");
      await writeFileAtomically(secretPath, generated, 0o600);
      return generated;
    }
  }

  function findProject(state, projectId) {
    if (typeof projectId !== "string" || !PROJECT_ID_PATTERN.test(projectId)) {
      fail("INVALID_PROJECT_ID", "Activation project identifier is invalid");
    }
    const project = state.projects.find(entry => entry.id === projectId);
    if (!project) fail("PROJECT_NOT_FOUND", "Activation project was not found");
    return project;
  }

  function successfulRealBatches(state) {
    return state.projects.flatMap(project => project.batches.filter(batch => batch.real && batch.outputSaved))
      .sort((left, right) => left.savedAt.localeCompare(right.savedAt) || left.sequence - right.sequence);
  }

  function setMilestone(state, flag, milestone, timestamp, countKey) {
    if (state.flags[flag]) return false;
    state.flags[flag] = true;
    state.milestones[milestone] = timestamp;
    state.counts[countKey] += 1;
    return true;
  }

  function updateSupportingSignals(state, timestamp) {
    if (state.counts.realPackagesSaved >= 3) {
      setMilestone(state, "threeRealBatches", "threeRealBatchesAt", timestamp, "threeBatchSignals");
    }
    const hasMultipleTemplates = state.projects.some(project => (
      project.batches.some(batch => batch.real && batch.outputSaved && batch.twoOrMoreTemplates)
    ));
    if (hasMultipleTemplates) {
      setMilestone(state, "multiTemplate", "multiTemplateAt", timestamp, "multiTemplateSignals");
    }
  }

  function updateUsagePql(state, timestamp) {
    if (!state.flags.realActivated || state.flags.usagePql) return;
    const realBatches = successfulRealBatches(state);
    if (realBatches.length < 2 || !state.milestones.firstRealPackageAt) return;
    const candidate = realBatches.slice(1).find(batch => (
      batch.savedAt > state.milestones.realActivatedAt
      && new Date(batch.savedAt).getTime() - new Date(state.milestones.firstRealPackageAt).getTime() <= 14 * DAY_MS
    ));
    if (candidate) setMilestone(state, "usagePql", "usagePqlAt", timestamp, "usagePqlSignals");
  }

  function maybeRealActivate(state, project, timestamp) {
    if (state.flags.realActivated || !project.flags.projectSaved) return;
    const successful = project.batches.find(batch => batch.real && batch.outputSaved);
    if (!successful) return;
    const activationAt = new Date(project.updatedAt) > new Date(successful.savedAt)
      ? project.updatedAt
      : successful.savedAt;
    if (!withinCalendarDays(state.createdAt, activationAt, 7)) return;
    setMilestone(state, "realActivated", "realActivatedAt", activationAt, "realActivations");
    updateUsagePql(state, timestamp);
  }

  function incrementWeeklyRealPackage(state, timestamp) {
    const weekStartedAt = localWeekStart(timestamp);
    let entry = state.weeklyRealPackages.find(item => item.weekStartedAt === weekStartedAt);
    if (!entry) {
      entry = { weekStartedAt, count: 0 };
      state.weeklyRealPackages.push(entry);
    }
    entry.count += 1;
  }

  async function createProject(input = {}) {
    const request = exactObject(input, ["sampleOrigin"], "activation project request");
    const sampleOrigin = request.sampleOrigin === true;
    return withLock(async () => {
      const state = await readState();
      const timestamp = nowIso(now);
      let id;
      do {
        const bytes = Buffer.from(randomBytes(16));
        if (bytes.length !== 16) fail("INVALID_RANDOM", "randomBytes returned an invalid project identifier");
        id = `actprj_${bytes.toString("hex")}`;
      } while (state.projects.some(project => project.id === id));
      const project = {
        id,
        sampleOrigin,
        createdAt: timestamp,
        updatedAt: timestamp,
        nextBatchSequence: 1,
        flags: emptyFlags(PROJECT_FLAG_KEYS),
        counts: emptyCounts(PROJECT_COUNT_KEYS),
        batches: []
      };
      state.projects.unshift(project);
      state.counts.projectsCreated += 1;
      await writeState(state);
      return publicProject(project);
    });
  }

  async function beginBatch(input) {
    const request = exactObject(
      input,
      ["projectId", "real", "dedupeDigest", "templateCountBucket"],
      "activation batch request"
    );
    if (typeof request.real !== "boolean") fail("INVALID_BATCH", "real must be a boolean");
    if (typeof request.dedupeDigest !== "string" || !DIGEST_PATTERN.test(request.dedupeDigest)) {
      fail("INVALID_BATCH", "dedupeDigest must be a SHA-256 hexadecimal digest");
    }
    if (!["one", "two_or_more"].includes(request.templateCountBucket)) {
      fail("INVALID_BATCH", "templateCountBucket must be one or two_or_more");
    }
    return withLock(async () => {
      const state = await readState();
      const project = findProject(state, request.projectId);
      const timestamp = nowIso(now);
      const secret = await hmacSecret();
      const dedupeHmac = crypto.createHmac("sha256", secret)
        .update(`${project.id}\0${localDayKey(timestamp)}\0${request.real ? "real" : "sample"}\0${request.dedupeDigest.toLowerCase()}`)
        .digest("hex");
      const existing = project.batches.find(batch => batch.dedupeHmac === dedupeHmac);
      if (existing) {
        if (existing.real !== request.real || existing.twoOrMoreTemplates !== (request.templateCountBucket === "two_or_more")) {
          fail("BATCH_CONFLICT", "The deduplicated batch metadata does not match its first attempt");
        }
        return {
          projectId: project.id,
          batchSequence: existing.sequence,
          deduplicated: true,
          completed: existing.outputSaved
        };
      }
      const batch = {
        sequence: project.nextBatchSequence,
        dedupeHmac,
        createdAt: timestamp,
        updatedAt: timestamp,
        savedAt: null,
        real: request.real,
        twoOrMoreTemplates: request.templateCountBucket === "two_or_more",
        preflightPassed: false,
        artifactGenerated: false,
        outputSaved: false
      };
      project.nextBatchSequence += 1;
      project.batches.push(batch);
      if (project.batches.length > MAX_BATCHES_PER_PROJECT) project.batches.shift();
      project.updatedAt = timestamp;
      state.counts.batchesStarted += 1;
      await writeState(state);
      return {
        projectId: project.id,
        batchSequence: batch.sequence,
        deduplicated: false,
        completed: false
      };
    });
  }

  async function recordProgress(input) {
    const preliminary = exactObject(
      input,
      ["projectId", "batchSequence", "event", "feature", "foregroundActiveSeconds"],
      "activation progress request"
    );
    if (typeof preliminary.event !== "string") fail("INVALID_EVENT", "event is required");
    const event = preliminary.event;
    if (!PROJECT_EVENTS.has(event) && !BATCH_EVENTS.has(event) && event !== PRO_INTENT_EVENT) {
      fail("INVALID_EVENT", "Activation event is not allowed");
    }
    const allowedKeys = new Set(["projectId", "event"]);
    if (BATCH_EVENTS.has(event)) allowedKeys.add("batchSequence");
    if (event === "package_saved") allowedKeys.add("foregroundActiveSeconds");
    if (event === PRO_INTENT_EVENT) allowedKeys.add("feature");
    exactObject(input, allowedKeys, `activation ${event} request`);
    if (event === PRO_INTENT_EVENT && !PRO_INTENT_FEATURES.has(preliminary.feature)) {
      fail("INVALID_EVENT", "Pro intent feature is not allowed");
    }
    if (event === "package_saved" && preliminary.foregroundActiveSeconds != null) {
      if (!Number.isSafeInteger(preliminary.foregroundActiveSeconds) || preliminary.foregroundActiveSeconds < 0 || preliminary.foregroundActiveSeconds > 86_400) {
        fail("INVALID_EVENT", "foregroundActiveSeconds is invalid");
      }
    }
    if (BATCH_EVENTS.has(event) && (!Number.isSafeInteger(preliminary.batchSequence) || preliminary.batchSequence < 1)) {
      fail("INVALID_EVENT", "batchSequence is invalid");
    }

    return withLock(async () => {
      const state = await readState();
      const project = findProject(state, preliminary.projectId);
      const timestamp = nowIso(now);
      let batch = null;
      let deduplicated = false;
      if (BATCH_EVENTS.has(event)) {
        batch = project.batches.find(entry => entry.sequence === preliminary.batchSequence);
        if (!batch) fail("BATCH_NOT_FOUND", "Activation batch was not found or is outside retention");
      }

      const projectFlagByEvent = {
        scenario_selected: "scenarioSelected",
        guided_issue_seen: "guidedIssueSeen",
        guided_issue_resolved: "guidedIssueResolved",
        user_data_selected: "userDataPresent",
        user_template_selected: "userTemplatePresent",
        mappings_confirmed: "mappingsConfirmed"
      };
      if (projectFlagByEvent[event]) {
        project.flags[projectFlagByEvent[event]] = true;
      } else if (event === "project_saved") {
        if (!project.flags.projectSaved) {
          project.flags.projectSaved = true;
          project.counts.projectsSaved += 1;
          state.counts.projectsSaved += 1;
        } else {
          deduplicated = true;
        }
      } else if (event === PRO_INTENT_EVENT) {
        project.counts.proIntentActions += 1;
        state.counts.proIntentActions += 1;
        if (state.flags.realActivated) {
          setMilestone(state, "intentPql", "intentPqlAt", timestamp, "intentPqlSignals");
        }
      } else if (event === "preflight_passed") {
        if (batch.preflightPassed) {
          deduplicated = true;
        } else {
          batch.preflightPassed = true;
          state.counts.preflightsPassed += 1;
        }
      } else if (event === "artifact_generated") {
        if (batch.artifactGenerated) deduplicated = true;
        batch.artifactGenerated = true;
      } else if (event === "package_saved") {
        if (batch.outputSaved) {
          deduplicated = true;
        } else {
          if (!batch.preflightPassed || !batch.artifactGenerated) {
            fail("INCOMPLETE_BATCH", "A package requires a passed preflight and at least one generated artifact");
          }
          if (batch.real && (!project.flags.userDataPresent || !project.flags.userTemplatePresent || !project.flags.mappingsConfirmed)) {
            fail("INCOMPLETE_REAL_BATCH", "A real package requires user data, a user template, and confirmed mappings");
          }
          batch.outputSaved = true;
          batch.savedAt = timestamp;
          if (batch.real) {
            project.counts.realPackagesSaved += 1;
            state.counts.realPackagesSaved += 1;
            if (!state.milestones.firstRealPackageAt) state.milestones.firstRealPackageAt = timestamp;
            incrementWeeklyRealPackage(state, timestamp);
            updateSupportingSignals(state, timestamp);
          } else {
            project.counts.samplePackagesSaved += 1;
            state.counts.samplePackagesSaved += 1;
            if (
              project.sampleOrigin
              && project.flags.scenarioSelected
              && project.flags.guidedIssueSeen
              && project.flags.guidedIssueResolved
              && Number.isSafeInteger(preliminary.foregroundActiveSeconds)
              && preliminary.foregroundActiveSeconds <= 600
            ) {
              setMilestone(state, "guidedActivated", "guidedActivatedAt", timestamp, "guidedActivations");
            }
          }
        }
      }

      if (batch) batch.updatedAt = timestamp;
      project.updatedAt = timestamp;
      maybeRealActivate(state, project, timestamp);
      updateUsagePql(state, timestamp);
      const saved = await writeState(state);
      const savedProject = findProject(saved, project.id);
      const savedBatch = batch
        ? savedProject.batches.find(entry => entry.sequence === batch.sequence) || null
        : null;
      return {
        recorded: !deduplicated,
        deduplicated,
        event,
        project: publicProject(savedProject),
        batch: savedBatch ? {
          sequence: savedBatch.sequence,
          real: savedBatch.real,
          preflightPassed: savedBatch.preflightPassed,
          artifactGenerated: savedBatch.artifactGenerated,
          outputSaved: savedBatch.outputSaved,
          savedAt: savedBatch.savedAt
        } : null,
        activation: {
          guided: saved.flags.guidedActivated,
          real: saved.flags.realActivated,
          usagePql: saved.flags.usagePql,
          intentPql: saved.flags.intentPql
        }
      };
    });
  }

  async function getSummary() {
    return withLock(async () => {
      let state = await readState();
      if (!initialized) state = await writeState(state);
      return publicSummary(state);
    });
  }

  async function createExport() {
    return withLock(async () => {
      let state = await readState();
      if (!initialized) state = await writeState(state);
      const summary = publicSummary(state);
      const buffer = Buffer.from(`${JSON.stringify(summary, null, 2)}\n`, "utf8");
      if (buffer.length > MAX_LEDGER_BYTES) fail("LEDGER_LIMIT", "Activation summary export is too large");
      return Object.freeze({ summary, buffer });
    });
  }

  async function clear() {
    return withLock(async () => {
      const replacementSecret = Buffer.from(randomBytes(32));
      if (replacementSecret.length !== 32) fail("INVALID_RANDOM", "randomBytes returned an invalid key");
      await writeFileAtomically(secretPath, replacementSecret, 0o600);
      const state = await writeState(freshState(nowIso(now)));
      return publicSummary(state);
    });
  }

  return Object.freeze({
    beginBatch,
    clear,
    createExport,
    createProject,
    getSummary,
    recordProgress
  });
}

module.exports = Object.freeze({
  ActivationLedgerError,
  MAX_LEDGER_BYTES,
  PROJECT_ID_PATTERN,
  PRO_INTENT_FEATURES,
  SCHEMA_VERSION,
  createActivationLedger,
  localWeekStart
});
