"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { PassThrough } = require("node:stream");
const { spawn } = require("node:child_process");
const test = require("node:test");
const AdmZip = require("adm-zip");
const { CLI_LIMITS, atomicWriteFiles, runCli } = require("../src/cli");
const { HTTP_LIMITS, createHttpServer } = require("../src/http-server");
const { minimalDocx, paragraph, visibleDocxText } = require("./helpers");

function multipart(dataBytes, templateBytes, options = {}) {
  const form = new FormData();
  form.append("data", new Blob([dataBytes]), "customers.json");
  form.append("template", new Blob([templateBytes]), "hello.docx");
  form.append("options", JSON.stringify(options));
  return form;
}

async function capture(stream) {
  const chunks = [];
  stream.on("data", chunk => chunks.push(chunk));
  await new Promise(resolve => stream.end(resolve));
  return Buffer.concat(chunks).toString("utf8");
}

function rawRequest(url, options) {
  return new Promise((resolve, reject) => {
    const request = http.request(url, options, response => {
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode,
        json: () => JSON.parse(Buffer.concat(chunks).toString("utf8"))
      }));
    });
    request.on("error", reject);
    request.end();
  });
}

function runBin(argumentsList) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      path.resolve(__dirname, "../bin/docflow.js"),
      ...argumentsList
    ], { stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", chunk => stdout.push(chunk));
    child.stderr.on("data", chunk => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", code => resolve({
      code,
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8")
    }));
  });
}

function syntheticArtifact(index, bytes) {
  return {
    schemaVersion: 1,
    relativePath: `artifact-${index}.docx`,
    bytes,
    mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    rowIndex: index,
    sha256: "0".repeat(64)
  };
}

function syntheticEngine(artifactCount, artifactBytes) {
  const state = { yielded: 0, closed: false };
  const bytes = Buffer.alloc(artifactBytes);
  return {
    state,
    engine: {
      registry: { apiVersion: "1" },
      async *generate() {
        try {
          for (let index = 0; index < artifactCount; index += 1) {
            state.yielded += 1;
            yield syntheticArtifact(index, bytes);
          }
        } finally {
          state.closed = true;
        }
      }
    }
  };
}

