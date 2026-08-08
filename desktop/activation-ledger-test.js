"use strict";

const assert = require("assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { createActivationLedger } = require("./activation-ledger");

const DAY_MS = 24 * 60 * 60 * 1000;
const CUSTOMER_SECRET = "Acme Customer / Jane Doe / 998877";

function deterministicRandomBytes() {
  let counter = 0;
  return size => {
    counter += 1;
    return Buffer.alloc(size, counter & 0xff);
  };
}

async function completeBatch(ledger, projectId, batchSequence, extra = {}) {
  await ledger.recordProgress({ projectId, batchSequence, event: "preflight_passed" });
  await ledger.recordProgress({ projectId, batchSequence, event: "artifact_generated" });
  return ledger.recordProgress({ projectId, batchSequence, event: "package_saved", ...extra });
}

function assertPersistedValueIsAllowlisted(value, key = "root") {
  if (value === null || typeof value === "boolean" || typeof value === "number") return;
  if (typeof value === "string") {
    const allowed = /^actprj_[a-f0-9]{32}$/.test(value)
      || /^[a-f0-9]{64}$/.test(value)
      || Number.isFinite(Date.parse(value));
    assert.equal(allowed, true, `unexpected persisted string at ${key}: ${value}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertPersistedValueIsAllowlisted(item, `${key}[${index}]`));
    return;
  }
  assert.equal(typeof value, "object", `unexpected persisted value at ${key}`);
  for (const [childKey, child] of Object.entries(value)) {
    assertPersistedValueIsAllowlisted(child, `${key}.${childKey}`);
  }
}

async function main() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "docflow-activation-ledger-test-"));
  let clock = Date.parse("2026-08-03T02:00:00.000Z");
  const options = {
    userDataDir: temporary,
    now: () => new Date(clock),
    randomBytes: deterministicRandomBytes()
  };
  try {
    const ledger = createActivationLedger(options);
    await assert.rejects(
      () => ledger.createProject({ sampleOrigin: false, customerName: CUSTOMER_SECRET }),
      error => error?.code === "UNKNOWN_LEDGER_FIELD"
    );

    const sample = await ledger.createProject({ sampleOrigin: true });
    assert.match(sample.projectId, /^actprj_[a-f0-9]{32}$/);
    await ledger.recordProgress({ projectId: sample.projectId, event: "scenario_selected" });
    await ledger.recordProgress({ projectId: sample.projectId, event: "guided_issue_seen" });
    await ledger.recordProgress({ projectId: sample.projectId, event: "guided_issue_resolved" });
    const sampleBatch = await ledger.beginBatch({
      projectId: sample.projectId,
      real: false,
      dedupeDigest: "a".repeat(64),
      templateCountBucket: "one"
    });
    await completeBatch(ledger, sample.projectId, sampleBatch.batchSequence, { foregroundActiveSeconds: 285 });
    let summary = await ledger.getSummary();
    assert.equal(summary.flags.guidedActivated, true);
    assert.equal(summary.counts.guidedActivations, 1);
    assert.equal(summary.counts.samplePackagesSaved, 1);
    assert.equal(summary.counts.realPackagesSaved, 0);
    assert.deepEqual(summary.weeklyRealPackages, []);

    const duplicateSample = await ledger.beginBatch({
      projectId: sample.projectId,
      real: false,
      dedupeDigest: "a".repeat(64),
      templateCountBucket: "one"
    });
    assert.equal(duplicateSample.deduplicated, true);
    assert.equal(duplicateSample.completed, true);
    const duplicateSave = await ledger.recordProgress({
      projectId: sample.projectId,
      batchSequence: duplicateSample.batchSequence,
      event: "package_saved",
      foregroundActiveSeconds: 286
    });
    assert.equal(duplicateSave.deduplicated, true);
    assert.equal((await ledger.getSummary()).counts.samplePackagesSaved, 1);

    clock += DAY_MS;
    const real = await ledger.createProject({ sampleOrigin: false });
    await ledger.recordProgress({ projectId: real.projectId, event: "user_data_selected" });
    await ledger.recordProgress({ projectId: real.projectId, event: "user_template_selected" });
    await ledger.recordProgress({ projectId: real.projectId, event: "mappings_confirmed" });
    await ledger.recordProgress({ projectId: real.projectId, event: "project_saved" });
    const firstRealBatch = await ledger.beginBatch({
      projectId: real.projectId,
      real: true,
      dedupeDigest: "b".repeat(64),
      templateCountBucket: "one"
    });
    await completeBatch(ledger, real.projectId, firstRealBatch.batchSequence);
    summary = await ledger.getSummary();
    assert.equal(summary.flags.realActivated, true);
    assert.equal(summary.counts.realActivations, 1);
    assert.equal(summary.counts.realPackagesSaved, 1);
    assert.equal(summary.weeklyRealPackages.length, 1);
    assert.equal(summary.weeklyRealPackages[0].count, 1);

    clock += DAY_MS;
    const secondRealBatch = await ledger.beginBatch({
      projectId: real.projectId,
      real: true,
      dedupeDigest: "c".repeat(64),
      templateCountBucket: "two_or_more"
    });
    await ledger.recordProgress({
      projectId: real.projectId,
      batchSequence: secondRealBatch.batchSequence,
      event: "preflight_passed"
    });
    await ledger.recordProgress({
      projectId: real.projectId,
      batchSequence: secondRealBatch.batchSequence,
      event: "artifact_generated"
    });
    const concurrentSaves = await Promise.all([
      ledger.recordProgress({
        projectId: real.projectId,
        batchSequence: secondRealBatch.batchSequence,
        event: "package_saved"
      }),
      ledger.recordProgress({
        projectId: real.projectId,
        batchSequence: secondRealBatch.batchSequence,
        event: "package_saved"
      })
    ]);
    assert.deepEqual(concurrentSaves.map(result => result.recorded).sort(), [false, true]);
    summary = await ledger.getSummary();
    assert.equal(summary.counts.realPackagesSaved, 2);
    assert.equal(summary.weeklyRealPackages[0].count, 2);
    assert.equal(summary.flags.usagePql, true);
    assert.equal(summary.flags.multiTemplate, true);
    assert.equal(summary.counts.usagePqlSignals, 1);
    assert.equal(summary.counts.multiTemplateSignals, 1);

    clock += DAY_MS;
    const thirdRealBatch = await ledger.beginBatch({
      projectId: real.projectId,
      real: true,
      dedupeDigest: "d".repeat(64),
      templateCountBucket: "one"
    });
    await completeBatch(ledger, real.projectId, thirdRealBatch.batchSequence);
    await ledger.recordProgress({
      projectId: real.projectId,
      event: "pro_feature_intent",
      feature: "folders.watched"
    });
    summary = await ledger.getSummary();
    assert.equal(summary.counts.realPackagesSaved, 3);
    assert.equal(summary.flags.threeRealBatches, true);
    assert.equal(summary.flags.intentPql, true);
    assert.equal(summary.counts.threeBatchSignals, 1);
    assert.equal(summary.counts.intentPqlSignals, 1);

    await assert.rejects(
      () => ledger.recordProgress({
        projectId: real.projectId,
        batchSequence: 99_999,
        event: "preflight_passed"
      }),
      error => error?.code === "BATCH_NOT_FOUND"
    );
    await assert.rejects(
      () => ledger.recordProgress({
        projectId: real.projectId,
        event: "pro_feature_intent",
        feature: "arbitrary.customer.feature"
      }),
      error => error?.code === "INVALID_EVENT"
    );

    const ledgerPath = path.join(temporary, "activation-ledger.json");
    const keyPath = path.join(temporary, "activation-ledger.key");
    const persistedText = await fs.readFile(ledgerPath, "utf8");
    assert.equal(persistedText.includes(CUSTOMER_SECRET), false);
    assert.equal(persistedText.includes("b".repeat(64)), false, "raw caller digest must not be persisted");
    assertPersistedValueIsAllowlisted(JSON.parse(persistedText));
    const exported = await ledger.createExport();
    const exportedText = exported.buffer.toString("utf8");
    assert.deepEqual(JSON.parse(exportedText), exported.summary);
    assert.equal(exportedText.includes("dedupeHmac"), false, "summary export must omit batch HMACs");
    assert.equal(exportedText.includes("activation-ledger.key"), false, "summary export must omit local paths");
    assert.equal(exportedText.includes(CUSTOMER_SECRET), false);
    if (process.platform !== "win32") {
      assert.equal((await fs.stat(ledgerPath)).mode & 0o777, 0o600);
      assert.equal((await fs.stat(keyPath)).mode & 0o777, 0o600);
    }

    const restarted = createActivationLedger({ ...options, randomBytes: deterministicRandomBytes() });
    assert.deepEqual(await restarted.getSummary(), summary, "ledger should resume from disk after restart");

    const keyBeforeClear = await fs.readFile(keyPath);
    const cleared = await restarted.clear();
    const keyAfterClear = await fs.readFile(keyPath);
    assert.notDeepEqual(keyAfterClear, keyBeforeClear, "clearing the ledger should rotate its local dedupe key");
    assert.equal(cleared.counts.realPackagesSaved, 0);
    assert.equal(cleared.projects.length, 0);
    assert.equal(cleared.flags.realActivated, false);

    console.log("activation ledger tests passed");
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
