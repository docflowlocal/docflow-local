#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { loadPreviewCertificate } = require("../desktop/windows-preview-certificate");
const { atomicWrite, requirePackageLock, runNpm, sha256Bytes } = require("./generate-release-metadata");

const rootDir = path.resolve(__dirname, "..");
if (process.platform !== "win32") throw new Error("Windows Preview metadata must be generated on its Windows build host");
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
const version = packageJson.version;
const { metadata } = loadPreviewCertificate(rootDir, new Date());
const expected = [
  `DocFlow-Local-Setup-${version}-x64-Self-Signed-Preview.exe`,
  `DocFlow-Local-${version}-Windows-x64-Self-Signed-Preview.exe`,
  "DocFlow Local.exe"
];
const verification = JSON.parse(fs.readFileSync(
  path.join(rootDir, "dist", "windows-self-signed-preview-verification.json"),
  "utf8"
));
if (verification.schemaVersion !== 1 || verification.artifacts.length !== expected.length) {
  throw new Error("Preview signature verification record is incomplete");
}
for (const name of expected) {
  const item = verification.artifacts.find(entry => entry.name === name);
  if (
    !item || item.authenticodeStatus !== "Valid" ||
    item.signerThumbprint !== metadata.sha1Thumbprint || !item.timestampThumbprint ||
    !/^[a-f0-9]{64}$/.test(item.sha256)
  ) { throw new Error(`Preview signature verification record is invalid for ${name}`); }
  const artifactPath = name === "DocFlow Local.exe"
    ? path.join(rootDir, "dist", "win-unpacked", name)
    : path.join(rootDir, "dist", name);
  if (sha256Bytes(fs.readFileSync(artifactPath)) !== item.sha256) {
    throw new Error(`Verified binary changed after signature verification: ${name}`);
  }
}

requirePackageLock(rootDir);
const bundleDir = path.join(rootDir, "dist", `windows-community-${version}-x64-self-signed-preview`);
fs.rmSync(bundleDir, { recursive: true, force: true });
fs.mkdirSync(bundleDir, { recursive: true });
const distributableNames = expected.slice(0, 2);
for (const name of distributableNames) {
  const source = path.join(rootDir, "dist", name);
  const bytes = fs.readFileSync(source);
  const recorded = verification.artifacts.find(item => item.name === name);
  if (sha256Bytes(bytes) !== recorded.sha256) throw new Error(`Artifact hash changed after verification: ${name}`);
  fs.copyFileSync(source, path.join(bundleDir, name));
}
const certificateName = metadata.certificateFile;
fs.copyFileSync(
  path.join(rootDir, "build", "windows-preview", certificateName),
  path.join(bundleDir, certificateName)
);
fs.copyFileSync(
  path.join(rootDir, "release", "WINDOWS_SELF_SIGNED_PREVIEW.md"),
  path.join(bundleDir, "WINDOWS_SELF_SIGNED_PREVIEW.md")
);

const sbom = JSON.parse(runNpm([
  "sbom", "--omit=dev", "--package-lock-only", "--sbom-format=cyclonedx", "--sbom-type=application"
], rootDir));
const sbomName = `docflow-local-${version}-windows-x64.cdx.json`;
const sbomBytes = Buffer.from(`${JSON.stringify(sbom, null, 2)}\n`);
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: rootDir, encoding: "utf8" }).trim();
const sourceRef = String(process.env.DOCFLOW_SOURCE_REF || "").trim();
if (sourceRef !== `v${version}`) throw new Error("DOCFLOW_SOURCE_REF must exactly match the preview package version tag");
const taggedCommit = execFileSync("git", ["rev-parse", `refs/tags/${sourceRef}^{commit}`], { cwd: rootDir, encoding: "utf8" }).trim();
if (taggedCommit !== sourceCommit) throw new Error("The preview version tag does not resolve to the checked-out commit");
if (execFileSync("git", ["status", "--porcelain"], { cwd: rootDir, encoding: "utf8" }).trim()) {
  throw new Error("Preview metadata requires a clean reviewed worktree");
}
const generatedAt = process.env.SOURCE_DATE_EPOCH
  ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString()
  : new Date().toISOString();
const artifacts = distributableNames.map(name => {
  const item = verification.artifacts.find(entry => entry.name === name);
  const bytes = fs.readFileSync(path.join(bundleDir, name));
  return { name, bytes: bytes.length, sha256: item.sha256 };
});
const buildInfo = {
  schemaVersion: 1,
  product: "DocFlow Local Community",
  version,
  platform: "windows",
  arch: "x64",
  sourceRef,
  sourceCommit,
  sourceRepository: packageJson.repository.url,
  buildRecord: process.env.GITHUB_RUN_ID
    ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null,
  generatedAt,
  signed: true,
  signatureTrust: "self-signed",
  publiclyTrusted: false,
  timestamped: true,
  distribution: "self-signed-preview",
  publicReleaseEligible: false,
  signer: {
    subject: metadata.subject,
    sha1Thumbprint: metadata.sha1Thumbprint,
    sha256Fingerprint: metadata.sha256Fingerprint,
    notAfter: metadata.notAfter
  },
  artifacts,
  verifiedBinaries: verification.artifacts,
  sbom: { name: sbomName, sha256: sha256Bytes(sbomBytes) }
};
const verificationBytes = Buffer.from(`${JSON.stringify(verification, null, 2)}\n`);
atomicWrite(path.join(bundleDir, sbomName), sbomBytes);
atomicWrite(path.join(bundleDir, "build-info.json"), Buffer.from(`${JSON.stringify(buildInfo, null, 2)}\n`));
atomicWrite(path.join(bundleDir, "signature-verification.json"), verificationBytes);
const hashLines = fs.readdirSync(bundleDir).sort().map(name => (
  `${sha256Bytes(fs.readFileSync(path.join(bundleDir, name)))}  ${name}`
)).join("\n") + "\n";
atomicWrite(path.join(bundleDir, "SHA256SUMS.txt"), Buffer.from(hashLines));
process.stdout.write(`WINDOWS_SELF_SIGNED_PREVIEW_BUNDLE_OK ${bundleDir}\n`);
