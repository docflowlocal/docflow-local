"use strict";

// SPDX-License-Identifier: MPL-2.0

const fs = require("fs");
const path = require("path");
const { CORE_VERSION, SCHEMA_VERSION, createEngine } = require("./index");
const { ERROR_CODES, DocFlowError } = require("./contracts");
const { HTTP_LIMITS, createHttpServer } = require("./http-server");

const EXIT_CODES = Object.freeze({
  SUCCESS: 0,
  ERROR: 1,
  VALIDATION: 2
});
const CLI_LIMITS = HTTP_LIMITS;

const HELP = `DocFlow Core ${CORE_VERSION}

Usage:
  docflow generate --data <file> --template <file.docx> --output <directory> [options]
  docflow inspect [--data <file>] [--template <file.docx>]
  docflow validate --data <file> --template <file.docx> [options]
  docflow serve [--host 127.0.0.1] [--port 3765] [--token <secret>]

Options:
  --config <file.json>       Mapping, rule and naming job options
  --name <pattern>           Output path pattern, e.g. "{{customer}}-{{index}}"
  --required <a,b,c>         Required fields
  --strict                   Stop if any input row is invalid
  --overwrite                Replace existing output files (generate only)
  --help                     Show this help
  --version                  Show the Core version

The Core engine never writes files. The CLI is a filesystem adapter and uses
same-directory temporary files plus atomic rename for generated artifacts.
Generate is limited to 2,000 artifacts and 256 MiB of uncompressed output.
`;

function parseArguments(argv) {
  const positional = [];
  const flags = Object.create(null);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = String(argv[index]);
    if (!argument.startsWith("--")) {
      positional.push(argument);
      continue;
    }
    const equals = argument.indexOf("=");
    if (equals > 2) {
      flags[argument.slice(2, equals)] = argument.slice(equals + 1);
      continue;
    }
    const name = argument.slice(2);
    if (["help", "version", "strict", "overwrite", "allow-remote"].includes(name)) {
      flags[name] = true;
      continue;
    }
    const value = argv[index + 1];
    if (value == null || String(value).startsWith("--")) throw new Error(`--${name} requires a value`);
    flags[name] = String(value);
    index += 1;
  }
  return { command: positional.shift() || "", positional, flags };
}

async function readFileDescriptor(filename, label) {
  if (!filename) throw new Error(`${label} path is required`);
  const resolved = path.resolve(String(filename));
  let bytes;
  try {
    bytes = await fs.promises.readFile(resolved);
  } catch (error) {
    throw new Error(`Unable to read ${label} "${resolved}": ${error.message}`);
  }
  return { filename: path.basename(resolved), bytes };
}

async function readConfig(filename) {
  if (!filename) return {};
  const descriptor = await readFileDescriptor(filename, "config");
  let config;
  try {
    config = JSON.parse(descriptor.bytes.toString("utf8"));
  } catch (_error) {
    throw new Error("Config file must contain valid UTF-8 JSON");
  }
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Config file must contain a JSON object");
  }
  return config;
}

async function buildJob(flags) {
  const config = await readConfig(flags.config);
  return {
    schemaVersion: SCHEMA_VERSION,
    ...config,
    data: await readFileDescriptor(flags.data, "data"),
    template: await readFileDescriptor(flags.template, "template"),
    ...(flags.name ? {
      output: {
        ...(config.output || {}),
        pattern: flags.name
      }
    } : {}),
    ...(flags.required ? { requiredFields: flags.required.split(",").map(value => value.trim()).filter(Boolean) } : {}),
    ...(flags.strict ? { strict: true } : {})
  };
}

