/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Mechanical guardrails for the mixed-license transition repository. This
 * script verifies recorded facts and packaging boundaries; it is not a legal
 * opinion and cannot prove that a future implementation is independent.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { builtinModules } = require("node:module");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const argumentsList = process.argv.slice(2);
const exportedSource = argumentsList.includes("--exported-source");
const unknownArguments = argumentsList.filter(argument => argument !== "--exported-source");
if (unknownArguments.length) {
  throw new Error(`Unknown argument(s): ${unknownArguments.join(", ")}`);
}
const manifestPath = path.join(root, "license-boundaries.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const errors = [];
const inherited = new Map(Object.entries(manifest.coreInheritedFiles || {}));
const builtins = new Set([
  ...builtinModules,
  ...builtinModules.map(name => `node:${name}`)
]);

function fail(message) {
  errors.push(message);
}

function check(condition, message) {
  if (!condition) fail(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function filesUnder(relativeRoot, predicate = () => true) {
  const absoluteRoot = path.join(root, relativeRoot);
  const output = [];
  for (const entry of fs.readdirSync(absoluteRoot, { withFileTypes: true })) {
    const relativePath = path.posix.join(relativeRoot, entry.name);
    if (entry.isDirectory()) output.push(...filesUnder(relativePath, predicate));
    else if (predicate(relativePath)) output.push(relativePath);
  }
  return output.sort();
}

function spdxIds(relativePath) {
  return [...read(relativePath).matchAll(/SPDX-License-Identifier:\s*([^\r\n*]+)/g)]
    .map(match => match[1].trim());
}

function checkSingleSpdx(relativePath, expected) {
  const identifiers = spdxIds(relativePath);
  check(
    identifiers.length === 1,
    `${relativePath}: expected exactly one SPDX identifier, found ${identifiers.length}`
  );
  if (identifiers.length === 1) {
    check(
      identifiers[0] === expected,
      `${relativePath}: expected SPDX ${expected}, found ${identifiers[0]}`
    );
  }
}

function gitOutput(args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trimEnd();
}

function stripSpdx(text) {
  return text.replace(
    /(^|\n)\/\/ SPDX-License-Identifier:[^\r\n]+\r?\n\r?\n/,
    "$1"
  );
}

function hasTopLevelSymbol(source, symbol) {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `^(?:(?:async\\s+)?function|class)\\s+${escaped}\\b`,
    "m"
  ).test(source);
}

function moduleName(specifier) {
  if (specifier.startsWith("@")) return specifier.split("/").slice(0, 2).join("/");
  return specifier.split("/")[0];
}

function directRuntimeDependencies(relativePath) {
  const source = read(relativePath);
  const dependencies = new Set();
  for (const match of source.matchAll(/\brequire(?:\.resolve)?\(\s*["']([^"']+)["']\s*\)/g)) {
    const specifier = match[1];
    if (specifier.startsWith(".") || specifier.startsWith("/") || builtins.has(specifier)) continue;
    dependencies.add(moduleName(specifier));
  }
  return [...dependencies].sort();
}

function installedPackageJson(packageName) {
  const segments = packageName.split("/");
  return readJson(path.posix.join("node_modules", ...segments, "package.json"));
}

function longestExactRun(leftText, rightText) {
  const left = leftText.split(/\r?\n/);
  const right = rightText.split(/\r?\n/);
  let previous = new Uint16Array(right.length + 1);
  let longest = 0;
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = new Uint16Array(right.length + 1);
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      if (
        left[leftIndex - 1].trim()
        && left[leftIndex - 1] === right[rightIndex - 1]
      ) {
        current[rightIndex] = previous[rightIndex - 1] + 1;
        longest = Math.max(longest, current[rightIndex]);
      }
    }
    previous = current;
  }
  return longest;
}

check(manifest.schemaVersion === 1, "license-boundaries.json: unsupported schemaVersion");
check(
  /^[a-f0-9]{40}$/.test(manifest.historicalBaseline?.commit || ""),
  "license-boundaries.json: historical baseline commit must be a full Git object id"
);

