#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const RELEASE_EVIDENCE = "release/release-evidence.json";
const INHERITED_CORE_FILES = [
  "packages/core/src/data.js",
  "packages/core/src/expression.js",
  "packages/core/src/index.js",
  "packages/core/src/template-engine.js"
];
const PUBLIC_PACKAGES = [
  ["packages/contracts", "MPL-2.0"],
  ["packages/core", "MPL-2.0 AND AGPL-3.0-or-later"],
  ["packages/license-verifier", "MPL-2.0"],
  ["packages/desktop-extension-sdk", "MPL-2.0"]
];
const COMMON_RELEASE_EVIDENCE_KEYS = [
  "legalProvenanceReview",
  "githubSplitRepositories",
  "npmScopeTwoFactorAuthentication"
];
const PLATFORM_RELEASE_EVIDENCE_KEYS = {
  macOS: [
    "appleDeveloperId",
    "appleNotarization"
  ],
  windows: [
    "windowsAuthenticode",
    "windowsPackagedSmoke"
  ]
};
const SKIPPED_SCAN_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  ".wrangler"
]);
const PRIVATE_KEY_FILE_PATTERN =
  /\.(?:p12|pfx|jks|keystore|mobileprovision|pem|key)$/i;
const LOCK_DEPENDENCY_FIELDS = Object.freeze([
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies"
]);
const SRI_DIGEST_LENGTHS = Object.freeze({
  sha256: 32,
  sha384: 48,
  sha512: 64
});

function parseArguments(argv) {
  let archProvided = false;
  const options = {
    rootDir: ROOT_DIR,
    channel: "internal",
    platform: process.platform === "win32" ? "windows" : "macOS",
    arch: process.arch === "arm64" ? "arm64" : "x64",
    sourceOnly: false,
    lockfileOnly: false,
    json: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--channel") {
      options.channel = argv[++index];
    } else if (argument === "--platform") {
      options.platform = argv[++index];
    } else if (argument === "--root") {
      options.rootDir = path.resolve(argv[++index]);
    } else if (argument === "--arch") {
      options.arch = argv[++index];
      archProvided = true;
    } else if (argument === "--source-only") {
      options.sourceOnly = true;
    } else if (argument === "--lockfile-only") {
      options.lockfileOnly = true;
    } else if (argument === "--json") {
      options.json = true;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!["internal", "public"].includes(options.channel)) {
    throw new Error("--channel must be internal or public");
  }
  if (!["macOS", "windows"].includes(options.platform)) {
    throw new Error("--platform must be macOS or windows");
  }
  if (options.platform === "windows" && !archProvided) options.arch = "x64";
  if (!["arm64", "x64"].includes(options.arch)) {
    throw new Error("--arch must be arm64 or x64");
  }
  if (options.platform === "windows" && options.arch !== "x64") {
    throw new Error("Windows release architecture must be x64");
  }
  return options;
}

function readJson(rootDir, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), "utf8"));
}

