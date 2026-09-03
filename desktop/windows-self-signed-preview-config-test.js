"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { loadPreviewCertificate } = require("./windows-preview-certificate");

const rootDir = path.resolve(__dirname, "..");
const { metadata, certificate, bytes } = loadPreviewCertificate(rootDir);
const config = require("./electron-builder.win-self-signed-preview.cjs");

assert.equal(metadata.purpose, "windows-self-signed-preview-only");
assert.equal(metadata.publiclyTrusted, false);
assert.equal(metadata.certificateAuthority, false);
assert.equal(certificate.subject, metadata.subject);
assert.equal(certificate.issuer, metadata.issuer);
assert.equal(certificate.subject, certificate.issuer);
assert.equal(certificate.ca, false);
assert.deepEqual(certificate.keyUsage, ["1.3.6.1.5.5.7.3.3"]);
assert.equal(certificate.publicKey.asymmetricKeyType, "rsa");
assert(certificate.publicKey.asymmetricKeyDetails.modulusLength >= 3072);
assert.equal(certificate.publicKey.asymmetricKeyDetails.publicExponent, 65537n);
assert.equal(bytes[0], 0x30, "the committed certificate must be DER encoded");
assert.deepEqual(certificate.raw, bytes, "the public file must contain exactly one DER certificate");
assert.doesNotMatch(bytes.toString("latin1"), /PRIVATE KEY/i);
assert.match(metadata.sha1Thumbprint, /^[A-F0-9]{40}$/);
assert.match(metadata.sha256Fingerprint, /^[A-F0-9]{64}$/);
assert.equal(metadata.sha1Thumbprint, certificate.fingerprint.replace(/:/g, ""));
assert.equal(metadata.sha256Fingerprint, certificate.fingerprint256.replace(/:/g, ""));
assert.equal(
  metadata.sha256Fingerprint,
  createHash("sha256").update(bytes).digest("hex").toUpperCase()
);
assert.equal(metadata.commonName, "DocFlow Local Community Preview");
assert.equal(certificate.verify(certificate.publicKey), true);

assert.match(config.artifactName, /Self-Signed-Preview/);
assert.match(config.nsis.artifactName, /Self-Signed-Preview/);
assert.equal(config.win.forceCodeSigning, true);
assert.equal(config.win.signExecutable, true);
assert.equal(config.win.verifyUpdateCodeSignature, true);
assert.deepEqual(config.win.electronLanguages, ["en-US", "zh-CN"]);
assert.equal(config.nsis.multiLanguageInstaller, true);
assert.deepEqual(config.nsis.installerLanguages, ["en_US", "zh_CN"]);
assert.equal(config.nsis.displayLanguageSelector, true);
assert.deepEqual(config.win.signtoolOptions.signingHashAlgorithms, ["sha256"]);
assert.equal(
  config.win.signtoolOptions.rfc3161TimeStampServer,
  "http://timestamp.digicert.com"
);
assert.equal(config.win.signtoolOptions.certificateSha1, metadata.sha1Thumbprint);
assert.equal(config.win.signtoolOptions.publisherName, metadata.commonName);
assert.equal(
  Object.prototype.hasOwnProperty.call(config.win.signtoolOptions, "certificateFile"),
  false
);
assert.equal(
  Object.prototype.hasOwnProperty.call(config.win.signtoolOptions, "certificatePassword"),
  false
);
assert.equal(
  Object.prototype.hasOwnProperty.call(config.win.signtoolOptions, "certificateSubjectName"),
  false,
  "preview signing must select the exact certificate, not a subject substring"
);

const notBefore = Date.parse(metadata.notBefore);
const notAfter = Date.parse(metadata.notAfter);
assert(Number.isFinite(notBefore));
assert(Number.isFinite(notAfter));
assert(notAfter > notBefore);
assert.throws(
  () => loadPreviewCertificate(rootDir, new Date(notBefore - 1)),
  /not currently valid/
);
assert.throws(
  () => loadPreviewCertificate(rootDir, new Date(notAfter)),
  /not currently valid/
);

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "docflow-preview-certificate-test-"));
const fixtureDirectory = path.join(fixtureRoot, "build", "windows-preview");
fs.mkdirSync(fixtureDirectory, { recursive: true });
const fixtureMetadataPath = path.join(fixtureDirectory, "certificate.json");
const fixtureCertificatePath = path.join(fixtureDirectory, metadata.certificateFile);
const validTime = new Date(notBefore + Math.floor((notAfter - notBefore) / 2));
try {
  fs.writeFileSync(fixtureCertificatePath, bytes);
  for (const [field, value] of [
    ["schemaVersion", 2],
    ["purpose", "windows-public-release"],
    ["commonName", "Unpinned Publisher"],
    ["publiclyTrusted", true],
    ["certificateAuthority", true],
    ["sha1Thumbprint", "0".repeat(40)],
    ["sha256Fingerprint", "0".repeat(64)],
    ["certificateFile", "../../private.pfx"]
  ]) {
    fs.writeFileSync(fixtureMetadataPath, JSON.stringify({ ...metadata, [field]: value }));
    assert.throws(
      () => loadPreviewCertificate(fixtureRoot, validTime),
      /Unexpected preview certificate filename|does not match/,
      `tampered ${field} must be rejected`
    );
  }

  fs.writeFileSync(fixtureMetadataPath, JSON.stringify(metadata));
  const tamperedBytes = Buffer.from(bytes);
  tamperedBytes[tamperedBytes.length - 1] ^= 1;
  fs.writeFileSync(fixtureCertificatePath, tamperedBytes);
  assert.throws(
    () => loadPreviewCertificate(fixtureRoot, validTime),
    /does not match/,
    "a certificate with a modified signature must be rejected"
  );
  fs.writeFileSync(fixtureCertificatePath, Buffer.concat([bytes, Buffer.from("unexpected trailing data")]));
  assert.throws(
    () => loadPreviewCertificate(fixtureRoot, validTime),
    /does not match/,
    "the public certificate must not conceal trailing material"
  );
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}

process.stdout.write("Windows self-signed Preview certificate/config tests passed.\n");