async function requestSyntheticGeneration(api, token) {
  return fetch(`${api.origin}/v1/generate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: multipart(Buffer.from("[]"), Buffer.from("ignored by synthetic engine"))
  });
}

test("CLI generate atomically writes Core artifacts", async t => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "docflow-core-cli-"));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const dataPath = path.join(directory, "customers.json");
  const templatePath = path.join(directory, "hello.docx");
  const outputPath = path.join(directory, "generated");
  await fs.promises.writeFile(dataPath, JSON.stringify([{ customer: "Acme" }, { customer: "Acme" }]));
  await fs.promises.writeFile(templatePath, minimalDocx(paragraph("Hello {{customer}}")));
  const stdout = new PassThrough();
  let text = "";
  stdout.on("data", chunk => {
    text += chunk.toString();
  });

  const exitCode = await runCli([
    "generate",
    "--data", dataPath,
    "--template", templatePath,
    "--output", outputPath,
    "--name", "{{customer}}"
  ], { stdout, stderr: new PassThrough() });
  assert.equal(exitCode, 0);
  const result = JSON.parse(text);
  assert.equal(result.generated, 2);
  assert.deepEqual(
    (await fs.promises.readdir(outputPath)).sort(),
    ["Acme-2.docx", "Acme.docx"]
  );
  assert.match(
    visibleDocxText(await fs.promises.readFile(path.join(outputPath, "Acme.docx"))),
    /Hello Acme/
  );
  const temporaryFiles = (await fs.promises.readdir(outputPath)).filter(name => name.endsWith(".tmp"));
  assert.deepEqual(temporaryFiles, []);
});

test("CLI streams artifacts into same-directory staging and removes it on generation failure", async t => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "docflow-core-cli-stage-"));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const outputPath = path.join(directory, "generated");

  async function* failsAfterOneArtifact() {
    yield syntheticArtifact(0, Buffer.from("first"));
    const entries = await fs.promises.readdir(outputPath);
    const stagingName = entries.find(name => name.startsWith(".docflow-staging-"));
    assert(stagingName);
    assert.equal(entries.includes("artifact-0.docx"), false);
    assert.equal(
      await fs.promises.readFile(
        path.join(outputPath, stagingName, "files", "artifact-0.docx"),
        "utf8"
      ),
      "first"
    );
    throw new Error("synthetic generation failed");
  }

  await assert.rejects(
    atomicWriteFiles(outputPath, failsAfterOneArtifact()),
    /synthetic generation failed/
  );
  assert.deepEqual(await fs.promises.readdir(outputPath), []);
});

test("CLI rejects too many staged artifacts without committing partial output", async t => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "docflow-core-cli-count-"));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const outputPath = path.join(directory, "generated");
  const synthetic = syntheticEngine(4, 1);

  assert.equal(CLI_LIMITS, HTTP_LIMITS);
  assert.equal(CLI_LIMITS.artifacts, 2_000);
  await assert.rejects(
    atomicWriteFiles(outputPath, synthetic.engine.generate(), {
      limits: {
        artifacts: 2,
        uncompressedOutputBytes: 10
      }
    }),
    error => {
      assert.equal(error.code, "DOCFLOW_DATA_LIMIT");
      assert.deepEqual(error.details, {
        limit: "artifact-count",
        maximum: 2,
        actual: 3
      });
      return true;
    }
  );
  assert.equal(synthetic.state.yielded, 3);
  assert.equal(synthetic.state.closed, true);
  assert.deepEqual(await fs.promises.readdir(outputPath), []);
});

test("CLI rejects excessive staged bytes without committing partial output", async t => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "docflow-core-cli-bytes-"));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const outputPath = path.join(directory, "generated");
  const synthetic = syntheticEngine(4, 3);

  assert.equal(CLI_LIMITS.uncompressedOutputBytes, 256 * 1024 * 1024);
  await assert.rejects(
    atomicWriteFiles(outputPath, synthetic.engine.generate(), {
      limits: {
        artifacts: 10,
        uncompressedOutputBytes: 5
      }
    }),
    error => {
      assert.equal(error.code, "DOCFLOW_DATA_LIMIT");
      assert.deepEqual(error.details, {
        limit: "uncompressed-output-bytes",
        maximum: 5,
        actual: 6
      });
      return true;
    }
  );
  assert.equal(synthetic.state.yielded, 2);
  assert.equal(synthetic.state.closed, true);
  assert.deepEqual(await fs.promises.readdir(outputPath), []);
});

test("CLI cleans staged files when a later artifact conflicts with existing output", async t => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "docflow-core-cli-conflict-"));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const outputPath = path.join(directory, "generated");
  await fs.promises.mkdir(outputPath);
  await fs.promises.writeFile(path.join(outputPath, "artifact-1.docx"), "existing");
  const synthetic = syntheticEngine(3, 1);

  await assert.rejects(
    atomicWriteFiles(outputPath, synthetic.engine.generate()),
    /Output already exists/
  );
  assert.equal(synthetic.state.yielded, 2);
  assert.equal(synthetic.state.closed, true);
  assert.deepEqual(await fs.promises.readdir(outputPath), ["artifact-1.docx"]);
  assert.equal(
    await fs.promises.readFile(path.join(outputPath, "artifact-1.docx"), "utf8"),
    "existing"
  );
});

test("CLI reserves exit code 2 for validate and strict-generation failures", async t => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "docflow-core-exit-"));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const dataPath = path.join(directory, "customers.json");
  const templatePath = path.join(directory, "hello.docx");
  const configPath = path.join(directory, "job.json");
  await fs.promises.writeFile(dataPath, JSON.stringify([{ customer: "" }]));
  await fs.promises.writeFile(templatePath, minimalDocx(paragraph("Hello {{customer}}")));
  await fs.promises.writeFile(configPath, JSON.stringify({
    schemaVersion: 1,
    requiredFields: ["customer"]
  }));

  const validated = await runBin([
    "validate",
    "--data", dataPath,
    "--template", templatePath,
    "--config", configPath
  ]);
  assert.equal(validated.code, 2, validated.stderr);

  const generated = await runBin([
    "generate",
    "--data", dataPath,
    "--template", templatePath,
    "--output", path.join(directory, "generated"),
    "--config", configPath,
    "--strict"
  ]);
  assert.equal(generated.code, 2, generated.stderr);
  assert.match(generated.stderr, /Generation stopped because validation failed/);
});

test("local API enforces Bearer, Host and Origin then returns a generated ZIP", async t => {
  const token = "test-token-with-at-least-24-characters";
  const api = await createHttpServer({ port: 0, token });
  t.after(() => api.close());

  const unauthorized = await fetch(`${api.origin}/v1/health`);
  assert.equal(unauthorized.status, 401);
  assert.equal((await unauthorized.json()).code, "DOCFLOW_UNAUTHORIZED");

  const untrustedOrigin = await fetch(`${api.origin}/v1/health`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Origin: "https://evil.example"
    }
  });
  assert.equal(untrustedOrigin.status, 403);
  assert.equal((await untrustedOrigin.json()).code, "DOCFLOW_ORIGIN_UNTRUSTED");

  const untrustedHost = await rawRequest(`${api.origin}/v1/health`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Host: "evil.example"
    }
  });
  assert.equal(untrustedHost.status, 403);
  assert.equal(untrustedHost.json().code, "DOCFLOW_HOST_UNTRUSTED");

  const healthy = await fetch(`${api.origin}/v1/health`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(healthy.status, 200);
  const healthBody = await healthy.json();
  assert.equal(healthBody.ok, true);
  assert.equal(healthBody.schemaVersion, 1);

  const malformed = await fetch(`${api.origin}/v1/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: "{}"
  });
  assert.equal(malformed.status, 415);
  assert.equal((await malformed.json()).code, "DOCFLOW_INVALID_REQUEST");

  const template = minimalDocx(paragraph("Hello {{customer}}"));
  const validated = await fetch(`${api.origin}/v1/validate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: multipart(
      Buffer.from(JSON.stringify([{ customer: "Acme" }])),
      template,
      { requiredFields: ["customer"] }
    )
  });
  assert.equal(validated.status, 200);
  assert.equal((await validated.json()).ok, true);

  const generated = await fetch(`${api.origin}/v1/generate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: multipart(
      Buffer.from(JSON.stringify([{ customer: "Acme" }])),
      template,
      { output: { pattern: "{{customer}}" } }
    )
  });
  assert.equal(generated.status, 200, await generated.clone().text());
  assert.equal(generated.headers.get("content-type"), "application/zip");
  assert.equal(generated.headers.get("x-docflow-artifacts"), "1");
  const archive = new AdmZip(Buffer.from(await generated.arrayBuffer()));
  assert(archive.getEntry("Acme.docx"));
  assert(archive.getEntry("docflow-manifest.json"));
  assert.equal(
    JSON.parse(archive.getEntry("docflow-manifest.json").getData().toString("utf8")).schemaVersion,
    1
  );
  assert.match(visibleDocxText(archive.getEntry("Acme.docx").getData()), /Hello Acme/);

  const inspected = await fetch(`${api.origin}/v1/inspect-template`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: (() => {
      const form = new FormData();
      form.append("template", new Blob([template]), "hello.docx");
      return form;
    })()
  });
  assert.equal(inspected.status, 200);
  assert.deepEqual((await inspected.json()).fields, ["customer"]);
});

