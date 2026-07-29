"use strict";

const assert = require("assert");
const crypto = require("crypto");
const {
  CLAIMS_SCHEMA,
  DEFAULT_KEYRING,
  ENVELOPE_SCHEMA,
  LIMITS,
  PRODUCT,
  verifyLicense
} = require("../src/license");
const {
  COMMUNITY_FEATURES,
  FEATURE_CATALOG,
  communityPolicy,
  hasFeature,
  resolveFeaturePolicy
} = require("../src/feature-policy");

const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const keyring = Object.freeze({ "test-v1": publicKey });
const installationHash = crypto.createHash("sha256").update("test-installation").digest("hex");
const otherInstallationHash = crypto.createHash("sha256").update("other-installation").digest("hex");

function claims(overrides = {}) {
  return {
    schema: CLAIMS_SCHEMA,
    licenseId: "lic_test_001",
    product: PRODUCT,
    edition: "pro",
    issuedAt: "2026-01-01T00:00:00.000Z",
    notBefore: "2026-01-01T00:00:00.000Z",
    expiresAt: "2027-01-01T00:00:00.000Z",
    graceUntil: "2027-01-15T00:00:00.000Z",
    features: ["projects.history", "folders.watched", "support.priority"],
    maxMajorVersion: 1,
    installationHashes: [installationHash],
    ...overrides
  };
}

function envelopeFor(payloadClaims, { signingKey = privateKey, keyId = "test-v1", rawPayload } = {}) {
  const payloadBytes = rawPayload === undefined
    ? Buffer.from(JSON.stringify(payloadClaims), "utf8")
    : Buffer.from(rawPayload);
  return {
    schema: ENVELOPE_SCHEMA,
    keyId,
    payload: payloadBytes.toString("base64url"),
    signature: crypto.sign(null, payloadBytes, signingKey).toString("base64url")
  };
}

function verify(envelope, overrides = {}) {
  return verifyLicense(envelope, {
    keyring,
    now: "2026-06-01T00:00:00.000Z",
    installationHash,
    appVersion: "1.4.0",
    buildCeiling: "pro",
    ...overrides
  });
}

function test(name, operation) {
  try {
    operation();
    process.stdout.write(`✓ ${name}\n`);
  } catch (error) {
    process.stderr.write(`✗ ${name}\n`);
    throw error;
  }
}

test("default keyring is empty and Community is the safe default", () => {
  assert.strictEqual(Object.keys(DEFAULT_KEYRING).length, 0);
  const result = verifyLicense(envelopeFor(claims()), {
    now: "2026-06-01T00:00:00.000Z",
    installationHash,
    appVersion: "1.4.0"
  });
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.code, "key_unknown");
  assert.deepStrictEqual(result.policy.features, COMMUNITY_FEATURES);
  assert.strictEqual(result.policy.buildCeiling, "community");
});

test("valid signed license unlocks only claimed Pro features", () => {
  const result = verify(envelopeFor(claims()));
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.status, "active");
  assert.strictEqual(result.claims.licenseId, "lic_test_001");
  assert.strictEqual(result.policy.effectiveEdition, "pro");
  assert.strictEqual(hasFeature(result.policy, "projects.history"), true);
  assert.strictEqual(hasFeature(result.policy, "automation.scheduled"), false);
  assert.strictEqual(hasFeature(result.policy, "documents.import"), true);
  assert.strictEqual(hasFeature(result.policy, "projects.saved"), false);
  assert.strictEqual(hasFeature(result.policy, "automation.cli"), true);
  assert(Object.isFrozen(result.claims));
  assert(Object.isFrozen(result.policy.features));
});

test("build ceiling caps a valid Business license", () => {
  const result = verify(envelopeFor(claims({
    edition: "business",
    features: ["projects.history", "deployment.controls"]
  })));
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.policy.capped, true);
  assert.strictEqual(result.policy.effectiveEdition, "pro");
  assert.strictEqual(hasFeature(result.policy, "projects.history"), true);
  assert.strictEqual(hasFeature(result.policy, "deployment.controls"), false);
});

test("tampered payload and signature are rejected", () => {
  const envelope = envelopeFor(claims());
  const tamperedPayload = {
    ...envelope,
    payload: Buffer.from(JSON.stringify(claims({ features: ["deployment.controls"] }))).toString("base64url")
  };
  assert.strictEqual(verify(tamperedPayload).code, "signature_invalid");

  const signature = Buffer.from(envelope.signature, "base64url");
  signature[0] ^= 0xff;
  assert.strictEqual(verify({ ...envelope, signature: signature.toString("base64url") }).code, "signature_invalid");
});

test("unknown key id is rejected before claims are trusted", () => {
  const result = verify(envelopeFor(claims(), { keyId: "missing-v1" }));
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.code, "key_unknown");
  assert.strictEqual(result.claims, null);
});

test("wrong product is rejected", () => {
  const result = verify(envelopeFor(claims({ product: "another-product" })));
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.code, "product_invalid");
});

