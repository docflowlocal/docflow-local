"use strict";

// SPDX-License-Identifier: MPL-2.0

const crypto = require("crypto");
const { TextDecoder } = require("util");
const {
  DEFAULT_BUILD_CEILING,
  communityPolicy,
  isEdition,
  resolveFeaturePolicy,
  validateLicensedFeatures
} = require("./feature-policy");

const ENVELOPE_SCHEMA = "docflow-license-envelope/v1";
const CLAIMS_SCHEMA = "docflow-license-claims/v1";
const PRODUCT = "docflow-local";

const MAX_ENVELOPE_BYTES = 32 * 1024;
const MAX_PAYLOAD_BYTES = 16 * 1024;
const MAX_KEY_ID_LENGTH = 64;
const MAX_LICENSE_ID_LENGTH = 128;
const MAX_INSTALLATIONS = 128;
const VERIFIED_RESULTS = new WeakSet();

// Intentionally empty until a controlled vendor signing key exists. Production
// builds can replace this frozen build-time keyring, while tests and internal
// tooling inject a keyring through verifyLicense options. Never ship a private
// key with the client.
const DEFAULT_KEYRING = Object.freeze(Object.create(null));

const ENVELOPE_KEYS = Object.freeze(["keyId", "payload", "schema", "signature"]);
const CLAIM_REQUIRED_KEYS = Object.freeze([
  "edition",
  "expiresAt",
  "features",
  "installationHashes",
  "issuedAt",
  "licenseId",
  "maxMajorVersion",
  "notBefore",
  "product",
  "schema"
]);
const CLAIM_OPTIONAL_KEYS = Object.freeze(["graceUntil"]);
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const STATUS = Object.freeze({
  ACTIVE: "active",
  GRACE: "grace",
  INVALID: "invalid",
  NOT_ACTIVE: "not_active",
  EXPIRED: "expired",
  VERSION_BLOCKED: "version_blocked",
  INSTALLATION_BLOCKED: "installation_blocked"
});

function ownKeysExactly(value, required, optional = []) {
  const keys = Object.keys(value).sort();
  const allowed = new Set([...required, ...optional]);
  if (required.some(key => !Object.prototype.hasOwnProperty.call(value, key))) return false;
  return keys.every(key => allowed.has(key));
}

function isSafePlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return !Object.keys(value).some(key => DANGEROUS_KEYS.has(key));
}

function isCanonicalBase64Url(value) {
  if (typeof value !== "string" || value.length === 0 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return false;
  }
  try {
    return Buffer.from(value, "base64url").toString("base64url") === value;
  } catch {
    return false;
  }
}

function parseEnvelope(input) {
  let envelope = input;
  if (typeof input === "string") {
    if (Buffer.byteLength(input, "utf8") > MAX_ENVELOPE_BYTES) {
      return { ok: false, code: "envelope_too_large" };
    }
    try {
      envelope = JSON.parse(input);
    } catch {
      return { ok: false, code: "envelope_json_invalid" };
    }
  }

  if (!isSafePlainObject(envelope) || !ownKeysExactly(envelope, ENVELOPE_KEYS)) {
    return { ok: false, code: "envelope_schema_invalid" };
  }
  if (envelope.schema !== ENVELOPE_SCHEMA) {
    return { ok: false, code: "envelope_schema_unsupported" };
  }
  if (
    typeof envelope.keyId !== "string"
    || envelope.keyId.length < 1
    || envelope.keyId.length > MAX_KEY_ID_LENGTH
    || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(envelope.keyId)
  ) {
    return { ok: false, code: "key_id_invalid" };
  }
  if (typeof envelope.payload !== "string") {
    return { ok: false, code: "payload_encoding_invalid" };
  }
  if (envelope.payload.length > Math.ceil(MAX_PAYLOAD_BYTES * 4 / 3) + 2) {
    return { ok: false, code: "payload_too_large" };
  }
  if (!isCanonicalBase64Url(envelope.payload)) {
    return { ok: false, code: "payload_encoding_invalid" };
  }
  if (typeof envelope.signature !== "string") {
    return { ok: false, code: "signature_encoding_invalid" };
  }
  if (envelope.signature.length > 86) {
    return { ok: false, code: "signature_length_invalid" };
  }
  if (!isCanonicalBase64Url(envelope.signature)) {
    return { ok: false, code: "signature_encoding_invalid" };
  }

  const payloadBytes = Buffer.from(envelope.payload, "base64url");
  const signatureBytes = Buffer.from(envelope.signature, "base64url");
  if (payloadBytes.length > MAX_PAYLOAD_BYTES) {
    return { ok: false, code: "payload_too_large" };
  }
  if (signatureBytes.length !== 64) {
    return { ok: false, code: "signature_length_invalid" };
  }
  return { ok: true, envelope, payloadBytes, signatureBytes };
}

function keyringEntry(keyring, keyId) {
  if (keyring instanceof Map) return keyring.get(keyId);
  if (!isSafePlainObject(keyring)) return undefined;
  return Object.prototype.hasOwnProperty.call(keyring, keyId) ? keyring[keyId] : undefined;
}

