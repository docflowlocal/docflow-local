#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const {
  assessRelease,
  validateReleaseLockfile
} = require("./release-readiness");

const ROOT_DIR = path.resolve(__dirname, "..");

function parseArguments(argv) {
  let archProvided = false;
  const options = {
    rootDir: ROOT_DIR,
    channel: "internal",
    platform: process.platform === "win32" ? "windows" : "macOS",
    arch: process.arch === "arm64" ? "arm64" : "x64",
    outputDir: path.join(ROOT_DIR, "dist", "release-metadata"),
    dryRun: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--channel") {
      options.channel = argv[++index];
    } else if (argument === "--platform") {
      options.platform = argv[++index];
    } else if (argument === "--output") {
      options.outputDir = path.resolve(argv[++index]);
    } else if (argument === "--arch") {
      options.arch = argv[++index];
      archProvided = true;
    } else if (argument === "--dry-run") {
      options.dryRun = true;
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

function run(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024
  }).trim();
}

function runNpm(args, cwd) {
  const npmExecPath = String(process.env.npm_execpath || "").trim();
  if (npmExecPath && fs.existsSync(npmExecPath)) {
    return run(process.execPath, [npmExecPath, ...args], cwd);
  }
  if (process.platform === "win32") {
    const safeArguments = args.map(argument => {
      if (!/^[A-Za-z0-9@/_.=-]+$/.test(argument)) {
        throw new Error(`Unsafe npm argument for Windows command wrapper: ${argument}`);
      }
      return argument;
    });
    return run(
      process.env.ComSpec || "cmd.exe",
      ["/d", "/s", "/c", ["npm.cmd", ...safeArguments].join(" ")],
      cwd
    );
  }
  return run("npm", args, cwd);
}

function sha256Bytes(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function packageInventory(rootDir) {
  const rootPackage = JSON.parse(
    fs.readFileSync(path.join(rootDir, "package.json"), "utf8")
  );
  const workspaceDirectories = [
    "packages/contracts",
    "packages/core",
    "packages/license-verifier",
    "packages/desktop-extension-sdk"
  ];
  const presentWorkspaceDirectories = workspaceDirectories.filter(relativeDirectory => (
    fs.existsSync(path.join(rootDir, relativeDirectory, "package.json"))
  ));

  if (
    presentWorkspaceDirectories.length > 0 &&
    presentWorkspaceDirectories.length !== workspaceDirectories.length
  ) {
    throw new Error("Cannot inventory a partial public package workspace");
  }

  const inventory = [{
    name: rootPackage.name,
    version: rootPackage.version,
    license: rootPackage.license,
    private: rootPackage.private === true
  }];

  if (presentWorkspaceDirectories.length === workspaceDirectories.length) {
    return inventory.concat(workspaceDirectories.map(relativeDirectory => {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(rootDir, relativeDirectory, "package.json"), "utf8")
      );
      return {
        name: packageJson.name,
        version: packageJson.version,
        license: packageJson.license,
        private: packageJson.private === true
      };
    }));
  }

  for (const name of ["@docflow-local/core", "@docflow-local/license-verifier"]) {
    const version = rootPackage.dependencies?.[name];
    if (!version) continue;
    inventory.push({
      name,
      version,
      license: null,
      private: false,
      external: true
    });
  }
  return inventory;
}

function sourceRepository(rootDir) {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(rootDir, "package.json"), "utf8")
  );
  const repository = typeof packageJson.repository === "string"
    ? packageJson.repository
    : packageJson.repository?.url;
  return repository || "https://github.com/docflowlocal/docflow-local.git";
}

function requirePackageLock(rootDir) {
  const splitDesktop = !fs.existsSync(path.join(rootDir, "packages", "core", "package.json"));
  const validation = validateReleaseLockfile(rootDir, {
    requireRegistryPackages: splitDesktop
  });
  if (!validation.valid) {
    throw new Error(
      `package-lock.json is required and must match the release dependency graph: ${validation.errors.join("; ")}`
    );
  }
  return validation.path;
}