const baselineCommit = manifest.historicalBaseline.commit;
const historicalText = new Map();
if (!exportedSource) {
  for (const [relativePath, record] of Object.entries(manifest.historicalBaseline.files || {})) {
    let actualBlob = "";
    try {
      actualBlob = gitOutput(["rev-parse", `${baselineCommit}:${relativePath}`]);
      historicalText.set(relativePath, gitOutput(["show", `${baselineCommit}:${relativePath}`]) + "\n");
    } catch (error) {
      fail(`${relativePath}: cannot read recorded historical baseline (${error.message})`);
      continue;
    }
    check(
      actualBlob === record.gitBlob,
      `${relativePath}: historical blob changed; expected ${record.gitBlob}, found ${actualBlob}`
    );
  }
}

for (const [packagePath, expectedLicense] of Object.entries(manifest.packageLicenses || {})) {
  const packageJson = readJson(`${packagePath}/package.json`);
  check(
    packageJson.license === expectedLicense,
    `${packagePath}/package.json: expected license ${expectedLicense}, found ${packageJson.license}`
  );
}

const rootMpl = read("LICENSES/MPL-2.0.txt");
for (const packagePath of [
  "packages/contracts",
  "packages/license-verifier",
  "packages/desktop-extension-sdk"
]) {
  check(
    read(`${packagePath}/LICENSE`) === rootMpl,
    `${packagePath}/LICENSE: must be the complete root MPL-2.0 text`
  );
}
check(
  read("packages/core/LICENSES/MPL-2.0.txt") === rootMpl,
  "packages/core/LICENSES/MPL-2.0.txt: must match the complete root MPL text"
);
const coreAgpl = read("packages/core/LICENSES/AGPL-3.0-or-later.txt");
if (exportedSource) {
  check(
    coreAgpl.length > 30_000
      && coreAgpl.includes("GNU AFFERO GENERAL PUBLIC LICENSE")
      && coreAgpl.includes("Version 3, 19 November 2007"),
    "packages/core/LICENSES/AGPL-3.0-or-later.txt: complete AGPL-3.0 text is missing"
  );
} else {
  check(
    coreAgpl === read("LICENSE"),
    "packages/core/LICENSES/AGPL-3.0-or-later.txt: must match the historical root AGPL text"
  );
}

