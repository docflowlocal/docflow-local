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

const sourceFallbacks = {
  ".github/workflows/windows-self-signed-preview.yml": "release/split-repositories/docflow-desktop/windows-self-signed-preview.yml",
  "CODE_SIGNING_POLICY.md": "release/split-repositories/docflow-desktop/CODE_SIGNING_POLICY.md"
};
const readSource = relativePath => {
  const primaryPath = path.join(rootDir, relativePath);
  const sourcePath = fs.existsSync(primaryPath) ? primaryPath : path.join(rootDir, sourceFallbacks[relativePath] || relativePath);
  return fs.readFileSync(sourcePath, "utf8");
};
const packageManifest = JSON.parse(readSource("package.json"));
const workflow = readSource(".github/workflows/windows-self-signed-preview.yml");
const buildScript = readSource("desktop/package-win-self-signed-preview.ps1");
const cleanupScript = readSource("desktop/cleanup-windows-preview-signing.ps1");
const prepareScript = readSource("desktop/prepare-windows-preview-signing.ps1");
const smokeScript = readSource("desktop/release-smoke-win.ps1");
// Fresh split exports do not yet have a registry lock; real builds require it
// through npm ci and the release metadata gate.
if (fs.existsSync(path.join(rootDir, "package-lock.json"))) {
  const packageLock = JSON.parse(readSource("package-lock.json"));
  assert.equal(packageLock.version, packageManifest.version);
  assert.equal(packageLock.packages[""].version, packageManifest.version);
}
const previewVersion = workflow.match(/default: v([0-9]+\.[0-9]+\.[0-9]+-preview\.[0-9]+)/)?.[1];
assert(previewVersion, "the Preview workflow must have an explicit preview version default");
if (packageManifest.version.includes("-preview.")) assert.equal(packageManifest.version, previewVersion);
assert.match(workflow, /workflow_dispatch:/);
assert.match(workflow, /environment: windows-self-signed-preview/);
assert.match(workflow, /Remove temporary signing material[\s\S]*?if: \$\{\{ always\(\) \}\}/);
assert.match(readSource(".github/workflows/ci.yml"), /desktop\/release-smoke-win\.ps1/);

for (const script of [buildScript, cleanupScript, prepareScript]) {
  assert.match(script, /\$env:GITHUB_ACTIONS/);
  assert.match(script, /\$env:RUNNER_ENVIRONMENT/);
  assert.match(script, /github-hosted/);
  assert.match(script, /\$env:RUNNER_OS/);
  assert.doesNotMatch(script, /Cert:\\CurrentUser\\Root/);
  assert.doesNotMatch(script, /Read-Host|ReadKey|\bPause\b/);
}
assert.match(buildScript, /\$env:SIGNTOOL_TIMEOUT = "120000"/);
assert(buildScript.indexOf('$env:SIGNTOOL_TIMEOUT = "120000"') < buildScript.indexOf("electron-builder.cmd"));
assert.match(buildScript, /if \(\$env:GITHUB_ACTIONS -eq "true" -and \$env:RUNNER_ENVIRONMENT -eq "github-hosted" -and \$env:RUNNER_OS -eq "Windows"\) \{[\s\S]*?Import-Certificate[^\n]*"Cert:\\LocalMachine\\Root" -Confirm:\$false/);
assert.match(buildScript, /Get-Item -LiteralPath "Cert:\\LocalMachine\\Root\\\$\(\$Pinned\.Metadata\.sha1Thumbprint\)"/);
assert.match(buildScript, /Assert-DocFlowPreviewCertificate -Certificate \$TrustedCertificate -Metadata \$Pinned\.Metadata/);
assert.match(prepareScript, /Import-PfxCertificate[^\n]*"Cert:\\CurrentUser\\My"/);
assert.match(cleanupScript, /\$PrivateKeyPath = "Cert:\\CurrentUser\\My\\\$Thumbprint"/);
assert.match(cleanupScript, /Remove-Item -LiteralPath \$PrivateKeyPath -Force -DeleteKey/);
assert.match(cleanupScript, /\$TrustPath = "Cert:\\LocalMachine\\Root\\\$Thumbprint"/);
assert.match(cleanupScript, /Remove-Item -LiteralPath \$TrustPath -Force -Confirm:\$false/);
assert(cleanupScript.indexOf('throw "Preview signing cleanup is restricted') < cleanupScript.indexOf("Remove-Item"));
assert.match(buildScript, /\$Signature\.Status -ne "Valid"/);
assert.match(buildScript, /\$null -eq \$Signature\.TimeStamperCertificate/);
assert.match(buildScript, /\$Signature\.SignerCertificate\.Thumbprint -ne \$Pinned\.Metadata\.sha1Thumbprint/);
assert.match(buildScript, /\$Signtool "verify" "\/pa" "\/all" "\/v" "\/tw"/);

const stageMarkers = [
  "PREVIEW_PACKAGING_START",
  "PREVIEW_PACKAGING_COMPLETE",
  "PREVIEW_SMOKE_START",
  "PREVIEW_SMOKE_COMPLETE",
  "PREVIEW_TRUST_START",
  "PREVIEW_TRUST_READY",
  "PREVIEW_VERIFY_START",
  "PREVIEW_VERIFY_FILE_START",
  "SELF_SIGNED_PREVIEW_OK",
  "PREVIEW_VERIFY_COMPLETE"
];
let previousMarker = -1;
for (const marker of stageMarkers) {
  const offset = buildScript.indexOf(marker);
  assert(offset > previousMarker, `${marker} must appear in execution order`);
  previousMarker = offset;
}
assert.match(smokeScript, /Start-Process[\s\S]*?-PassThru/);
assert.doesNotMatch(smokeScript, /(^|\s)-Wait(?=\s|$)/m);
assert.match(smokeScript, /\$timeoutMs = 60000/);
assert.match(smokeScript, /\$null = \$process\.Handle/);
assert(smokeScript.indexOf("$process.Handle") < smokeScript.indexOf("$process.WaitForExit($timeoutMs)"));
assert.match(smokeScript, /if \(-not \$process\.WaitForExit\(\$timeoutMs\)\) \{/);
assert.match(smokeScript, /taskkill\.exe" \/PID \$process\.Id \/T \/F/);
assert.match(smokeScript, /\$process\.WaitForExit\(5000\)/);
assert.doesNotMatch(smokeScript, /\.WaitForExit\(\)/);
assert.match(smokeScript, /throw "Packaged Windows release smoke process timed out/);
assert.match(smokeScript, /\$null -eq \$exitCode -or \$exitCode -ne 0/);
assert.match(smokeScript, /finally \{\s*\$process\.Dispose\(\)/);
for (const marker of ["DOCFLOW_PACKAGED_SMOKE_PROCESS_START", "DOCFLOW_PACKAGED_SMOKE_PROCESS_TIMEOUT", "DOCFLOW_PACKAGED_SMOKE_PROCESS_EXIT"]) {
  assert(smokeScript.includes(marker));
}
for (const document of ["DESKTOP_BUILD.md", "CODE_SIGNING_POLICY.md", "release/WINDOWS_SELF_SIGNED_PREVIEW.md"]) {
  const text = readSource(document);
  assert(text.includes(previewVersion));
  assert.doesNotMatch(text, /0\.6\.1-preview\.1/);
}
const changelog = readSource("CHANGELOG.md");
assert(changelog.includes(`## ${previewVersion}`));
assert(changelog.includes("## 0.6.1-preview.1"), "the previous Preview changelog entry must remain intact");

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