function importEd25519PublicKey(value) {
  if (typeof value === "string" && Buffer.byteLength(value, "utf8") > 8 * 1024) {
    throw new Error("public key is too large");
  }
  const key = value instanceof crypto.KeyObject ? value : crypto.createPublicKey(value);
  if (key.type !== "public" || key.asymmetricKeyType !== "ed25519") {
    throw new Error("public key is not Ed25519");
  }
  return key;
}

function parsePayload(payloadBytes) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(payloadBytes);
  } catch {
    return { ok: false, code: "payload_utf8_invalid" };
  }

  let claims;
  try {
    claims = JSON.parse(text);
  } catch {
    return { ok: false, code: "payload_json_invalid" };
  }
  if (!isSafePlainObject(claims)) {
    return { ok: false, code: "claims_object_invalid" };
  }
  return { ok: true, claims };
}

function parseTimestamp(value) {
  if (
    typeof value !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    return null;
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) return null;
  return milliseconds;
}

function validateClaims(claims) {
  if (!ownKeysExactly(claims, CLAIM_REQUIRED_KEYS, CLAIM_OPTIONAL_KEYS)) {
    return { ok: false, code: "claims_schema_invalid" };
  }
  if (claims.schema !== CLAIMS_SCHEMA) {
    return { ok: false, code: "claims_schema_unsupported" };
  }
  if (
    typeof claims.licenseId !== "string"
    || claims.licenseId.length < 1
    || claims.licenseId.length > MAX_LICENSE_ID_LENGTH
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(claims.licenseId)
  ) {
    return { ok: false, code: "license_id_invalid" };
  }
  if (claims.product !== PRODUCT) {
    return { ok: false, code: "product_invalid" };
  }
  if (!isEdition(claims.edition) || claims.edition === "community") {
    return { ok: false, code: "edition_invalid" };
  }

  const featureValidation = validateLicensedFeatures(claims.features, claims.edition);
  if (!featureValidation.ok) {
    return { ok: false, code: featureValidation.code };
  }

  if (
    !Number.isSafeInteger(claims.maxMajorVersion)
    || claims.maxMajorVersion < 0
    || claims.maxMajorVersion > 999
  ) {
    return { ok: false, code: "max_major_version_invalid" };
  }
  if (!Array.isArray(claims.installationHashes) || claims.installationHashes.length > MAX_INSTALLATIONS) {
    return { ok: false, code: "installation_hashes_invalid" };
  }
  const seenHashes = new Set();
  for (const hash of claims.installationHashes) {
    if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)) {
      return { ok: false, code: "installation_hash_invalid" };
    }
    if (seenHashes.has(hash)) {
      return { ok: false, code: "installation_hash_duplicate" };
    }
    seenHashes.add(hash);
  }

  const issuedAt = parseTimestamp(claims.issuedAt);
  const notBefore = parseTimestamp(claims.notBefore);
  const expiresAt = parseTimestamp(claims.expiresAt);
  const graceUntil = Object.prototype.hasOwnProperty.call(claims, "graceUntil")
    ? parseTimestamp(claims.graceUntil)
    : null;
  if (issuedAt === null) return { ok: false, code: "issued_at_invalid" };
  if (notBefore === null) return { ok: false, code: "not_before_invalid" };
  if (expiresAt === null) return { ok: false, code: "expires_at_invalid" };
  if (Object.prototype.hasOwnProperty.call(claims, "graceUntil") && graceUntil === null) {
    return { ok: false, code: "grace_until_invalid" };
  }
  if (issuedAt > notBefore || notBefore >= expiresAt) {
    return { ok: false, code: "date_order_invalid" };
  }
  if (graceUntil !== null && graceUntil <= expiresAt) {
    return { ok: false, code: "grace_order_invalid" };
  }

  return {
    ok: true,
    times: Object.freeze({ issuedAt, notBefore, expiresAt, graceUntil })
  };
}

function parseNow(now) {
  if (now === undefined) return Date.now();
  if (now instanceof Date) return now.getTime();
  if (typeof now === "number") return now;
  if (typeof now === "string") return parseTimestamp(now);
  return NaN;
}

function parseAppMajor(version) {
  if (typeof version !== "string" || version.length > 128) return null;
  const match = version.match(/^(\d{1,3})\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) return null;
  const major = Number(match[1]);
  return Number.isSafeInteger(major) ? major : null;
}

function constantTimeHashMatch(expectedHashes, actualHash) {
  if (!Array.isArray(expectedHashes) || expectedHashes.length === 0) return true;
  if (typeof actualHash !== "string" || !/^[a-f0-9]{64}$/.test(actualHash)) return false;
  const actual = Buffer.from(actualHash, "hex");
  let matched = false;
  for (const expectedHash of expectedHashes) {
    matched = crypto.timingSafeEqual(Buffer.from(expectedHash, "hex"), actual) || matched;
  }
  return matched;
}

function brandResult(result) {
  const frozen = Object.freeze(result);
  VERIFIED_RESULTS.add(frozen);
  return frozen;
}