const coreNotice = read("packages/core/NOTICE.md");
for (const [relativePath, record] of inherited) {
  check(fs.existsSync(path.join(root, relativePath)), `${relativePath}: inherited file is missing`);
  checkSingleSpdx(relativePath, record.spdx);
  if (!manifest.releaseGate.pureMplCoreAllowed) {
    check(
      record.resolution?.status === "unresolved",
      `${relativePath}: resolution may change only with documented legal/clean-room evidence`
    );
  }
  check(
    coreNotice.includes(relativePath.replace(/^packages\/core\//, "")),
    `${relativePath}: missing from packages/core/NOTICE.md`
  );

  if (!exportedSource) {
    for (const historicalPath of record.historicalSources || []) {
      check(
        historicalText.has(historicalPath),
        `${relativePath}: historical source ${historicalPath} is not in the recorded baseline`
      );
    }

    for (const [historicalPath, symbols] of Object.entries(record.sharedTopLevelSymbols || {})) {
      const currentSource = read(relativePath);
      const oldSource = historicalText.get(historicalPath) || "";
      for (const symbol of symbols) {
        check(
          hasTopLevelSymbol(currentSource, symbol),
          `${relativePath}: recorded shared symbol ${symbol} is absent from current source`
        );
        check(
          hasTopLevelSymbol(oldSource, symbol),
          `${historicalPath}: recorded shared symbol ${symbol} is absent from baseline`
        );
      }
    }

    if (record.byteIdenticalAfterRemovingSpdxWith) {
      const oldSource = historicalText.get(record.byteIdenticalAfterRemovingSpdxWith);
      check(
        oldSource != null && stripSpdx(read(relativePath)) === oldSource,
        `${relativePath}: recorded byte-identical provenance evidence no longer matches`
      );
    }
  }

  const expectedDependencies = Object.keys(record.directRuntimeDependencies || {}).sort();
  const actualDependencies = directRuntimeDependencies(relativePath);
  check(
    JSON.stringify(actualDependencies) === JSON.stringify(expectedDependencies),
    `${relativePath}: direct runtime dependencies changed; expected `
      + `${expectedDependencies.join(", ") || "(none)"}, found `
      + `${actualDependencies.join(", ") || "(none)"}`
  );
  for (const [packageName, expectedLicense] of Object.entries(record.directRuntimeDependencies || {})) {
    const corePackage = readJson("packages/core/package.json");
    check(
      Object.prototype.hasOwnProperty.call(corePackage.dependencies || {}, packageName),
      `${relativePath}: ${packageName} is not declared by packages/core/package.json`
    );
    if (!exportedSource) {
      let installed;
      try {
        installed = installedPackageJson(packageName);
      } catch (error) {
        fail(`${relativePath}: cannot inspect ${packageName} (${error.message})`);
        continue;
      }
      check(
        installed.license === expectedLicense,
        `${relativePath}: ${packageName} expected license ${expectedLicense}, found ${installed.license}`
      );
    }
  }
}

for (const sourceRoot of manifest.publishedMplSourceRoots || []) {
  for (const relativePath of filesUnder(sourceRoot, file => file.endsWith(".js"))) {
    checkSingleSpdx(relativePath, "MPL-2.0");
  }
}

const baselineSources = [...historicalText.entries()];
for (const relativePath of [
  ...filesUnder("packages/core/src", file => file.endsWith(".js")),
  ...filesUnder("packages/core/bin", file => file.endsWith(".js"))
]) {
  if (inherited.has(relativePath)) continue;
  checkSingleSpdx(relativePath, "MPL-2.0");
  if (!exportedSource) {
    for (const [historicalPath, oldSource] of baselineSources) {
      const run = longestExactRun(read(relativePath), oldSource);
      check(
        run < 6,
        `${relativePath}: found an unreviewed ${run}-line exact run from ${historicalPath}`
      );
    }
  }
}

const rootPackage = readJson("package.json");
if (!exportedSource) {
  for (const required of manifest.electronRequiredLicenseFiles || []) {
    check(
      rootPackage.build?.files?.includes(required),
      `package.json: Electron build.files is missing ${required}`
    );
  }
}

if (manifest.releaseGate.pureMplCoreAllowed) {
  check(
    (manifest.releaseGate.reviewReferences || []).length > 0,
    "pure MPL Core gate requires documented review references"
  );
  for (const [relativePath, record] of inherited) {
    check(
      record.resolution?.status === "accepted"
        && ["rightsholder-grant", "clean-room-replacement"].includes(record.resolution?.basis)
        && (record.resolution?.evidenceReferences || []).length > 0,
      `${relativePath}: pure MPL gate lacks accepted resolution evidence`
    );
  }
} else {
  check(
    readJson("packages/core/package.json").license === "MPL-2.0 AND AGPL-3.0-or-later",
    "packages/core must remain mixed-license while the pure-MPL gate is closed"
  );
}

if (exportedSource) {
  for (const relativePath of [
    "package.json",
    "packages/contracts/package.json",
    "packages/core/package.json",
    "packages/license-verifier/package.json",
    "packages/desktop-extension-sdk/package.json"
  ]) {
    const packageJson = readJson(relativePath);
    for (const dependencyField of [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
      "peerDependencies"
    ]) {
      for (const [name, specifier] of Object.entries(packageJson[dependencyField] || {})) {
        check(
          !/^(?:file:|link:|workspace:|\.{1,2}[\\/])/i.test(String(specifier)),
          `${relativePath}: ${dependencyField}.${name} must use a publishable version`
        );
      }
    }
  }
}

if (errors.length) {
  process.stderr.write(
    `LICENSE_BOUNDARIES_FAILED (${errors.length})\n`
      + errors.map(error => `- ${error}`).join("\n")
      + "\n"
  );
  process.exitCode = 1;
} else {
  if (exportedSource) {
    process.stdout.write(
      `LICENSE_BOUNDARIES_EXPORT_OK (${inherited.size} inherited AGPL files; `
        + "pure MPL gate closed; historical blob and installed-dependency deep audit "
        + "unavailable—run it in the transition repository)\n"
    );
  } else {
    process.stdout.write(
      `LICENSE_BOUNDARIES_OK (${inherited.size} inherited AGPL files; pure MPL gate closed)\n`
    );
  }
}