test("not-before, expiry, and grace boundaries are enforced", () => {
  const envelope = envelopeFor(claims());
  assert.strictEqual(verify(envelope, { now: "2025-12-31T23:59:59.999Z" }).status, "not_active");

  const grace = verify(envelope, { now: "2027-01-01T00:00:00.000Z" });
  assert.strictEqual(grace.valid, true);
  assert.strictEqual(grace.status, "grace");

  const expired = verify(envelope, { now: "2027-01-15T00:00:00.000Z" });
  assert.strictEqual(expired.valid, false);
  assert.strictEqual(expired.status, "expired");
  assert.strictEqual(expired.code, "license_expired");

  const raw = claims();
  delete raw.graceUntil;
  const corrected = envelopeFor(raw);
  assert.strictEqual(
    verify(corrected, { now: "2027-01-01T00:00:00.000Z" }).status,
    "expired"
  );
});

test("date schema and chronology are strict", () => {
  assert.strictEqual(
    verify(envelopeFor(claims({ expiresAt: "2027-01-01" }))).code,
    "expires_at_invalid"
  );
  assert.strictEqual(
    verify(envelopeFor(claims({
      notBefore: "2027-02-01T00:00:00.000Z",
      expiresAt: "2027-01-01T00:00:00.000Z"
    }))).code,
    "date_order_invalid"
  );
});

test("maximum major version and app version syntax are enforced", () => {
  assert.strictEqual(verify(envelopeFor(claims()), { appVersion: "2.0.0" }).status, "version_blocked");
  assert.strictEqual(
    verify(envelopeFor(claims()), { appVersion: "not-semver" }).code,
    "app_version_invalid"
  );
  assert.strictEqual(
    verify(envelopeFor(claims({ maxMajorVersion: -1 }))).code,
    "max_major_version_invalid"
  );
});

test("installation binding supports unbound, matching, missing, and mismatched cases", () => {
  assert.strictEqual(verify(envelopeFor(claims())).valid, true);
  assert.strictEqual(
    verify(envelopeFor(claims()), { installationHash: otherInstallationHash }).code,
    "installation_not_licensed"
  );
  assert.strictEqual(
    verify(envelopeFor(claims()), { installationHash: null }).code,
    "installation_hash_required"
  );
  assert.strictEqual(
    verify(envelopeFor(claims()), { installationHash: "ABC" }).code,
    "installation_hash_invalid"
  );
  assert.strictEqual(
    verify(envelopeFor(claims({ installationHashes: [] })), { installationHash: null }).valid,
    true
  );
});

test("prototype-polluted and extra-key objects are rejected", () => {
  const pollutedEnvelope = Object.assign(Object.create({ admin: true }), envelopeFor(claims()));
  assert.strictEqual(verify(pollutedEnvelope).code, "envelope_schema_invalid");

  const ownProtoPayload = JSON.stringify({
    ...claims(),
    "__proto__": { feature: "deployment.controls" }
  }).replace(/}$/, ',"__proto__":{"feature":"deployment.controls"}}');
  assert.strictEqual(verify(envelopeFor(null, { rawPayload: ownProtoPayload })).code, "claims_object_invalid");

  assert.strictEqual(
    verify(envelopeFor({ ...claims(), unexpected: true })).code,
    "claims_schema_invalid"
  );
});

test("oversized envelope, payload, identifiers, and installation lists are rejected", () => {
  assert.strictEqual(
    verifyLicense("x".repeat(LIMITS.envelopeBytes + 1)).code,
    "envelope_too_large"
  );

  const oversizedPayload = Buffer.from(`{"pad":"${"x".repeat(LIMITS.payloadBytes)}"}`);
  const oversizedEnvelope = envelopeFor(null, { rawPayload: oversizedPayload });
  assert.strictEqual(verify(oversizedEnvelope).code, "payload_too_large");

  assert.strictEqual(
    verify(envelopeFor(claims({ licenseId: `x${"y".repeat(LIMITS.licenseIdLength)}` }))).code,
    "license_id_invalid"
  );
  assert.strictEqual(
    verify(envelopeFor(claims({
      installationHashes: Array.from(
        { length: LIMITS.installations + 1 },
        (_value, index) => crypto.createHash("sha256").update(`install-${index}`).digest("hex")
      )
    }))).code,
    "installation_hashes_invalid"
  );
});

test("unknown, duplicate, and out-of-edition features are rejected", () => {
  assert.strictEqual(
    verify(envelopeFor(claims({ features: ["feature.doesNotExist"] }))).code,
    "feature_unknown"
  );
  assert.strictEqual(
    verify(envelopeFor(claims({ features: ["projects.history", "projects.history"] }))).code,
    "feature_duplicate"
  );
  assert.strictEqual(
    verify(envelopeFor(claims({ features: ["deployment.controls"] }))).code,
    "feature_not_in_edition"
  );
});

test("feature policy helpers enforce Community defaults and programmer input", () => {
  assert(Object.isFrozen(FEATURE_CATALOG));
  assert.deepStrictEqual(communityPolicy("business").features, COMMUNITY_FEATURES);
  assert.throws(
    () => resolveFeaturePolicy({
      licensedEdition: "pro",
      licensedFeatures: ["unknown"],
      buildCeiling: "pro"
    }),
    /Invalid licensed feature list/
  );
});

process.stdout.write("All offline license tests passed.\n");