function sha256(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function commandResult(command, args, cwd, { env = process.env } = {}) {
  try {
    return {
      ok: true,
      output: execFileSync(command, args, {
        cwd,
        env,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      }).trim()
    };
  } catch (error) {
    const output = [error.stdout, error.stderr]
      .filter(Boolean)
      .map(value => String(value).trim())
      .filter(Boolean)
      .join("\n");
    return { ok: false, output };
  }
}

function listPrivateKeyFiles(rootDir) {
  const matches = [];
  const visit = currentPath => {
    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      if (entry.isDirectory() && SKIPPED_SCAN_DIRECTORIES.has(entry.name)) continue;
      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (PRIVATE_KEY_FILE_PATTERN.test(entry.name)) {
        matches.push(path.relative(rootDir, absolutePath));
      }
    }
  };
  visit(rootDir);
  return matches.sort();
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function packageNameFromLockPath(packagePath) {
  const segments = String(packagePath).split("/");
  let index = 0;
  let packageName = null;
  while (index < segments.length) {
    if (segments[index] !== "node_modules") return null;
    index += 1;
    const first = segments[index];
    if (!first || first === "." || first === ".." || first.includes("\\")) return null;
    if (first.startsWith("@")) {
      const second = segments[index + 1];
      if (
        first.length < 2 ||
        !second ||
        second === "." ||
        second === ".." ||
        second.includes("\\")
      ) {
        return null;
      }
      packageName = `${first}/${second}`;
      index += 2;
    } else {
      packageName = first;
      index += 1;
    }
  }
  return packageName;
}

function parentPackagePath(packagePath) {
  if (!packagePath) return null;
  const segments = packagePath.split("/");
  const nodeModulesIndex = segments.lastIndexOf("node_modules");
  if (nodeModulesIndex <= 0) return "";
  return segments.slice(0, nodeModulesIndex).join("/");
}

function resolveLockedDependency(packages, packagePath, dependencyName) {
  let currentPath = packagePath;
  while (currentPath !== null) {
    const candidate = currentPath
      ? `${currentPath}/node_modules/${dependencyName}`
      : `node_modules/${dependencyName}`;
    if (Object.prototype.hasOwnProperty.call(packages, candidate)) return candidate;
    currentPath = parentPackagePath(currentPath);
  }
  return null;
}

function hasValidSriDigest(integrity) {
  const match = /^(sha256|sha384|sha512)-([A-Za-z0-9+/]+={0,2})$/.exec(
    String(integrity || "")
  );
  if (!match) return false;
  const [, algorithm, encodedDigest] = match;
  const digest = Buffer.from(encodedDigest, "base64");
  const canonicalDigest = digest.toString("base64").replace(/=+$/, "");
  return (
    digest.length === SRI_DIGEST_LENGTHS[algorithm] &&
    canonicalDigest === encodedDigest.replace(/=+$/, "")
  );
}

function registryResolutionError(packagePath, packageName, lockedPackage) {
  const version = String(lockedPackage.version || "");
  let resolvedUrl;
  try {
    resolvedUrl = new URL(String(lockedPackage.resolved || ""));
  } catch {
    return `${packagePath} is not resolved from trusted registry.npmjs.org`;
  }
  if (
    resolvedUrl.protocol !== "https:" ||
    resolvedUrl.hostname.toLowerCase() !== "registry.npmjs.org" ||
    resolvedUrl.port ||
    resolvedUrl.username ||
    resolvedUrl.password ||
    resolvedUrl.search ||
    resolvedUrl.hash
  ) {
    return `${packagePath} is not resolved from trusted registry.npmjs.org`;
  }
  if (!version) return `${packagePath} is missing a locked package version`;
  const tarballName = packageName.startsWith("@")
    ? packageName.slice(packageName.indexOf("/") + 1)
    : packageName;
  const expectedPath = `/${packageName}/-/${tarballName}-${version}.tgz`;
  let resolvedPath;
  try {
    resolvedPath = decodeURIComponent(resolvedUrl.pathname);
  } catch {
    return `${packagePath} has an invalid registry tarball path`;
  }
  if (resolvedPath !== expectedPath) {
    return `${packagePath} registry tarball path does not match ${packageName}@${version}`;
  }
  return null;
}

function validateReleaseLockfile(rootDir, { requireRegistryPackages = false } = {}) {
  const errors = [];
  const packageLockPath = path.join(rootDir, "package-lock.json");
  if (!fs.existsSync(packageLockPath)) {
    return {
      valid: false,
      errors: ["package-lock.json is required"],
      path: packageLockPath
    };
  }

  try {
    const packageJson = readJson(rootDir, "package.json");
    const packageLock = readJson(rootDir, "package-lock.json");
    const packages = isRecord(packageLock.packages) ? packageLock.packages : null;
    const lockedRoot = packages?.[""];
    if (
      !Number.isInteger(packageLock.lockfileVersion) ||
      packageLock.lockfileVersion < 2 ||
      !isRecord(lockedRoot)
    ) {
      errors.push("lockfileVersion must use the packages-based npm format");
    } else {
      if (packageLock.name !== packageJson.name || packageLock.version !== packageJson.version) {
        errors.push("top-level lock name/version does not match package.json");
      }
      if (lockedRoot.name !== packageJson.name || lockedRoot.version !== packageJson.version) {
        errors.push("root name/version does not match package.json");
      }
      for (const field of LOCK_DEPENDENCY_FIELDS) {
        const expectedEntries = Object.entries(packageJson[field] || {})
          .sort(([left], [right]) => left.localeCompare(right));
        const actualEntries = Object.entries(lockedRoot[field] || {})
          .sort(([left], [right]) => left.localeCompare(right));
        if (JSON.stringify(actualEntries) !== JSON.stringify(expectedEntries)) {
          errors.push(`${field} does not match package.json`);
        }
      }
    }

    if (requireRegistryPackages && isRecord(lockedRoot) && packages) {
      if (Object.prototype.hasOwnProperty.call(lockedRoot, "workspaces")) {
        errors.push("split Desktop lockfile must not contain workspaces");
      }
      const dependencyEdges = new Map();
      for (const [packagePath, lockedPackage] of Object.entries(packages)) {
        if (!isRecord(lockedPackage)) {
          errors.push(`${packagePath || "root"} lock entry must be an object`);
          continue;
        }
        const edges = [];
        dependencyEdges.set(packagePath, edges);
        for (const field of LOCK_DEPENDENCY_FIELDS) {
          const declared = lockedPackage[field];
          if (declared !== undefined && !isRecord(declared)) {
            errors.push(`${packagePath || "root"} ${field} must be an object`);
            continue;
          }
          for (const dependencyName of Object.keys(declared || {}).sort()) {
            if (
              packageNameFromLockPath(`node_modules/${dependencyName}`) !==
              dependencyName
            ) {
              errors.push(
                `${packagePath || "root"} ${field} contains invalid package name ${dependencyName}`
              );
              continue;
            }
            const dependencyPath = resolveLockedDependency(
              packages,
              packagePath,
              dependencyName
            );
            const optionalPeer =
              field === "peerDependencies" &&
              lockedPackage.peerDependenciesMeta?.[dependencyName]?.optional === true;
            if (!dependencyPath) {
              if (optionalPeer) continue;
              if (packagePath === "") {
                errors.push(
                  `node_modules/${dependencyName} is missing for a direct dependency`
                );
              } else {
                errors.push(
                  `${packagePath} ${field}.${dependencyName} cannot resolve through node_modules`
                );
              }
              continue;
            }
            edges.push(dependencyPath);
          }
        }
        if (packagePath === "") continue;
        const resolved = String(lockedPackage.resolved || "");
        const packageName = packageNameFromLockPath(packagePath);
        if (!packageName) {
          errors.push(`${packagePath} is not a valid node_modules package path`);
          continue;
        }
        if (
          lockedPackage.link === true ||
          /^(?:file:|git\+file:|link:|workspace:|\.{1,2}[\\/]|\/|[A-Za-z]:[\\/])/i.test(resolved)
        ) {
          errors.push(`${packagePath} resolves to a local or linked package`);
        }
        if (lockedPackage.name && lockedPackage.name !== packageName) {
          errors.push(`${packagePath} declares mismatched package name ${lockedPackage.name}`);
        }
        const resolutionError = registryResolutionError(
          packagePath,
          packageName,
          lockedPackage
        );
        if (resolutionError) errors.push(resolutionError);
        if (!hasValidSriDigest(lockedPackage.integrity)) {
          errors.push(`${packagePath} is missing a valid package integrity hash`);
        }
      }

      const reachable = new Set([""]);
      const pending = [""];
      while (pending.length > 0) {
        const currentPath = pending.shift();
        for (const dependencyPath of dependencyEdges.get(currentPath) || []) {
          if (reachable.has(dependencyPath)) continue;
          reachable.add(dependencyPath);
          pending.push(dependencyPath);
        }
      }
      for (const packagePath of Object.keys(packages).sort()) {
        if (packagePath && !reachable.has(packagePath)) {
          errors.push(`${packagePath} is unreachable from the root dependency graph`);
        }
      }

      for (const name of [
        "@docflow-local/contracts",
        "@docflow-local/core",
        "@docflow-local/license-verifier"
      ]) {
        const expectedVersion = packageJson.dependencies?.[name];
        if (expectedVersion === undefined) continue;
        const lockedPackage = packages[`node_modules/${name}`];
        if (!lockedPackage || lockedPackage.link === true || lockedPackage.version !== expectedVersion) {
          errors.push(`${name} does not resolve to exact version ${expectedVersion}`);
        }
      }
    }
  } catch (error) {
    errors.push(`cannot parse lockfile metadata: ${error.message}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    path: packageLockPath
  };
}

function assessRelease({
  rootDir = ROOT_DIR,
  channel = "internal",
  platform = process.platform === "win32" ? "windows" : "macOS",
  arch = platform === "windows" ? "x64" : process.arch === "arm64" ? "arm64" : "x64",
  sourceOnly = false
} = {}) {
  if (!["macOS", "windows"].includes(platform)) {
    throw new Error("platform must be macOS or windows");
  }
  if (!["arm64", "x64"].includes(arch)) throw new Error("arch must be arm64 or x64");
  if (platform === "windows" && arch !== "x64") {
    throw new Error("Windows release architecture must be x64");
  }
  const checks = [];
  const add = (id, status, message, details) => {
    checks.push({ id, status, message, ...(details === undefined ? {} : { details }) });
  };
  const publicStatus = condition => {
    if (condition) return "pass";
    return channel === "public" ? "blocker" : "warning";
  };

  let rootPackage;
  try {
    rootPackage = readJson(rootDir, "package.json");
    add("ROOT_PACKAGE", "pass", `Desktop package ${rootPackage.version} loaded.`);
  } catch (error) {
    add("ROOT_PACKAGE", "blocker", `Cannot read package.json: ${error.message}`);
    return finalize(channel, sourceOnly, checks, null);
  }

  const requiredFiles = [
    "LICENSE",
    "LICENSES/MPL-2.0.txt",
    "NOTICE.md",
    "PLATFORM_ARCHITECTURE.md",
    "RELEASE_CHECKLIST.md",
    RELEASE_EVIDENCE,
    "release/github-repositories.json"
  ];
  const missingRequiredFiles = requiredFiles.filter(
    relativePath => !fs.existsSync(path.join(rootDir, relativePath))
  );
  add(
    "REQUIRED_RELEASE_FILES",
    missingRequiredFiles.length === 0 ? "pass" : "blocker",
    missingRequiredFiles.length === 0
      ? "Required license, notice, architecture, checklist, and evidence files exist."
      : "Required release files are missing.",
    missingRequiredFiles
  );

  add(
    "ROOT_LICENSE",
    rootPackage.license === "AGPL-3.0-or-later" ? "pass" : "blocker",
    `Historical desktop package license is ${rootPackage.license}.`
  );

  try {
    const repositoryPlan = readJson(rootDir, "release/github-repositories.json");
    const repositories = repositoryPlan.repositories || [];
    const names = repositories.map(repository => repository.name);
    const expectedNames = [
      "docflow",
      "docflow-desktop",
      "templates",
      "plugins",
      "examples",
      "docs",
      "docflow-pro"
    ];
    const unique = new Set(names);
    const pro = repositories.find(repository => repository.name === "docflow-pro");
    const publicNames = repositories
      .filter(repository => repository.visibility === "public")
      .map(repository => repository.name)
      .sort();
    const expectedPublic = expectedNames.filter(name => name !== "docflow-pro").sort();
    const valid =
      repositoryPlan.schemaVersion === 1 &&
      repositoryPlan.organization === "docflowlocal" &&
      unique.size === names.length &&
      expectedNames.every(name => unique.has(name)) &&
      pro?.visibility === "private" &&
      JSON.stringify(publicNames) === JSON.stringify(expectedPublic);
  add(
    "GITHUB_REPOSITORY_PLAN",
      valid ? "pass" : "blocker",
      valid
        ? "Six public repositories and the private Pro repository are explicitly separated."
        : "GitHub repository visibility or naming plan is invalid."
    );
  } catch (error) {
    add(
      "GITHUB_REPOSITORY_PLAN",
      "blocker",
      `GitHub repository plan cannot be validated: ${error.message}`
    );
  }

  const publicPackagePresence = PUBLIC_PACKAGES.map(([relativeDirectory]) => (
    fs.existsSync(path.join(rootDir, relativeDirectory, "package.json"))
  ));
  const hasAllPublicPackages = publicPackagePresence.every(Boolean);
  const hasAnyPublicPackage = publicPackagePresence.some(Boolean);

  if (hasAllPublicPackages) {
    for (const [relativeDirectory, expectedLicense] of PUBLIC_PACKAGES) {
      try {
        const packageJson = readJson(rootDir, `${relativeDirectory}/package.json`);
        const missingPackageFiles = ["LICENSE", "README.md"].filter(
          fileName => !fs.existsSync(path.join(rootDir, relativeDirectory, fileName))
        );
        if (relativeDirectory === "packages/core") {
          for (const fileName of [
            "NOTICE.md",
            "LICENSES/MPL-2.0.txt",
            "LICENSES/AGPL-3.0-or-later.txt"
          ]) {
            if (!fs.existsSync(path.join(rootDir, relativeDirectory, fileName))) {
              missingPackageFiles.push(fileName);
            }
          }
        }
        const valid =
          packageJson.license === expectedLicense &&
          packageJson.private !== true &&
          missingPackageFiles.length === 0;
        add(
          `PACKAGE_${packageJson.name}`,
          valid ? "pass" : "blocker",
          `${packageJson.name}@${packageJson.version} declares ${packageJson.license}.`,
          { expectedLicense, missingPackageFiles }
        );
      } catch (error) {
        add(
          `PACKAGE_${relativeDirectory}`,
          "blocker",
          `Cannot validate ${relativeDirectory}: ${error.message}`
        );
      }
    }

    const inheritedSpdxErrors = [];
    for (const relativePath of INHERITED_CORE_FILES) {
      const absolutePath = path.join(rootDir, relativePath);
      const source = fs.existsSync(absolutePath)
        ? fs.readFileSync(absolutePath, "utf8").slice(0, 512)
        : "";
      if (!source.includes("SPDX-License-Identifier: AGPL-3.0-or-later")) {
        inheritedSpdxErrors.push(relativePath);
      }
    }
    add(
      "CORE_INHERITED_SPDX",
      inheritedSpdxErrors.length === 0 ? "pass" : "blocker",
      inheritedSpdxErrors.length === 0
        ? "Inherited Core files retain AGPL-3.0-or-later SPDX notices."
        : "Inherited Core files lost their required AGPL SPDX notice.",
      inheritedSpdxErrors
    );
  } else if (hasAnyPublicPackage) {
    const missingPackageDirectories = PUBLIC_PACKAGES
      .filter((_, index) => !publicPackagePresence[index])
      .map(([relativeDirectory]) => relativeDirectory);
    add(
      "PUBLIC_PACKAGE_LAYOUT",
      "blocker",
      "The transition workspace contains only part of the public package set.",
      missingPackageDirectories
    );
    add(
      "CORE_INHERITED_SPDX",
      "blocker",
      "Core provenance cannot be validated from a partial package layout."
    );
  } else {
    const exactVersionPattern = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
    const dependencyErrors = [
      "@docflow-local/contracts",
      "@docflow-local/core",
      "@docflow-local/license-verifier"
    ].filter(dependency => (
      !exactVersionPattern.test(String(rootPackage.dependencies?.[dependency] || ""))
    ));
    add(
      "SPLIT_DESKTOP_DEPENDENCIES",
      dependencyErrors.length === 0 ? "pass" : "blocker",
      dependencyErrors.length === 0
        ? "The split Desktop repository pins exact published Core and verifier versions."
        : "The split Desktop repository must pin exact published Core and verifier versions.",
      dependencyErrors
    );
    add(
      "CORE_INHERITED_SPDX",
      "pass",
      "Core source is not vendored in the split Desktop repository; provenance is enforced in docflow."
    );
  }

  const splitDesktop = !hasAnyPublicPackage;
  const lockfile = validateReleaseLockfile(rootDir, {
    requireRegistryPackages: splitDesktop
  });
  if (hasAllPublicPackages) {
    add(
      "LOCKFILE_SUPPLY_CHAIN",
      publicStatus(false),
      channel === "public"
        ? "Public Desktop artifacts must be built from the split repository with a registry-resolved lockfile."
        : "The transition workspace lockfile is accepted only for internal previews.",
      lockfile.errors
    );
  } else {
    add(
      "LOCKFILE_SUPPLY_CHAIN",
      lockfile.valid ? "pass" : publicStatus(false),
      lockfile.valid
        ? "The split Desktop lockfile matches package.json and resolves Core/verifier from a registry."
        : "The split Desktop lockfile is missing, stale, locally linked, or not registry-resolved.",
      lockfile.errors
    );
  }

  const privateKeyFiles = listPrivateKeyFiles(rootDir);
  add(
    "PRIVATE_KEY_MATERIAL",
    privateKeyFiles.length === 0 ? "pass" : "blocker",
    privateKeyFiles.length === 0
      ? "No private-key or signing-certificate files were found in public source."
      : "Potential private signing material exists in public source.",
    privateKeyFiles
  );

  const gitStatus = commandResult("git", ["status", "--porcelain"], rootDir);
  if (!gitStatus.ok) {
    add(
      "GIT_STATUS",
      publicStatus(false),
      "Git worktree status could not be inspected; initialize the exported repository before a public build.",
      gitStatus.output
    );
  } else {
    const dirty = Boolean(gitStatus.output);
    add(
      "GIT_STATUS",
      publicStatus(!dirty),
      dirty
        ? "The worktree is dirty; public artifacts must be built from a reviewed commit."
        : "The worktree is clean.",
      dirty ? gitStatus.output.split(/\r?\n/).slice(0, 50) : []
    );
  }

  let evidence = {};
  try {
    evidence = readJson(rootDir, RELEASE_EVIDENCE);
  } catch {
    evidence = {};
  }
  const requiredEvidenceKeys = [
    ...COMMON_RELEASE_EVIDENCE_KEYS,
    ...PLATFORM_RELEASE_EVIDENCE_KEYS[platform]
  ];
  const pendingEvidence = requiredEvidenceKeys.filter(
    key => evidence[key]?.status !== "complete" || !String(evidence[key]?.reference || "").trim()
  );
  add(
    "MANUAL_RELEASE_EVIDENCE",
    publicStatus(pendingEvidence.length === 0),
    pendingEvidence.length === 0
      ? "All required manual release evidence is recorded."
      : "Manual release evidence remains pending.",
    pendingEvidence
  );

  if (platform === "macOS") {
    const internalMac = rootPackage.build?.mac || {};
    let releaseMac = {};
    try {
      releaseMac = require(path.join(rootDir, "desktop", "electron-builder.release.cjs")).mac || {};
    } catch {
      releaseMac = {};
    }
    const mac = channel === "public" ? releaseMac : internalMac;
    add(
      "MAC_HARDENED_RUNTIME",
      publicStatus(mac.hardenedRuntime === true),
      mac.hardenedRuntime === true
        ? "Hardened runtime is enabled."
        : "Hardened runtime is disabled in the current desktop build."
    );
    const signingIdentities =
      process.platform === "darwin"
        ? commandResult("security", ["find-identity", "-v", "-p", "codesigning"], rootDir)
        : {
            ok: true,
            output: "Signing identity availability must be checked on the macOS release runner."
          };
    const developerIdInstalled =
      process.platform !== "darwin" ||
      Boolean(String(process.env.CSC_LINK || "").trim()) ||
      (signingIdentities.ok && /Developer ID Application:/i.test(signingIdentities.output));
    const developerIdConfigured = mac.identity !== null;
    add(
      "MAC_DEVELOPER_ID",
      publicStatus(developerIdConfigured && developerIdInstalled),
      !developerIdConfigured
        ? "The current desktop build explicitly disables Developer ID signing."
        : developerIdInstalled
          ? "A Developer ID signing configuration and identity are available."
          : "No Developer ID Application identity is installed on this release machine.",
      process.platform === "darwin" ? signingIdentities.output : undefined
    );
  }

  let windowsRelease = {};
  try {
    windowsRelease = require(path.join(rootDir, "desktop", "electron-builder.win-release.cjs")).win || {};
  } catch {
    windowsRelease = {};
  }
  const windowsSigningAlgorithms =
    windowsRelease.signtoolOptions?.signingHashAlgorithms || [];
  const windowsSigningConfigured =
    windowsRelease.forceCodeSigning === true &&
    windowsRelease.signExecutable === true &&
    windowsRelease.verifyUpdateCodeSignature === true &&
    windowsSigningAlgorithms.length === 1 &&
    windowsSigningAlgorithms[0] === "sha256" &&
    Boolean(windowsRelease.signtoolOptions?.rfc3161TimeStampServer);
  add(
    "WINDOWS_SIGNING_CONFIG",
    windowsSigningConfigured ? "pass" : publicStatus(false),
    windowsSigningConfigured
      ? "Windows release signing requires SHA-256 Authenticode with RFC 3161 timestamping."
      : "Windows release signing configuration is incomplete."
  );

  const artifacts = [];
  if (!sourceOnly) {
    const distDirectory = path.join(rootDir, "dist");
    const expectedArtifactNames = platform === "macOS"
      ? [
          `DocFlow-Local-${rootPackage.version}-macOS-${arch}.zip`,
          `DocFlow-Local-${rootPackage.version}-macOS-${arch}.pkg`
        ]
      : [
          `DocFlow-Local-Setup-${rootPackage.version}-${arch}.exe`,
          `DocFlow-Local-${rootPackage.version}-Windows-${arch}.exe`
        ];
    for (const artifactName of expectedArtifactNames) {
      const artifactPath = path.join(distDirectory, artifactName);
      if (!fs.existsSync(artifactPath)) {
        add(
          `ARTIFACT_${artifactName}`,
          publicStatus(false),
          `Expected artifact is missing: ${artifactName}`
        );
        continue;
      }
      const stat = fs.statSync(artifactPath);
      const artifact = {
        type: platform === "macOS"
          ? artifactName.endsWith(".pkg") ? "pkg" : "zip"
          : artifactName.includes("-Setup-") ? "nsis" : "portable",
        name: artifactName,
        bytes: stat.size,
        sha256: sha256(artifactPath)
      };
      artifacts.push(artifact);
      add(
        `ARTIFACT_${artifactName}`,
        "pass",
        `${artifactName} is present and hashed.`,
        artifact
      );
    }

    if (platform === "macOS") {
      const packagePath = path.join(
        distDirectory,
        `DocFlow-Local-${rootPackage.version}-macOS-${arch}.pkg`
      );
      if (fs.existsSync(packagePath) && process.platform === "darwin") {
        const signature = commandResult("pkgutil", ["--check-signature", packagePath], rootDir);
        const signed = signature.ok && !/Status:\s+no signature/i.test(signature.output);
        add(
          "MAC_INSTALLER_SIGNATURE",
          publicStatus(signed),
          signed
            ? "The macOS installer has a verifiable package signature."
            : "The macOS installer is not signed for public distribution.",
          signature.output
        );
        const notarization = commandResult("xcrun", ["stapler", "validate", packagePath], rootDir);
        add(
          "MAC_NOTARIZATION",
          publicStatus(notarization.ok),
          notarization.ok
            ? "The macOS installer has a valid stapled notarization ticket."
            : "The macOS installer does not have a valid stapled notarization ticket.",
          notarization.output
        );
      }

      const appDirectory = arch === "arm64" ? "mac-arm64" : "mac";
      const appPath = path.join(distDirectory, appDirectory, "DocFlow Local.app");
      if (fs.existsSync(appPath) && process.platform === "darwin") {
        const verification = commandResult(
          "codesign",
          ["--verify", "--deep", "--strict", "--verbose=2", appPath],
          rootDir
        );
        const description = commandResult(
          "codesign",
          ["--display", "--verbose=4", appPath],
          rootDir
        );
        const developerSigned =
          verification.ok &&
          description.ok &&
          !/Signature=adhoc/i.test(description.output) &&
          /TeamIdentifier=(?!not set)\S+/i.test(description.output);
        add(
          "MAC_APP_SIGNATURE",
          publicStatus(developerSigned),
          developerSigned
            ? "The packaged app has a strict Developer ID signature."
            : "The packaged app is unsigned or ad-hoc signed.",
          [verification.output, description.output].filter(Boolean).join("\n")
        );
      }
    } else if (process.platform !== "win32") {
      add(
        "WINDOWS_RELEASE_HOST",
        publicStatus(false),
        "Windows Authenticode verification must run on a Windows release host."
      );
    } else {
      for (const artifactName of expectedArtifactNames) {
        const artifactPath = path.join(distDirectory, artifactName);
        if (!fs.existsSync(artifactPath)) continue;
        const script = [
          "$signature = Get-AuthenticodeSignature -LiteralPath $env:DOCFLOW_AUTHENTICODE_PATH",
          "$result = [ordered]@{",
          "  status = [string]$signature.Status",
          "  signerSubject = if ($null -eq $signature.SignerCertificate) { $null } else { $signature.SignerCertificate.Subject }",
          "  signerThumbprint = if ($null -eq $signature.SignerCertificate) { $null } else { $signature.SignerCertificate.Thumbprint }",
          "  timestampSubject = if ($null -eq $signature.TimeStamperCertificate) { $null } else { $signature.TimeStamperCertificate.Subject }",
          "  timestampThumbprint = if ($null -eq $signature.TimeStamperCertificate) { $null } else { $signature.TimeStamperCertificate.Thumbprint }",
          "}",
          "$result | ConvertTo-Json -Compress",
          "if ($signature.Status -ne 'Valid' -or $null -eq $signature.SignerCertificate -or $null -eq $signature.TimeStamperCertificate) { exit 2 }"
        ].join("\n");
        const signature = commandResult(
          "powershell.exe",
          ["-NoProfile", "-NonInteractive", "-Command", script],
          rootDir,
          {
            env: {
              ...process.env,
              DOCFLOW_AUTHENTICODE_PATH: artifactPath
            }
          }
        );
        let authenticode = null;
        try {
          authenticode = JSON.parse(String(signature.output).split(/\r?\n/).find(line => (
            line.trim().startsWith("{")
          )) || "");
        } catch {
          authenticode = null;
        }
        const validAuthenticode =
          signature.ok &&
          authenticode?.status === "Valid" &&
          Boolean(authenticode.signerThumbprint) &&
          Boolean(authenticode.timestampThumbprint);
        const artifact = artifacts.find(item => item.name === artifactName);
        if (artifact) artifact.authenticode = authenticode;
        add(
          `WINDOWS_AUTHENTICODE_${artifactName}`,
          publicStatus(validAuthenticode),
          validAuthenticode
            ? `${artifactName} has a valid timestamped Authenticode signature.`
            : `${artifactName} is unsigned, untimestamped, or has an invalid Authenticode signature.`,
          authenticode || signature.output
        );
      }
    }
  }

  return finalize(channel, sourceOnly, checks, {
    product: rootPackage.name,
    version: rootPackage.version,
    platform,
    arch,
    artifacts
  });
}

function finalize(channel, sourceOnly, checks, release) {
  const counts = checks.reduce(
    (result, check) => {
      result[check.status] = (result[check.status] || 0) + 1;
      return result;
    },
    { pass: 0, warning: 0, blocker: 0 }
  );
  return {
    schemaVersion: 1,
    channel,
    sourceOnly,
    ready: counts.blocker === 0,
    counts,
    release,
    checks
  };
}

function formatHumanReport(report) {
  const symbols = { pass: "PASS", warning: "WARN", blocker: "BLOCK" };
  const lines = [
    `DocFlow release readiness (${report.channel})`,
    `Ready: ${report.ready ? "yes" : "no"} · ${report.counts.pass} pass · ${report.counts.warning} warning · ${report.counts.blocker} blocker`
  ];
  for (const check of report.checks) {
    lines.push(`${symbols[check.status]} ${check.id}: ${check.message}`);
  }
  if (report.release?.artifacts?.length) {
    lines.push("Artifacts:");
    for (const artifact of report.release.artifacts) {
      lines.push(`  ${artifact.sha256}  ${artifact.name} (${artifact.bytes} bytes)`);
    }
  }
  return lines.join("\n");
}

function printHelp() {
  process.stdout.write(`Usage: node scripts/release-readiness.js [options]

Options:
  --channel internal|public  Select internal preview or public release gates.
  --platform macOS|windows   Select the target release platform.
  --arch arm64|x64           Select the macOS artifact architecture.
  --source-only              Skip installer presence and signature inspection.
  --lockfile-only            Validate the standalone registry lockfile and exit.
  --root PATH                Inspect another exported repository root.
  --json                     Emit the full machine-readable report.
  -h, --help                 Show this help.
`);
}

if (require.main === module) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      printHelp();
      process.exitCode = 0;
    } else if (options.lockfileOnly) {
      const lockfile = validateReleaseLockfile(options.rootDir, {
        requireRegistryPackages: true
      });
      process.stdout.write(
        options.json
          ? `${JSON.stringify(lockfile, null, 2)}\n`
          : `${lockfile.valid ? "PASS" : "BLOCK"} RELEASE_LOCKFILE: ${
            lockfile.valid
              ? "Registry lockfile is structurally complete and trusted."
              : lockfile.errors.join("; ")
          }\n`
      );
      process.exitCode = lockfile.valid ? 0 : 2;
    } else {
      const report = assessRelease(options);
      process.stdout.write(
        `${options.json ? JSON.stringify(report, null, 2) : formatHumanReport(report)}\n`
      );
      process.exitCode = report.ready ? 0 : 2;
    }
  } catch (error) {
    process.stderr.write(`Release readiness failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  assessRelease,
  formatHumanReport,
  listPrivateKeyFiles,
  parseArguments,
  validateReleaseLockfile
};
