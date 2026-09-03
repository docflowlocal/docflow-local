"use strict";

const { X509Certificate, createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function loadPreviewCertificate(rootDir = path.resolve(__dirname, ".."), now = null) {
  const directory = path.join(rootDir, "build", "windows-preview");
  const metadata = JSON.parse(fs.readFileSync(path.join(directory, "certificate.json"), "utf8"));
  if (metadata.certificateFile !== "DocFlow-Local-Preview-CodeSigning.cer") {
    throw new Error("Unexpected preview certificate filename");
  }
  const bytes = fs.readFileSync(path.join(directory, metadata.certificateFile));
  const certificate = new X509Certificate(bytes);
  const digest = algorithm => createHash(algorithm).update(certificate.raw).digest("hex").toUpperCase();
  if (
    metadata.schemaVersion !== 1 ||
    metadata.purpose !== "windows-self-signed-preview-only" ||
    metadata.publiclyTrusted !== false || metadata.certificateAuthority !== false ||
    metadata.commonName !== "DocFlow Local Community Preview" ||
    metadata.subject !== "CN=DocFlow Local Community Preview" ||
    certificate.subject !== metadata.subject || certificate.issuer !== metadata.issuer ||
    certificate.subject !== certificate.issuer || !certificate.verify(certificate.publicKey) ||
    !certificate.raw.equals(bytes) || certificate.ca || certificate.publicKey.asymmetricKeyType !== "rsa" ||
    certificate.publicKey.asymmetricKeyDetails.modulusLength < 3072 ||
    certificate.keyUsage?.length !== 1 || certificate.keyUsage[0] !== "1.3.6.1.5.5.7.3.3" ||
    digest("sha256") !== metadata.sha256Fingerprint || digest("sha1") !== metadata.sha1Thumbprint ||
    certificate.serialNumber !== metadata.serialNumber ||
    Date.parse(certificate.validFrom) !== Date.parse(metadata.notBefore) ||
    Date.parse(certificate.validTo) !== Date.parse(metadata.notAfter)
  ) {
    throw new Error("Preview certificate does not match its pinned identity and code-signing constraints");
  }
  if (now && (now.getTime() < Date.parse(certificate.validFrom) || now.getTime() >= Date.parse(certificate.validTo))) {
    throw new Error("Preview certificate is not currently valid; rotate it before signing");
  }
  return { metadata, certificate, bytes };
}

if (require.main === module) {
  const { metadata } = loadPreviewCertificate(path.resolve(__dirname, ".."), new Date());
  process.stdout.write(`PREVIEW_CERTIFICATE_OK ${metadata.sha256Fingerprint}\n`);
}

module.exports = { loadPreviewCertificate };
