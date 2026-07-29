"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  assessRelease,
  formatHumanReport,
  parseArguments
} = require("./release-readiness");
const {
  packageInventory,
  parseArguments: parseMetadataArguments,
  requirePackageLock
} = require("./generate-release-metadata");

const rootDir = path.resolve(__dirname, "..");

const internal = assessRelease({
  rootDir,
  channel: "internal",
  sourceOnly: true
});
assert.strictEqual(internal.ready, true);
assert.strictEqual(internal.counts.blocker, 0);
assert(internal.checks.some(check => check.id === "CORE_INHERITED_SPDX" && check.status === "pass"));
assert(internal.checks.some(check => check.id === "PRIVATE_KEY_MATERIAL" && check.status === "pass"));
assert(internal.checks.some(check => check.id === "MANUAL_RELEASE_EVIDENCE" && check.status === "warning"));

const publicReport = assessRelease({
  rootDir,
  channel: "public",
  sourceOnly: true
});
assert.strictEqual(publicReport.ready, false);
assert(publicReport.checks.some(check => check.id === "MANUAL_RELEASE_EVIDENCE" && check.status === "blocker"));
assert(publicReport.checks.some(check => check.id === "MAC_HARDENED_RUNTIME" && check.status === "pass"));
assert(publicReport.checks.some(check => check.id === "MAC_DEVELOPER_ID"));

const parsed = parseArguments(["--channel", "public", "--source-only", "--json"]);
assert.strictEqual(parsed.channel, "public");
assert.strictEqual(parsed.sourceOnly, true);
assert.strictEqual(parsed.json, true);
assert(["arm64", "x64"].includes(parsed.arch));
assert.match(formatHumanReport(internal), /DocFlow release readiness \(internal\)/);

const internalWindows = assessRelease({
  rootDir,
  channel: "internal",
  platform: "windows",
  arch: "x64",
  sourceOnly: true
});
assert.strictEqual(internalWindows.ready, true);
assert.strictEqual(internalWindows.release.platform, "windows");
assert(internalWindows.checks.some(
  check => check.id === "WINDOWS_SIGNING_CONFIG" && check.status === "pass"
));
assert(!internalWindows.checks.some(check => check.id === "MAC_HARDENED_RUNTIME"));

const internalWindowsArtifacts = assessRelease({
  rootDir,
  channel: "internal",
  platform: "windows",
  arch: "x64",
  sourceOnly: false
});
assert.strictEqual(internalWindowsArtifacts.ready, true);
assert(internalWindowsArtifacts.checks.some(
  check => check.id ===
    `ARTIFACT_DocFlow-Local-Setup-${internalWindows.release.version}-x64.exe`
));
assert(internalWindowsArtifacts.checks.some(
  check => check.id ===
    `ARTIFACT_DocFlow-Local-${internalWindows.release.version}-Windows-x64.exe`
));

const parsedWindows = parseArguments([
  "--channel",
  "public",
  "--platform",
  "windows",
  "--arch",
  "x64",
  "--source-only"
]);
assert.strictEqual(parsedWindows.platform, "windows");
assert.throws(
  () => parseArguments(["--platform", "windows", "--arch", "arm64"]),
  /Windows release architecture/
);
const parsedWindowsMetadata = parseMetadataArguments([
  "--platform",
  "windows",
  "--arch",
  "x64",
  "--dry-run"
]);
assert.strictEqual(parsedWindowsMetadata.platform, "windows");

const inventory = packageInventory(rootDir);
assert(inventory.some(item => item.name === "docflow-local" || item.name === "docflow-desktop"));
if (fs.existsSync(path.join(rootDir, "packages", "core", "package.json"))) {
  assert.strictEqual(requirePackageLock(rootDir), path.join(rootDir, "package-lock.json"));
} else {
  assert(inventory.some(item => item.name === "@docflow-local/core" && item.external === true));
  assert.throws(
    () => requirePackageLock(rootDir),
    /package-lock\.json is required/
  );
}

process.stdout.write("DocFlow release readiness tests passed.\n");