test("local API stops generation when the artifact-count limit is exceeded", async t => {
  const token = "artifact-limit-test-token-123456";
  const synthetic = syntheticEngine(HTTP_LIMITS.artifacts + 25, 1);
  const api = await createHttpServer({ port: 0, token, engine: synthetic.engine });
  t.after(() => api.close());

  const response = await requestSyntheticGeneration(api, token);
  assert.equal(response.status, 413);
  assert.match(response.headers.get("content-type"), /^application\/problem\+json/);
  const problem = await response.json();
  assert.equal(problem.code, "DOCFLOW_DATA_LIMIT");
  assert.deepEqual(problem.details, {
    limit: "artifact-count",
    maximum: HTTP_LIMITS.artifacts,
    actual: HTTP_LIMITS.artifacts + 1
  });
  assert.equal(synthetic.state.yielded, HTTP_LIMITS.artifacts + 1);
  assert.equal(synthetic.state.closed, true, "the artifact iterator must be closed at the limit");
  assert.equal(response.headers.has("x-docflow-artifacts"), false);
});

test("local API stops generation when the uncompressed-output limit is exceeded", async t => {
  const token = "output-bytes-limit-token-123456";
  const oneMiB = 1024 * 1024;
  const firstRejectedArtifact = Math.floor(HTTP_LIMITS.uncompressedOutputBytes / oneMiB) + 1;
  const synthetic = syntheticEngine(firstRejectedArtifact + 10, oneMiB);
  const api = await createHttpServer({ port: 0, token, engine: synthetic.engine });
  t.after(() => api.close());

  const response = await requestSyntheticGeneration(api, token);
  assert.equal(response.status, 413);
  assert.match(response.headers.get("content-type"), /^application\/problem\+json/);
  const problem = await response.json();
  assert.equal(problem.code, "DOCFLOW_DATA_LIMIT");
  assert.deepEqual(problem.details, {
    limit: "uncompressed-output-bytes",
    maximum: HTTP_LIMITS.uncompressedOutputBytes,
    actual: firstRejectedArtifact * oneMiB
  });
  assert.equal(synthetic.state.yielded, firstRejectedArtifact);
  assert.equal(synthetic.state.closed, true, "the artifact iterator must be closed at the limit");
  assert.equal(response.headers.has("x-docflow-artifacts"), false);
});