function atomicWrite(filePath, bytes) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${crypto.randomBytes(6).toString("hex")}`;
  try {
    fs.writeFileSync(temporaryPath, bytes, { flag: "wx", mode: 0o644 });
    fs.renameSync(temporaryPath, filePath);
  } finally {
    try {
      fs.unlinkSync(temporaryPath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}

function generateMetadata({
  rootDir = ROOT_DIR,
  channel = "internal",
  platform = process.platform === "win32" ? "windows" : "macOS",
  arch = platform === "windows" ? "x64" : process.arch === "arm64" ? "arm64" : "x64",
  outputDir = path.join(rootDir, "dist", "release-metadata"),
  dryRun = false
} = {}) {
  const readiness = assessRelease({
    rootDir,
    channel,
    platform,
    arch,
    sourceOnly: false
  });
  if (!readiness.ready) {
    const blockerIds = readiness.checks
      .filter(check => check.status === "blocker")
      .map(check => check.id);
    const error = new Error(`Release gates failed: ${blockerIds.join(", ")}`);
    error.code = "DOCFLOW_RELEASE_BLOCKED";
    error.readiness = readiness;
    throw error;
  }

  requirePackageLock(rootDir);
  const sbomText = runNpm(
    [
      "sbom",
      "--omit=dev",
      "--package-lock-only",
      "--sbom-format=cyclonedx",
      "--sbom-type=application"
    ],
    rootDir
  );
  const sbom = JSON.parse(sbomText);
  const sbomBytes = Buffer.from(`${JSON.stringify(sbom, null, 2)}\n`, "utf8");
  const sbomName =
    `docflow-local-${readiness.release.version}-${readiness.release.platform}-${arch}.cdx.json`;

  const source = {
    repository: sourceRepository(rootDir),
    commit: run("git", ["rev-parse", "HEAD"], rootDir),
    branch: run("git", ["branch", "--show-current"], rootDir),
    dirty: readiness.checks.find(check => check.id === "GIT_STATUS")?.status !== "pass"
  };
  const evidencePath = path.join(rootDir, "release", "release-evidence.json");
  const evidenceBytes = fs.readFileSync(evidencePath);
  const generatedAt = process.env.SOURCE_DATE_EPOCH
    ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString()
    : new Date().toISOString();
  const manifest = {
    schemaVersion: 1,
    product: "DocFlow Local",
    version: readiness.release.version,
    channel,
    platform: readiness.release.platform,
    arch,
    generatedAt,
    source,
    packages: packageInventory(rootDir),
    artifacts: readiness.release.artifacts,
    sbom: {
      format: "CycloneDX",
      specificationVersion: sbom.specVersion,
      file: sbomName,
      bytes: sbomBytes.length,
      sha256: sha256Bytes(sbomBytes)
    },
    releaseEvidence: {
      file: "release/release-evidence.json",
      sha256: sha256Bytes(evidenceBytes)
    },
    readiness: {
      pass: readiness.counts.pass,
      warnings: readiness.checks
        .filter(check => check.status === "warning")
        .map(check => check.id),
      blockers: []
    }
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  if (!dryRun) {
    const resolvedRoot = path.resolve(rootDir);
    const resolvedOutput = path.resolve(outputDir);
    const relativeOutput = path.relative(resolvedRoot, resolvedOutput);
    if (
      relativeOutput === "" ||
      relativeOutput.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeOutput)
    ) {
      throw new Error("Release metadata output must be a subdirectory of the repository");
    }
    atomicWrite(path.join(resolvedOutput, sbomName), sbomBytes);
    atomicWrite(path.join(resolvedOutput, "release-manifest.json"), manifestBytes);
  }

  return { manifest, sbom, outputDir, dryRun };
}

function printHelp() {
  process.stdout.write(`Usage: node scripts/generate-release-metadata.js [options]

Options:
  --channel internal|public  Apply internal or public release gates.
  --platform macOS|windows   Select the target release platform.
  --arch arm64|x64           Select the target artifact architecture.
  --output PATH              Output directory inside the repository.
  --dry-run                  Validate and generate in memory without writing.
  -h, --help                 Show this help.
`);
}

if (require.main === module) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      printHelp();
    } else {
      const result = generateMetadata(options);
      process.stdout.write(
        `${JSON.stringify(
          {
            version: result.manifest.version,
            channel: result.manifest.channel,
            platform: result.manifest.platform,
            arch: result.manifest.arch,
            commit: result.manifest.source.commit,
            artifacts: result.manifest.artifacts,
            sbom: result.manifest.sbom,
            output: result.dryRun ? null : result.outputDir
          },
          null,
          2
        )}\n`
      );
    }
  } catch (error) {
    process.stderr.write(`Release metadata failed: ${error.message}\n`);
    if (error.readiness) {
      process.stderr.write(`${JSON.stringify(error.readiness, null, 2)}\n`);
    }
    process.exitCode = error.code === "DOCFLOW_RELEASE_BLOCKED" ? 2 : 1;
  }
}

module.exports = {
  atomicWrite,
  generateMetadata,
  packageInventory,
  parseArguments,
  requirePackageLock,
  runNpm,
  sha256Bytes
};