function safeDestination(root, relativePath) {
  const resolvedRoot = path.resolve(root);
  const destination = path.resolve(resolvedRoot, ...String(relativePath).split("/"));
  if (destination !== resolvedRoot && !destination.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Generated path escapes the output directory: ${relativePath}`);
  }
  return destination;
}

async function pathExists(filename) {
  try {
    await fs.promises.access(filename, fs.constants.F_OK);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function outputLimitError(kind, maximum, actual) {
  const artifactLimit = kind === "artifact-count";
  const formattedMaximum = maximum % (1024 * 1024) === 0
    ? `${maximum / 1024 / 1024} MiB`
    : `${maximum.toLocaleString("en-US")} bytes`;
  return new DocFlowError(
    ERROR_CODES.DATA_LIMIT,
    artifactLimit
      ? `Generated output exceeds the ${maximum.toLocaleString("en-US")}-artifact CLI limit`
      : `Generated output exceeds the ${formattedMaximum} uncompressed CLI limit`,
    {
      status: 413,
      details: {
        limit: kind,
        maximum,
        actual
      }
    }
  );
}

function outputLimits(options) {
  const configured = options.limits || CLI_LIMITS;
  const artifacts = Number(configured.artifacts);
  const uncompressedOutputBytes = Number(configured.uncompressedOutputBytes);
  if (!Number.isSafeInteger(artifacts) || artifacts < 1) {
    throw new TypeError("CLI artifact limit must be a positive safe integer");
  }
  if (!Number.isSafeInteger(uncompressedOutputBytes) || uncompressedOutputBytes < 1) {
    throw new TypeError("CLI output-byte limit must be a positive safe integer");
  }
  return {
    artifacts: Math.min(artifacts, CLI_LIMITS.artifacts),
    uncompressedOutputBytes: Math.min(
      uncompressedOutputBytes,
      CLI_LIMITS.uncompressedOutputBytes
    )
  };
}

async function existingPath(filename) {
  try {
    return await fs.promises.lstat(filename);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function restoreCommittedFiles(committed, backups) {
  const failures = [];
  for (const { destination } of [...committed].reverse()) {
    try {
      await fs.promises.unlink(destination);
    } catch (error) {
      if (error.code !== "ENOENT") failures.push(error);
    }
  }
  for (const { backup, destination } of [...backups].reverse()) {
    try {
      await fs.promises.rename(backup, destination);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) {
    throw new AggregateError(failures, "Unable to restore output files after a failed commit");
  }
}

async function atomicWriteFiles(outputDirectory, artifacts, options = {}) {
  if (!outputDirectory) throw new Error("--output is required");
  const root = path.resolve(String(outputDirectory));
  const limits = outputLimits(options);
  await fs.promises.mkdir(root, { recursive: true });
  const stagingRoot = await fs.promises.mkdtemp(path.join(root, ".docflow-staging-"));
  const stagedFilesRoot = path.join(stagingRoot, "files");
  const backupFilesRoot = path.join(stagingRoot, "backups");
  const targets = [];
  const destinations = new Set();
  let uncompressedOutputBytes = 0;
  let preserveStagingForRecovery = false;

  try {
    for await (const artifact of artifacts) {
      const artifactNumber = targets.length + 1;
      if (artifactNumber > limits.artifacts) {
        throw outputLimitError("artifact-count", limits.artifacts, artifactNumber);
      }
      const artifactBytes = artifact?.bytes?.length;
      if (!Number.isSafeInteger(artifactBytes) || artifactBytes < 0) {
        throw new DocFlowError(
          ERROR_CODES.INTERNAL,
          "Core produced an artifact with an invalid byte length",
          { status: 500 }
        );
      }
      uncompressedOutputBytes += artifactBytes;
      if (
        !Number.isSafeInteger(uncompressedOutputBytes)
        || uncompressedOutputBytes > limits.uncompressedOutputBytes
      ) {
        throw outputLimitError(
          "uncompressed-output-bytes",
          limits.uncompressedOutputBytes,
          uncompressedOutputBytes
        );
      }

      const destination = safeDestination(root, artifact.relativePath);
      const destinationKey = destination.normalize("NFC").toLocaleLowerCase("en-US");
      if (destinations.has(destinationKey)) {
        throw new DocFlowError(
          ERROR_CODES.OUTPUT_CONFLICT,
          `Generated output path conflicts with an earlier artifact: ${artifact.relativePath}`,
          { status: 409, details: { relativePath: artifact.relativePath } }
        );
      }
      destinations.add(destinationKey);
      if (!options.overwrite && await pathExists(destination)) {
        throw new Error(`Output already exists (use --overwrite to replace it): ${destination}`);
      }

      const stagedPath = safeDestination(stagedFilesRoot, artifact.relativePath);
      await fs.promises.mkdir(path.dirname(stagedPath), { recursive: true });
      const handle = await fs.promises.open(stagedPath, "wx", 0o600);
      try {
        await handle.writeFile(artifact.bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      targets.push({
        relativePath: artifact.relativePath,
        destination,
        stagedPath,
        bytes: artifactBytes,
        sha256: artifact.sha256,
        rowIndex: artifact.rowIndex
      });
    }

    const existingTargets = [];
    for (const target of targets) {
      const existing = await existingPath(target.destination);
      if (existing && !options.overwrite) {
        throw new Error(`Output already exists (use --overwrite to replace it): ${target.destination}`);
      }
      if (existing?.isDirectory()) {
        throw new Error(`Output path is a directory and cannot be replaced: ${target.destination}`);
      }
      if (existing) existingTargets.push(target);
    }
    for (const target of targets) {
      await fs.promises.mkdir(path.dirname(target.destination), { recursive: true });
    }

    const backups = [];
    const committed = [];
    try {
      for (const target of existingTargets) {
        const backup = safeDestination(backupFilesRoot, target.relativePath);
        await fs.promises.mkdir(path.dirname(backup), { recursive: true });
        await fs.promises.rename(target.destination, backup);
        backups.push({ backup, destination: target.destination });
      }
      for (const target of targets) {
        await fs.promises.rename(target.stagedPath, target.destination);
        committed.push(target);
      }
    } catch (error) {
      try {
        await restoreCommittedFiles(committed, backups);
      } catch (restoreError) {
        preserveStagingForRecovery = true;
        const aggregate = new AggregateError(
          [error, restoreError],
          `Output commit and rollback both failed; recovery files remain in ${stagingRoot}`
        );
        aggregate.stagingDirectory = stagingRoot;
        throw aggregate;
      }
      throw error;
    }

    await fs.promises.rm(stagingRoot, { recursive: true, force: true });
    return targets.map(({
      relativePath,
      destination,
      bytes,
      sha256,
      rowIndex
    }) => ({
      relativePath,
      destination,
      bytes,
      sha256,
      rowIndex
    }));
  } catch (error) {
    if (!preserveStagingForRecovery) {
      await fs.promises.rm(stagingRoot, { recursive: true, force: true }).catch(() => {});
    }
    throw error;
  }
}

async function runCli(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const parsed = parseArguments(argv);
  if (parsed.flags.version) {
    stdout.write(`${CORE_VERSION}\n`);
    return 0;
  }
  if (parsed.flags.help || !parsed.command) {
    stdout.write(HELP);
    return 0;
  }

  if (parsed.command === "serve") {
    const server = await createHttpServer({
      host: parsed.flags.host || "127.0.0.1",
      port: parsed.flags.port ? Number(parsed.flags.port) : 3765,
      token: parsed.flags.token,
      allowRemote: parsed.flags["allow-remote"] === true
    });
    stdout.write(`${JSON.stringify({
      origin: server.origin,
      token: server.token,
      api: "v1"
    })}\n`);
    if (io.onServer) {
      await io.onServer(server);
      return 0;
    }
    await new Promise(resolve => {
      const close = async () => {
        process.off("SIGINT", close);
        process.off("SIGTERM", close);
        await server.close().catch(() => {});
        resolve();
      };
      process.once("SIGINT", close);
      process.once("SIGTERM", close);
    });
    return 0;
  }

  const engine = createEngine();
  if (parsed.command === "inspect") {
    if (!parsed.flags.data && !parsed.flags.template) {
      throw new Error("inspect requires --data and/or --template");
    }
    const request = {};
    if (parsed.flags.data) request.data = await readFileDescriptor(parsed.flags.data, "data");
    if (parsed.flags.template) request.template = await readFileDescriptor(parsed.flags.template, "template");
    stdout.write(`${JSON.stringify(await engine.inspect(request), null, 2)}\n`);
    return 0;
  }
  if (parsed.command === "validate") {
    const validation = await engine.validate(await buildJob(parsed.flags));
    stdout.write(`${JSON.stringify(validation, null, 2)}\n`);
    return validation.ok ? 0 : 2;
  }
  if (parsed.command === "generate") {
    const job = await buildJob(parsed.flags);
    const files = await atomicWriteFiles(parsed.flags.output, engine.generate(job), {
      overwrite: parsed.flags.overwrite === true
    });
    stdout.write(`${JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      ok: true,
      generated: files.length,
      output: path.resolve(parsed.flags.output),
      files
    }, null, 2)}\n`);
    return 0;
  }
  stderr.write(`Unknown command: ${parsed.command}\n\n${HELP}`);
  return 1;
}

async function main(argv = process.argv.slice(2)) {
  try {
    process.exitCode = await runCli(argv);
  } catch (error) {
    process.stderr.write(`docflow: ${error.message || String(error)}\n`);
    if (process.env.DOCFLOW_DEBUG) process.stderr.write(`${error.stack || ""}\n`);
    process.exitCode = error.code === "DOCFLOW_VALIDATION_FAILED"
      ? EXIT_CODES.VALIDATION
      : EXIT_CODES.ERROR;
  }
}

module.exports = {
  CLI_LIMITS,
  EXIT_CODES,
  HELP,
  atomicWriteFiles,
  main,
  parseArguments,
  runCli
};