function isVerifiedLicenseResult(value) {
  return Boolean(value) && typeof value === "object" && VERIFIED_RESULTS.has(value);
}

function invalidResult(code, buildCeiling, status = STATUS.INVALID, trustedClaims = null, keyId = null) {
  let policy;
  try {
    policy = communityPolicy(buildCeiling);
  } catch {
    policy = communityPolicy();
    code = "build_ceiling_invalid";
  }
  return brandResult({
    valid: false,
    status,
    code,
    keyId,
    claims: trustedClaims,
    policy
  });
}

/**
 * Verify an offline license without I/O.
 *
 * Options:
 * - keyring: Map or plain object of keyId -> Ed25519 public key (default empty)
 * - now: Date, epoch milliseconds, or canonical UTC timestamp
 * - installationHash: lowercase SHA-256 hex for the current installation
 * - appVersion: SemVer-like x.y.z string
 * - buildCeiling: community | pro | business (default community)
 */
function verifyLicense(input, {
  keyring = DEFAULT_KEYRING,
  now,
  installationHash = null,
  appVersion = "0.0.0",
  buildCeiling = DEFAULT_BUILD_CEILING
} = {}) {
  const parsedEnvelope = parseEnvelope(input);
  if (!parsedEnvelope.ok) return invalidResult(parsedEnvelope.code, buildCeiling);

  const { envelope, payloadBytes, signatureBytes } = parsedEnvelope;
  const publicKeyValue = keyringEntry(keyring, envelope.keyId);
  if (!publicKeyValue) return invalidResult("key_unknown", buildCeiling);

  let publicKey;
  try {
    publicKey = importEd25519PublicKey(publicKeyValue);
  } catch {
    return invalidResult("key_invalid", buildCeiling);
  }

  let signatureValid = false;
  try {
    signatureValid = crypto.verify(null, payloadBytes, publicKey, signatureBytes);
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) return invalidResult("signature_invalid", buildCeiling);

  const parsedPayload = parsePayload(payloadBytes);
  if (!parsedPayload.ok) return invalidResult(parsedPayload.code, buildCeiling);
  const claimValidation = validateClaims(parsedPayload.claims);
  if (!claimValidation.ok) return invalidResult(claimValidation.code, buildCeiling);

  const claims = Object.freeze({
    ...parsedPayload.claims,
    features: Object.freeze([...parsedPayload.claims.features]),
    installationHashes: Object.freeze([...parsedPayload.claims.installationHashes])
  });
  const trusted = (code, status) => invalidResult(code, buildCeiling, status, claims, envelope.keyId);

  const nowMs = parseNow(now);
  if (!Number.isFinite(nowMs)) return trusted("now_invalid", STATUS.INVALID);
  const appMajor = parseAppMajor(appVersion);
  if (appMajor === null) return trusted("app_version_invalid", STATUS.INVALID);

  const { notBefore, expiresAt, graceUntil } = claimValidation.times;
  if (nowMs < notBefore) return trusted("license_not_active", STATUS.NOT_ACTIVE);
  if (nowMs >= expiresAt && (graceUntil === null || nowMs >= graceUntil)) {
    return trusted("license_expired", STATUS.EXPIRED);
  }
  if (appMajor > claims.maxMajorVersion) {
    return trusted("app_version_not_licensed", STATUS.VERSION_BLOCKED);
  }
  if (claims.installationHashes.length > 0) {
    if (installationHash === null || installationHash === undefined || installationHash === "") {
      return trusted("installation_hash_required", STATUS.INSTALLATION_BLOCKED);
    }
    if (typeof installationHash !== "string" || !/^[a-f0-9]{64}$/.test(installationHash)) {
      return trusted("installation_hash_invalid", STATUS.INSTALLATION_BLOCKED);
    }
    if (!constantTimeHashMatch(claims.installationHashes, installationHash)) {
      return trusted("installation_not_licensed", STATUS.INSTALLATION_BLOCKED);
    }
  }

  let policy;
  try {
    policy = resolveFeaturePolicy({
      licensedEdition: claims.edition,
      licensedFeatures: claims.features,
      buildCeiling,
      source: "license"
    });
  } catch {
    return trusted("build_ceiling_invalid", STATUS.INVALID);
  }
  const inGrace = nowMs >= expiresAt;
  return brandResult({
    valid: true,
    status: inGrace ? STATUS.GRACE : STATUS.ACTIVE,
    code: null,
    keyId: envelope.keyId,
    claims,
    policy
  });
}

module.exports = Object.freeze({
  ENVELOPE_SCHEMA,
  CLAIMS_SCHEMA,
  PRODUCT,
  DEFAULT_KEYRING,
  STATUS,
  LIMITS: Object.freeze({
    envelopeBytes: MAX_ENVELOPE_BYTES,
    payloadBytes: MAX_PAYLOAD_BYTES,
    keyIdLength: MAX_KEY_ID_LENGTH,
    licenseIdLength: MAX_LICENSE_ID_LENGTH,
    installations: MAX_INSTALLATIONS
  }),
  parseEnvelope,
  validateClaims,
  verifyLicense,
  isVerifiedLicenseResult
});
