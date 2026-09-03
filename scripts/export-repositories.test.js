"use strict";

// SPDX-License-Identifier: MPL-2.0

const assert = require("node:assert/strict");
const { X509Certificate, createHash } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");
const { execFile } = require("node:child_process");
const test = require("node:test");
const {
  FORBIDDEN_DIRECTORY_NAMES,
  MANIFEST_FILENAME,
  PUBLIC_PACKAGE_BOOTSTRAP_REF,
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

  const [contractsPackage, corePackage, verifierPackage] = await Promise.all([
    fs.promises.readFile(
      path.join(SOURCE_ROOT, "packages/contracts/package.json"),
      "utf8"
    ).then(JSON.parse),
    fs.promises.readFile(
      path.join(SOURCE_ROOT, "packages/core/package.json"),
      "utf8"
    ).then(JSON.parse),
    fs.promises.readFile(
      path.join(SOURCE_ROOT, "packages/license-verifier/package.json"),
      "utf8"
    ).then(JSON.parse)
  ]);
  const desktopPackage = JSON.parse(
    await fs.promises.readFile(path.join(output, "docflow-desktop/package.json"))
  );
  assert.equal(
    desktopPackage.dependencies["@docflow-local/contracts"],
    contractsPackage.version
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
  assert.match(
    desktopPackage.scripts["build:win:self-signed-preview"],
    /desktop\/package-win-self-signed-preview\.ps1/
  );
  assert.match(
    desktopPackage.scripts["test:release"],
    /node desktop\/windows-self-signed-preview-config-test\.js/
  );
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
    if (repository !== "docs") {
      assert.equal(packageJson.overrides?.["brace-expansion"], undefined);
      assert.equal(packageJson.overrides?.uuid, "11.1.1");
    }
    if (["docflow-desktop", "templates", "plugins", "examples"].includes(repository)) {
      assert.equal(
        packageJson.dependencies["@docflow-local/contracts"],
        contractsPackage.version
      );
      assert.equal(packageJson.dependencies["@docflow-local/core"], corePackage.version);
    }
    const workflow = await fs.promises.readFile(
      path.join(output, repository, ".github/workflows/ci.yml"),
      "utf8"
    );
    assert.match(workflow, /permissions:\n  contents: read/);
    assert.match(workflow, /actions\/checkout@v7/);
    assert.match(workflow, /actions\/setup-node@v7/);
    if (["docflow-desktop", "templates", "plugins", "examples"].includes(repository)) {
      assert.match(workflow, new RegExp(`ref: ${PUBLIC_PACKAGE_BOOTSTRAP_REF}`));
      assert.doesNotMatch(workflow, /ref: main/);
      assert.match(workflow, /npm pack \.\/packages\/core/);
      assert.match(workflow, /Verify reviewed dependency versions/);
      assert.match(workflow, /@docflow-local\/contracts/);
      assert.match(workflow, /@docflow-local\/core/);
      assert(
        workflow.indexOf("Verify reviewed dependency versions") <
          workflow.indexOf("Install dependencies from reviewed tarballs")
      );
      assert.match(workflow, /--save-exact/);
      assert.match(workflow, /--package-lock=true/);
      assert.match(workflow, /npm ls --all/);
      assert.match(workflow, /npm audit --audit-level=high/);
      assert.doesNotMatch(workflow, /npm audit --omit=dev/);
      assert.match(workflow, /git checkout -- package\.json/);
      assert.match(workflow, /rm -f package-lock\.json/);
    }
    if (repository === "docflow-desktop") {
      assert.match(workflow, /os: \[ubuntu-latest, macos-latest, windows-latest\]/);
      assert.match(workflow, /npm ci --ignore-scripts/);
      assert.match(workflow, /release-readiness\.js --lockfile-only/);
      assert.match(workflow, /hashFiles\('package-lock\.json'\) != ''/);
      assert.match(workflow, /id: bootstrap_mode/);
      assert.match(
        workflow,
        /BOOTSTRAP_ENABLED: \$\{\{ hashFiles\('project\/package-lock\.json'\) == '' \}\}/
      );
      assert.match(
        workflow,
        /if: \$\{\{ steps\.bootstrap_mode\.outputs\.enabled == 'true' \}\}/
      );
      assert.doesNotMatch(
        workflow.slice(workflow.indexOf("Install dependencies from reviewed tarballs")),
        /hashFiles\('project\/package-lock\.json'\)/
      );
      assert.match(workflow, /@docflow-local\/license-verifier/);
      for (const scriptName of [
        "package-win-self-signed-preview.ps1",
        "windows-preview-certificate.ps1",
        "prepare-windows-preview-signing.ps1",
        "cleanup-windows-preview-signing.ps1"
      ]) {
        assert(workflow.includes(scriptName), `Windows CI must parse ${scriptName}`);
      }
      const windowsPackageWorkflow = await fs.promises.readFile(
        path.join(output, repository, ".github/workflows/windows-package.yml"),
        "utf8"
      );
      assert.match(windowsPackageWorkflow, /workflow_dispatch:/);
      assert.match(windowsPackageWorkflow, /CSC_IDENTITY_AUTO_DISCOVERY: "false"/);
      assert.match(windowsPackageWorkflow, /--publish" "never/);
      assert.match(windowsPackageWorkflow, /npm run test:desktop/);
      assert.match(windowsPackageWorkflow, /Get-AuthenticodeSignature/);
      assert.match(windowsPackageWorkflow, /distribution = "internal-preview"/);
      assert.match(windowsPackageWorkflow, /actions\/upload-artifact@v7/);
      assert.doesNotMatch(
        windowsPackageWorkflow,
        /sourceRef = "\$\{\{ inputs\.source_ref \}\}"/
      );

      const previewFiles = {
        workflow: ".github/workflows/windows-self-signed-preview.yml",
        config: "desktop/electron-builder.win-self-signed-preview.cjs",
        script: "desktop/package-win-self-signed-preview.ps1",
        prepare: "desktop/prepare-windows-preview-signing.ps1",
        cleanup: "desktop/cleanup-windows-preview-signing.ps1",
        metadataGenerator: "scripts/generate-windows-self-signed-preview-metadata.js",
        certificate: "build/windows-preview/DocFlow-Local-Preview-CodeSigning.cer",
        metadata: "build/windows-preview/certificate.json",
        documentation: "release/WINDOWS_SELF_SIGNED_PREVIEW.md"
      };
      for (const relativePath of Object.values(previewFiles)) {
        assert.equal(
          await exists(path.join(output, repository, relativePath)),
          true,
          `${relativePath} must be included in the public Desktop export`
        );
      }

      const previewWorkflow = await fs.promises.readFile(
        path.join(output, repository, previewFiles.workflow),
        "utf8"
      );
      assert.match(previewWorkflow, /^on:\n  workflow_dispatch:/m);
      assert.doesNotMatch(
        previewWorkflow,
        /^\s*(?:push|pull_request|pull_request_target|workflow_call|schedule):/m
      );
      assert.match(
        previewWorkflow,
        /^\s+environment:\s+windows-self-signed-preview\s*$/m
      );
      assert.match(previewWorkflow, /permissions:\n  contents: read/);
      assert.match(previewWorkflow, /actions\/checkout@[a-f0-9]{40}/);
      assert.match(previewWorkflow, /actions\/setup-node@[a-f0-9]{40}/);
      assert.match(previewWorkflow, /actions\/upload-artifact@[a-f0-9]{40}/);
      assert.match(previewWorkflow, /persist-credentials:\s+false/);
      for (const secretName of [
        "DOCFLOW_WIN_PREVIEW_PFX_BASE64",
        "DOCFLOW_WIN_PREVIEW_PFX_PASSWORD"
      ]) {
        assert.equal(
          [...previewWorkflow.matchAll(new RegExp(`secrets\\.${secretName}`, "g"))].length,
          1,
          `${secretName} must be injected exactly once`
        );
      }
      assert.doesNotMatch(
        previewWorkflow.slice(0, previewWorkflow.indexOf("    steps:")),
        /\$\{\{\s*secrets\./,
        "private signing values must not be job-level environment variables"
      );
      const secretReference = previewWorkflow.indexOf("secrets.DOCFLOW_WIN_PREVIEW_PFX_BASE64");
      const importStepStart = previewWorkflow.lastIndexOf("\n      - ", secretReference);
      assert(importStepStart >= 0);
      const importStepEnd = previewWorkflow.indexOf("\n      - ", secretReference);
      const importStep = previewWorkflow.slice(
        importStepStart,
        importStepEnd < 0 ? previewWorkflow.length : importStepEnd
      );
      for (const command of ["npm run test:desktop", "npm run test:release"]) {
        const commandIndex = previewWorkflow.indexOf(command);
        assert(
          commandIndex >= 0 && commandIndex < importStepStart,
          `${command} must finish before the signing key is imported`
        );
      }
      assert.match(importStep, /secrets\.DOCFLOW_WIN_PREVIEW_PFX_PASSWORD/);
      assert.match(importStep, /desktop\/prepare-windows-preview-signing\.ps1/);
      assert.doesNotMatch(importStep, /(?:npm run|electron-builder)/);
      assert.doesNotMatch(
        previewWorkflow,
        /(?:Write-(?:Host|Output)|echo)[^\n]*(?:PFX_BASE64|PFX_PASSWORD)/i
      );
      assert.doesNotMatch(previewWorkflow, /--channel["' ]+public/);
      assert.match(previewWorkflow, /if:\s*\$\{\{\s*always\(\)\s*\}\}/);
      assert.match(previewWorkflow, /build:win:self-signed-preview -- -SkipTests/);

      const uploadStepStart = previewWorkflow.indexOf("actions/upload-artifact@");
      assert(uploadStepStart >= 0);
      const uploadStepEnd = previewWorkflow.indexOf("\n      - ", uploadStepStart);
      const uploadStep = previewWorkflow.slice(
        uploadStepStart,
        uploadStepEnd < 0 ? previewWorkflow.length : uploadStepEnd
      );
      assert.match(uploadStep, /windows-community-\*-x64-self-signed-preview\/\*/);
      assert.doesNotMatch(
        uploadStep,
        /(?:\.pfx|\.p12|PRIVATE KEY|PFX_BASE64|password|RUNNER_TEMP)/i
      );

      const previewConfig = await fs.promises.readFile(
        path.join(output, repository, previewFiles.config),
        "utf8"
      );
      const previewScript = await fs.promises.readFile(
        path.join(output, repository, previewFiles.script),
        "utf8"
      );
      const previewMetadataGenerator = await fs.promises.readFile(
        path.join(output, repository, previewFiles.metadataGenerator),
        "utf8"
      );
      const previewPreparation = await fs.promises.readFile(
        path.join(output, repository, previewFiles.prepare),
        "utf8"
      );
      const previewCleanup = await fs.promises.readFile(
        path.join(output, repository, previewFiles.cleanup),
        "utf8"
      );
      const previewImplementation = [
        previewWorkflow,
        previewConfig,
        previewScript,
        previewMetadataGenerator
      ].join("\n");
      assert.match(previewConfig, /certificateSha1:\s*metadata\.sha1Thumbprint/);
      assert.match(previewConfig, /signingHashAlgorithms:\s*\["sha256"\]/);
      assert.match(previewConfig, /rfc3161TimeStampServer/);
      assert.doesNotMatch(previewConfig, /certificate(?:File|Password|SubjectName)/);
      assert.match(previewImplementation, /TimeStamperCertificate/);
      assert.match(previewImplementation, /sha1Thumbprint/);
      assert.match(previewImplementation, /distribution\s*[:=]\s*"self-signed-preview"/);
      assert.match(previewImplementation, /signatureTrust\s*[:=]\s*"self-signed"/);
      assert.match(previewImplementation, /publiclyTrusted\s*[:=]\s*\$?false/);
      assert.match(previewImplementation, /signed\s*[:=]\s*\$?true/);
      assert.match(previewMetadataGenerator, /publicReleaseEligible:\s*false/);
      assert.doesNotMatch(previewMetadataGenerator, /(?:\.pfx|\.p12|PFX_BASE64|PFX_PASSWORD)/i);
      assert.doesNotMatch(previewImplementation, /windowsAuthenticode[^\n]*complete/i);
      assert.match(previewPreparation, /Import-PfxCertificate/);
      assert.doesNotMatch(previewPreparation, /-Exportable\b/);
      assert.match(previewPreparation, /RUNNER_ENVIRONMENT\s+-ne\s+"github-hosted"/);
      assert.match(previewPreparation, /ConvertTo-SecureString/);
      assert.match(previewPreparation, /finally\s*\{/);
      assert.match(previewPreparation, /Remove-Item[^\n]*\$PfxPath/);
      assert.doesNotMatch(
        previewPreparation,
        /(?:Write-(?:Host|Output)|echo)[^\n]*(?:PFX_BASE64|PFX_PASSWORD)/i
      );
      assert.match(previewCleanup, /RUNNER_ENVIRONMENT\s+-ne\s+"github-hosted"/);
      assert.match(previewCleanup, /Remove-Item/);

      const previewCertificateBytes = await fs.promises.readFile(
        path.join(output, repository, previewFiles.certificate)
      );
      const previewCertificateMetadata = JSON.parse(await fs.promises.readFile(
        path.join(output, repository, previewFiles.metadata),
        "utf8"
      ));
      const previewCertificate = new X509Certificate(previewCertificateBytes);
      assert.deepEqual(previewCertificate.raw, previewCertificateBytes);
      assert.equal(previewCertificate.subject, previewCertificateMetadata.subject);
      assert.equal(previewCertificate.issuer, previewCertificateMetadata.issuer);
      assert.equal(previewCertificate.subject, previewCertificate.issuer);
      assert.equal(previewCertificate.verify(previewCertificate.publicKey), true);
      assert.equal(previewCertificate.ca, false);
      assert.deepEqual(previewCertificate.keyUsage, ["1.3.6.1.5.5.7.3.3"]);
      assert.equal(previewCertificateMetadata.purpose, "windows-self-signed-preview-only");
      assert.equal(previewCertificateMetadata.publiclyTrusted, false);
      assert.equal(
        createHash("sha1").update(previewCertificateBytes).digest("hex").toUpperCase(),
        previewCertificateMetadata.sha1Thumbprint
      );
      assert.equal(
        createHash("sha256").update(previewCertificateBytes).digest("hex").toUpperCase(),
        previewCertificateMetadata.sha256Fingerprint
      );

      const previewDocumentation = await fs.promises.readFile(
        path.join(output, repository, previewFiles.documentation),
        "utf8"
      );
      assert.match(previewDocumentation, /self-signed/i);
      assert.match(previewDocumentation, /not publicly trusted/i);
      assert.match(previewDocumentation, /SmartScreen/i);
      assert.match(previewDocumentation, /sha256Fingerprint|SHA-256(?: certificate)? fingerprint/i);

      const exportedPreviewPaths = result.manifest.repositories
        .find(item => item.name === "docflow-desktop")
        .files.map(file => file.path);
      assert.equal(
        exportedPreviewPaths.some(file => /\.(?:pfx|p12|pem|key)$/i.test(file)),
        false,
        "the Desktop export must never include private signing material"
      );
    }
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
  assert.match(
    desktopReleaseResult.stdout,
    /Windows self-signed Preview certificate\/config tests passed/
  );

  const docsResult = await execFileAsync(npmCommand, ["test"], {
    cwd: path.join(output, "docs"),
    encoding: "utf8"
  });
  assert.match(docsResult.stdout, /validated \d+ Markdown files and \d+ relative links/);

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

  const transitionLock = JSON.parse(
    await fs.promises.readFile(path.join(SOURCE_ROOT, "package-lock.json"), "utf8")
  );
  const completeRegistryPackages = {};
  for (const [packagePath, lockedPackage] of Object.entries(
    transitionLock.packages || {}
  )) {
    if (
      packagePath.startsWith("node_modules/") &&
      lockedPackage.link !== true
    ) {
      completeRegistryPackages[packagePath] = structuredClone(lockedPackage);
    }
  }
  const fixtureIntegrity = `sha512-${Buffer.alloc(64, 23).toString("base64")}`;
  completeRegistryPackages["node_modules/@docflow-local/contracts"] = {
    version: contractsPackage.version,
    resolved: `https://registry.npmjs.org/@docflow-local/contracts/-/contracts-${contractsPackage.version}.tgz`,
    integrity: fixtureIntegrity
  };
  completeRegistryPackages["node_modules/@docflow-local/core"] = {
    version: corePackage.version,
    resolved: `https://registry.npmjs.org/@docflow-local/core/-/core-${corePackage.version}.tgz`,
    integrity: fixtureIntegrity,
    dependencies: {
      "@docflow-local/contracts": contractsPackage.version
    }
  };
  completeRegistryPackages["node_modules/@docflow-local/license-verifier"] = {
    version: verifierPackage.version,
    resolved: `https://registry.npmjs.org/@docflow-local/license-verifier/-/license-verifier-${verifierPackage.version}.tgz`,
    integrity: fixtureIntegrity
  };
  const registryLock = {
    name: desktopPackage.name,
    version: desktopPackage.version,
    lockfileVersion: 3,
    packages: {
      "": lockedRoot,
      ...completeRegistryPackages
    }
  };
  const missingDirectLock = structuredClone(registryLock);
  delete missingDirectLock.packages["node_modules/pdf-lib"];
  await fs.promises.writeFile(desktopLockPath, canonicalJson(missingDirectLock));
  const missingDirectResult = exportedReadiness.validateReleaseLockfile(desktopRoot, {
    requireRegistryPackages: true
  });
  assert.strictEqual(missingDirectResult.valid, false);
  assert(missingDirectResult.errors.some(error => /node_modules\/pdf-lib is missing/.test(error)));

  const missingTransitiveLock = structuredClone(registryLock);
  delete missingTransitiveLock.packages["node_modules/pako"];
  await fs.promises.writeFile(desktopLockPath, canonicalJson(missingTransitiveLock));
  const missingTransitiveResult = exportedReadiness.validateReleaseLockfile(desktopRoot, {
    requireRegistryPackages: true
  });
  assert.strictEqual(missingTransitiveResult.valid, false);
  assert(missingTransitiveResult.errors.some(
    error => /node_modules\/pdf-lib dependencies\.pako cannot resolve/.test(error)
  ));

  const maliciousHostLock = structuredClone(registryLock);
  maliciousHostLock.packages["node_modules/@docflow-local/core"].resolved =
    `https://packages.example.invalid/@docflow-local/core/-/core-${corePackage.version}.tgz`;
  await fs.promises.writeFile(desktopLockPath, canonicalJson(maliciousHostLock));
  const maliciousHostResult = exportedReadiness.validateReleaseLockfile(desktopRoot, {
    requireRegistryPackages: true
  });
  assert.strictEqual(maliciousHostResult.valid, false);
  assert(maliciousHostResult.errors.some(error => /trusted registry\.npmjs\.org/.test(error)));

  const maliciousPathLock = structuredClone(registryLock);
  maliciousPathLock.packages["node_modules/@docflow-local/core"].resolved =
    `https://registry.npmjs.org/@docflow-local/license-verifier/-/license-verifier-${corePackage.version}.tgz`;
  await fs.promises.writeFile(desktopLockPath, canonicalJson(maliciousPathLock));
  const maliciousPathResult = exportedReadiness.validateReleaseLockfile(desktopRoot, {
    requireRegistryPackages: true
  });
  assert.strictEqual(maliciousPathResult.valid, false);
  assert(maliciousPathResult.errors.some(error => /tarball path does not match/.test(error)));

  const shortSriLock = structuredClone(registryLock);
  shortSriLock.packages["node_modules/@docflow-local/core"].integrity = "sha512-eA==";
  await fs.promises.writeFile(desktopLockPath, canonicalJson(shortSriLock));
  const shortSriResult = exportedReadiness.validateReleaseLockfile(desktopRoot, {
    requireRegistryPackages: true
  });
  assert.strictEqual(shortSriResult.valid, false);
  assert(shortSriResult.errors.some(error => /valid package integrity hash/.test(error)));

  await fs.promises.writeFile(desktopLockPath, canonicalJson(registryLock));
  const registryResult = exportedReadiness.validateReleaseLockfile(desktopRoot, {
    requireRegistryPackages: true
  });
  assert.strictEqual(registryResult.valid, true, registryResult.errors.join("\n"));
  const exportedMetadata = require(
    path.join(desktopRoot, "scripts", "generate-release-metadata.js")
  );
  assert.strictEqual(exportedMetadata.requirePackageLock(desktopRoot), desktopLockPath);
  const lockGateResult = await execFileAsync(
    process.execPath,
    ["scripts/release-readiness.js", "--lockfile-only"],
    {
      cwd: desktopRoot,
      encoding: "utf8"
    }
  );
  assert.match(lockGateResult.stdout, /PASS RELEASE_LOCKFILE/);
  const bootstrappedReleaseTest = await execFileAsync(
    process.execPath,
    ["scripts/release-readiness-test.js"],
    {
      cwd: desktopRoot,
      encoding: "utf8"
    }
  );
  assert.match(
    bootstrappedReleaseTest.stdout,
    /DocFlow release readiness tests passed/
  );
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
