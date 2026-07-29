#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT_DIR = path.resolve(__dirname, "..");

function requireCompleteEnvironmentGroup(name, keys, env) {
  const present = keys.filter(key => String(env[key] || "").trim());
  if (present.length === 0) return false;
  if (present.length !== keys.length) {
    const missing = keys.filter(key => !String(env[key] || "").trim());
    throw new Error(`${name} notarization credentials are incomplete: ${missing.join(", ")}`);
  }
  return true;
}

function validateSigningEnvironment(env = process.env) {
  const errors = [];
  const hasApplicationCertificate =
    Boolean(String(env.CSC_LINK || "").trim()) ||
    /^Developer ID Application:/i.test(String(env.CSC_NAME || "").trim());
  if (!hasApplicationCertificate) {
    errors.push("Set CSC_LINK or a Developer ID Application identity in CSC_NAME.");
  }

  const installerIdentity = String(env.DOCFLOW_PKG_IDENTITY || "").trim();
  const hasInstallerCertificate =
    Boolean(String(env.CSC_INSTALLER_LINK || "").trim()) ||
    /^Developer ID Installer:/i.test(installerIdentity);
  if (!hasInstallerCertificate) {
    errors.push(
      "Set CSC_INSTALLER_LINK or a Developer ID Installer identity in DOCFLOW_PKG_IDENTITY."
    );
  }

  let hasNotaryCredentials = false;
  try {
    hasNotaryCredentials =
      requireCompleteEnvironmentGroup(
        "App Store Connect API",
        ["APPLE_API_KEY", "APPLE_API_KEY_ID", "APPLE_API_ISSUER"],
        env
      ) ||
      requireCompleteEnvironmentGroup(
        "Apple ID",
        ["APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"],
        env
      ) ||
      requireCompleteEnvironmentGroup(
        "Apple keychain",
        ["APPLE_KEYCHAIN", "APPLE_KEYCHAIN_PROFILE"],
        env
      );
  } catch (error) {
    errors.push(error.message);
  }
  if (!hasNotaryCredentials) {
    errors.push(
      "Configure one complete notary credential set: API key, Apple ID, or keychain profile."
    );
  }
  return { valid: errors.length === 0, errors };
}

function validateReleaseEvidence(rootDir = ROOT_DIR) {
  const evidence = JSON.parse(
    fs.readFileSync(path.join(rootDir, "release", "release-evidence.json"), "utf8")
  );
  const requiredBeforeSigning = [
    "legalProvenanceReview",
    "githubSplitRepositories",
    "npmScopeTwoFactorAuthentication",
    "productionLicenseKeyring"
  ];
  const pending = requiredBeforeSigning.filter(
    key =>
      evidence[key]?.status !== "complete" ||
      !String(evidence[key]?.reference || "").trim()
  );
  return { valid: pending.length === 0, pending };
}

function validateCleanWorktree(rootDir = ROOT_DIR) {
  const status = execFileSync("git", ["status", "--porcelain"], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
  return { valid: status.length === 0, status };
}

function runPreflight({
  rootDir = ROOT_DIR,
  env = process.env,
  platform = process.platform
} = {}) {
  const failures = [];
  if (platform !== "darwin") failures.push("The signed macOS release must run on macOS.");

  const signing = validateSigningEnvironment(env);
  failures.push(...signing.errors);

  const evidence = validateReleaseEvidence(rootDir);
  if (!evidence.valid) {
    failures.push(`Complete release evidence first: ${evidence.pending.join(", ")}`);
  }

  const worktree = validateCleanWorktree(rootDir);
  if (!worktree.valid) {
    failures.push("Build from a reviewed clean worktree.");
  }

  const entitlements = path.join(rootDir, "build", "entitlements.mac.plist");
  if (!fs.existsSync(entitlements)) failures.push("Missing hardened-runtime entitlements file.");

  return {
    valid: failures.length === 0,
    failures,
    checks: {
      platform,
      signingEnvironment: signing.valid,
      releaseEvidence: evidence.valid,
      cleanWorktree: worktree.valid,
      entitlements: fs.existsSync(entitlements)
    }
  };
}

if (require.main === module) {
  try {
    const result = runPreflight();
    if (!result.valid) {
      process.stderr.write("Signed macOS release preflight failed:\n");
      for (const failure of result.failures) process.stderr.write(`- ${failure}\n`);
      process.exitCode = 2;
    } else {
      process.stdout.write("Signed macOS release preflight passed.\n");
    }
  } catch (error) {
    process.stderr.write(`Signed macOS release preflight failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  requireCompleteEnvironmentGroup,
  runPreflight,
  validateCleanWorktree,
  validateReleaseEvidence,
  validateSigningEnvironment
};
