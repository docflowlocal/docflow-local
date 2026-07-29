"use strict";

// SPDX-License-Identifier: MPL-2.0

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");
const { execFile } = require("node:child_process");
const test = require("node:test");
const {
  FORBIDDEN_DIRECTORY_NAMES,
  MANIFEST_FILENAME,
  SOURCE_ROOT,
  buildExportPlan,
  canonicalJson,
  exportRepositories,
  manifestFromPlan,
  parseArguments,
  runCli,
  verifyExport
} = require("./export-repositories");

const EXPECTED_REPOSITORIES = Object.freeze([
  "docflow",
  "docflow-desktop",
  "templates",
  "plugins",
  "examples",
  "docs"
]);
const execFileAsync = promisify(execFile);

async function exists(filename) {
  try {
    await fs.promises.access(filename, fs.constants.F_OK);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function temporaryDirectory(t, prefix) {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  return directory;
}

function fixtureRepositories() {
  return [{
    name: "fixture",
    entries: [{ source: "public", target: "." }],
    requiredFiles: ["README.md"]
  }];
}

test("default plan deterministically maps six public repository trees", async () => {
  const first = manifestFromPlan(await buildExportPlan());
  const second = manifestFromPlan(await buildExportPlan());
  assert.equal(canonicalJson(first), canonicalJson(second));
  assert.deepEqual(
    first.repositories.map(repository => repository.name),
    EXPECTED_REPOSITORIES
  );
  assert.match(first.contentSha256, /^[a-f0-9]{64}$/);

  for (const repository of first.repositories) {
    const paths = new Set(repository.files.map(file => file.path));
    for (const required of repository.requiredFiles) assert(paths.has(required));
    assert(repository.files.every(file => !path.isAbsolute(file.source)));
    assert(repository.files.every(file => /^[a-f0-9]{64}$/.test(file.sha256)));
    assert(repository.files.every(file => (
      !file.path.split("/").some(segment => (
        FORBIDDEN_DIRECTORY_NAMES.includes(segment.toLowerCase())
      ))
    )));
  }
});

test("CLI dry-run hash is machine-readable and cannot orphan a temp export", async () => {
  let stdout = "";
  const exitCode = await runCli(["--dry-run", "--hash"], {
    stdout: { write: chunk => { stdout += String(chunk); } }
  });
  assert.equal(exitCode, 0);
  assert.match(stdout, /^[a-f0-9]{64}\n$/);
  assert.throws(
    () => parseArguments(["--hash"]),
    error => {
      assert.equal(error.code, "DOCFLOW_EXPORT_ARGUMENT");
      return true;
    }
  );
});

test("export writes verified trees, preserves metadata, and rejects a dirty rerun", async t => {
  const parent = await temporaryDirectory(t, "docflow-export-test-");
  const output = path.join(parent, "repositories");
  const dryRun = await exportRepositories({ output, dryRun: true });
  assert.equal(await exists(output), false, "dry-run must not create the requested output");

  const result = await exportRepositories({ output });
  assert.equal(result.output, output);
  assert.equal(
    canonicalJson(result.manifest),
    canonicalJson(dryRun.manifest),
    "dry-run and written manifests must be byte-for-byte reproducible"
  );
  assert.deepEqual(
    (await fs.promises.readdir(output)).sort(),
    [...EXPECTED_REPOSITORIES, MANIFEST_FILENAME].sort()
  );
  const verification = await verifyExport(output);
  assert.equal(verification.ok, true);
  assert.equal(verification.contentSha256, result.manifest.contentSha256);

  const preservedFiles = [
    ["packages/core/package.json", "docflow/packages/core/package.json"],
    ["docs/README.md", "docs/README.md"],
    ["templates/quotation/starter.docx", "templates/quotation/starter.docx"]
  ];
  for (const [source, exported] of preservedFiles) {
    assert.deepEqual(
      await fs.promises.readFile(path.join(SOURCE_ROOT, source)),
      await fs.promises.readFile(path.join(output, exported)),
      `${exported} must preserve source bytes`
    );
  }

  const corePackage = JSON.parse(
    await fs.promises.readFile(path.join(SOURCE_ROOT, "packages/core/package.json"))
  );
  const verifierPackage = JSON.parse(
    await fs.promises.readFile(path.join(SOURCE_ROOT, "packages/license-verifier/package.json"))
  );
  const desktopPackage = JSON.parse(
    await fs.promises.readFile(path.join(output, "docflow-desktop/package.json"))
  );
  assert.equal(desktopPackage.dependencies["@docflow-local/core"], corePackage.version);
  assert.equal(
    desktopPackage.dependencies["@docflow-local/license-verifier"],
    verifierPackage.version
  );
  assert.equal(desktopPackage.repository.url, "https://github.com/docflowlocal/docflow-desktop.git");
  assert.equal(desktopPackage.bugs.url, "https://github.com/docflowlocal/docflow-desktop/issues");
  assert.equal(desktopPackage.homepage, "https://github.com/docflowlocal/docflow-desktop#readme");
  assert.equal(Object.prototype.hasOwnProperty.call(desktopPackage, "workspaces"), false);
  assert.match(desktopPackage.scripts["release:check:win"], /--platform windows --arch x64/);
  assert.match(desktopPackage.scripts["release:metadata:win"], /--platform windows --arch x64/);
  assert.equal(
    await exists(path.join(output, "docflow-desktop/package-lock.json")),
    false,
    "the transition monorepo lockfile must not be exported"
  );
  const exportedWindowsRelease = await fs.promises.readFile(
    path.join(output, "docflow-desktop/desktop/package-win-release.ps1"),
    "utf8"
  );
  assert.doesNotMatch(exportedWindowsRelease, /npm run test:packages/);
  assert.match(exportedWindowsRelease, /DocFlow-Local-Setup-\$Version-x64\.exe/);
  assert.match(exportedWindowsRelease, /TimeStamperCertificate/);
  assert.match(exportedWindowsRelease, /"--platform" "windows"/);

  for (const repository of EXPECTED_REPOSITORIES) {
    const packagePath = path.join(output, repository, "package.json");
    const packageJson = JSON.parse(await fs.promises.readFile(packagePath, "utf8"));
    assert.equal(
      packageJson.repository.url,
      `https://github.com/docflowlocal/${repository}.git`
    );
    assert.equal(
      packageJson.bugs.url,
      `https://github.com/docflowlocal/${repository}/issues`
    );
    assert.equal(
      packageJson.homepage,
      `https://github.com/docflowlocal/${repository}#readme`
    );
  }

  const packageFiles = result.manifest.repositories.flatMap(repository => (
    repository.files
      .filter(file => path.posix.basename(file.path) === "package.json")
      .map(file => path.join(output, repository.name, ...file.path.split("/")))
  ));
  for (const packageFile of packageFiles) {
    const packageJson = JSON.parse(await fs.promises.readFile(packageFile, "utf8"));
    for (const field of [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
      "peerDependencies"
    ]) {
      for (const specifier of Object.values(packageJson[field] || {})) {
        assert.doesNotMatch(String(specifier), /^(?:file:|link:|workspace:|\.{1,2}[\\/])/i);
      }
    }
  }

  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const licenseResult = await execFileAsync(npmCommand, ["run", "test:licenses"], {
    cwd: path.join(output, "docflow"),
    encoding: "utf8"
  });
  assert.match(licenseResult.stdout, /LICENSE_BOUNDARIES_EXPORT_OK/);
  assert.match(licenseResult.stdout, /historical blob and installed-dependency deep audit unavailable/);

  const desktopReleaseResult = await execFileAsync(npmCommand, ["run", "test:release"], {
    cwd: path.join(output, "docflow-desktop"),
    encoding: "utf8"
  });
  assert.match(desktopReleaseResult.stdout, /DESKTOP_LICENSE_MATERIALS_OK/);
  assert.match(desktopReleaseResult.stdout, /DocFlow release readiness \(internal\)/);
  assert.match(desktopReleaseResult.stdout, /PASS SPLIT_DESKTOP_DEPENDENCIES/);
  assert.match(desktopReleaseResult.stdout, /WARN LOCKFILE_SUPPLY_CHAIN/);

  const desktopRoot = path.join(output, "docflow-desktop");
  const desktopLockPath = path.join(desktopRoot, "package-lock.json");
  const lockedRoot = {
    name: desktopPackage.name,
    version: desktopPackage.version,
    license: desktopPackage.license,
    dependencies: desktopPackage.dependencies,
    devDependencies: desktopPackage.devDependencies
  };
  const linkedLock = {
    name: desktopPackage.name,
    version: desktopPackage.version,
    lockfileVersion: 3,
    packages: {
      "": {
        ...lockedRoot,
        workspaces: ["packages/*"]
      },
      "packages/core": {
        name: "@docflow-local/core",
        version: corePackage.version
      },
      "node_modules/@docflow-local/core": {
        resolved: "packages/core",
        link: true
      },
      "node_modules/@docflow-local/license-verifier": {
        version: verifierPackage.version,
        resolved: "file:../license-verifier"
      }
    }
  };
  await fs.promises.writeFile(desktopLockPath, canonicalJson(linkedLock));
  const exportedReadiness = require(
    path.join(desktopRoot, "scripts", "release-readiness.js")
  );
  const linkedResult = exportedReadiness.validateReleaseLockfile(desktopRoot, {
    requireRegistryPackages: true
  });
  assert.strictEqual(linkedResult.valid, false);
  assert(linkedResult.errors.some(error => /workspaces/.test(error)));
  assert(linkedResult.errors.some(error => /local or linked/.test(error)));
  assert(linkedResult.errors.some(error => /integrity/.test(error)));

  const registryLock = {
    name: desktopPackage.name,
    version: desktopPackage.version,
    lockfileVersion: 3,
    packages: {
      "": lockedRoot,
      "node_modules/@docflow-local/core": {
        version: corePackage.version,
        resolved: `https://registry.npmjs.org/@docflow-local/core/-/core-${corePackage.version}.tgz`,
        integrity: "sha512-ZmFrZS1pbnRlZ3JpdHk="
      },
      "node_modules/@docflow-local/license-verifier": {
        version: verifierPackage.version,
        resolved: `https://registry.npmjs.org/@docflow-local/license-verifier/-/license-verifier-${verifierPackage.version}.tgz`,
        integrity: "sha512-ZmFrZS1pbnRlZ3JpdHk="
      }
    }
  };
  await fs.promises.writeFile(desktopLockPath, canonicalJson(registryLock));
  const registryResult = exportedReadiness.validateReleaseLockfile(desktopRoot, {
    requireRegistryPackages: true
  });
  assert.strictEqual(registryResult.valid, true, registryResult.errors.join("\n"));
  const exportedMetadata = require(
    path.join(desktopRoot, "scripts", "generate-release-metadata.js")
  );
  assert.strictEqual(exportedMetadata.requirePackageLock(desktopRoot), desktopLockPath);
  await fs.promises.rm(desktopLockPath);

  await assert.rejects(
    exportRepositories({ output }),
    error => {
      assert.equal(error.code, "DOCFLOW_EXPORT_OUTPUT_DIRTY");
      return true;
    }
  );

  const tampered = path.join(output, "docflow/packages/core/src/cli.js");
  await fs.promises.appendFile(tampered, "\n// tampered\n");
  await assert.rejects(
    verifyExport(output),
    error => {
      assert.equal(error.code, "DOCFLOW_EXPORT_HASH_MISMATCH");
      return true;
    }
  );
});

test("dirty output is rejected without changing its contents", async t => {
  const parent = await temporaryDirectory(t, "docflow-export-dirty-");
  const output = path.join(parent, "repositories");
  await fs.promises.mkdir(output);
  const marker = path.join(output, "keep.txt");
  await fs.promises.writeFile(marker, "keep");

  await assert.rejects(
    exportRepositories({ output }),
    error => {
      assert.equal(error.code, "DOCFLOW_EXPORT_OUTPUT_DIRTY");
      return true;
    }
  );
  assert.equal(await fs.promises.readFile(marker, "utf8"), "keep");
  assert.deepEqual(await fs.promises.readdir(output), ["keep.txt"]);
});

test("dependency/build trees are excluded and secret-like inputs fail closed", async t => {
  const sourceRoot = await temporaryDirectory(t, "docflow-export-source-");
  const publicRoot = path.join(sourceRoot, "public");
  await fs.promises.mkdir(path.join(publicRoot, "node_modules"), { recursive: true });
  await fs.promises.mkdir(path.join(publicRoot, "dist"), { recursive: true });
  await fs.promises.writeFile(path.join(publicRoot, "README.md"), "# Fixture\n");
  await fs.promises.writeFile(path.join(publicRoot, "node_modules", "dependency.js"), "ignored");
  await fs.promises.writeFile(path.join(publicRoot, "dist", "bundle.js"), "ignored");

  const cleanPlan = await buildExportPlan({
    sourceRoot,
    repositories: fixtureRepositories()
  });
  assert.deepEqual(cleanPlan.repositories[0].files.map(file => file.path), ["README.md"]);

  await fs.promises.writeFile(path.join(publicRoot, ".env"), "TOKEN=real-secret");
  await assert.rejects(
    buildExportPlan({ sourceRoot, repositories: fixtureRepositories() }),
    error => {
      assert.equal(error.code, "DOCFLOW_EXPORT_SECRET");
      return true;
    }
  );
  await fs.promises.rm(path.join(publicRoot, ".env"));

  await fs.promises.writeFile(
    path.join(publicRoot, "material.txt"),
    "-----BEGIN PRIVATE KEY-----\nnot-a-real-key\n"
  );
  await assert.rejects(
    buildExportPlan({ sourceRoot, repositories: fixtureRepositories() }),
    error => {
      assert.equal(error.code, "DOCFLOW_EXPORT_SECRET");
      return true;
    }
  );
});

test("default export uses a temp directory and output inside source is refused", async t => {
  const sourceRoot = await temporaryDirectory(t, "docflow-export-default-source-");
  const publicRoot = path.join(sourceRoot, "public");
  await fs.promises.mkdir(publicRoot);
  await fs.promises.writeFile(path.join(publicRoot, "README.md"), "# Fixture\n");
  const repositories = fixtureRepositories();

  const result = await exportRepositories({ sourceRoot, repositories });
  t.after(() => fs.promises.rm(result.output, { recursive: true, force: true }));
  assert.equal(path.dirname(result.output), path.resolve(os.tmpdir()));
  assert.equal((await verifyExport(result.output)).ok, true);

  const unsafeOutput = path.join(sourceRoot, "exported");
  await assert.rejects(
    exportRepositories({
      sourceRoot,
      repositories,
      output: unsafeOutput,
      dryRun: true
    }),
    error => {
      assert.equal(error.code, "DOCFLOW_EXPORT_OUTPUT_UNSAFE");
      return true;
    }
  );
  assert.equal(await exists(unsafeOutput), false);
});
