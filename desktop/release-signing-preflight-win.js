#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT_DIR = path.resolve(__dirname, "..");

function validateWindowsSigningEnvironment(env = process.env) {
  const errors = [];
  const pfx = String(env.WIN_CSC_LINK || "").trim();
  const subject = String(env.DOCFLOW_WIN_CERTIFICATE_SUBJECT || "").trim();
  if (!pfx && !subject) {
    errors.push("Set WIN_CSC_LINK or DOCFLOW_WIN_CERTIFICATE_SUBJECT.");
  }
  if (pfx && !String(env.WIN_CSC_KEY_PASSWORD || "").trim()) {
    errors.push("WIN_CSC_KEY_PASSWORD is required when WIN_CSC_LINK is used.");
  }
  if (!String(env.DOCFLOW_WIN_PUBLISHER_NAME || "").trim()) {
    errors.push("DOCFLOW_WIN_PUBLISHER_NAME is required.");
  }
  return { valid: errors.length === 0, errors, mode: pfx ? "pfx" : subject ? "store" : null };
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
  if (platform !== "win32") failures.push("The signed Windows release must run on Windows.");

  const signing = validateWindowsSigningEnvironment(env);
  failures.push(...signing.errors);

  const evidence = validateReleaseEvidence(rootDir);
  if (!evidence.valid) {
    failures.push(`Complete release evidence first: ${evidence.pending.join(", ")}`);
  }

  const worktree = validateCleanWorktree(rootDir);
  if (!worktree.valid) failures.push("Build from a reviewed clean worktree.");

  return {
    valid: failures.length === 0,
    failures,
    checks: {
      platform,
      signingEnvironment: signing.valid,
      signingMode: signing.mode,
      releaseEvidence: evidence.valid,
      cleanWorktree: worktree.valid
    }
  };
}

if (require.main === module) {
  try {
    const result = runPreflight();
    if (!result.valid) {
      process.stderr.write("Signed Windows release preflight failed:\n");
      for (const failure of result.failures) process.stderr.write(`- ${failure}\n`);
      process.exitCode = 2;
    } else {
      process.stdout.write("Signed Windows release preflight passed.\n");
    }
  } catch (error) {
    process.stderr.write(`Signed Windows release preflight failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  runPreflight,
  validateCleanWorktree,
  validateReleaseEvidence,
  validateWindowsSigningEnvironment
};
