"use strict";

// SPDX-License-Identifier: MPL-2.0

const crypto = require("crypto");
const http = require("http");
const path = require("path");
const AdmZip = require("adm-zip");
const Busboy = require("busboy");
const { CORE_VERSION, SCHEMA_VERSION, createEngine } = require("./index");
const { ERROR_CODES, DocFlowError, problemFromError } = require("./contracts");

const MAX_DATA_BYTES = 25 * 1024 * 1024;
const MAX_TEMPLATE_BYTES = 100 * 1024 * 1024;
const MAX_MULTIPART_BYTES = 126 * 1024 * 1024;
const MAX_OPTIONS_BYTES = 64 * 1024;
const MAX_HTTP_ARTIFACTS = 2_000;
const MAX_HTTP_OUTPUT_BYTES = 256 * 1024 * 1024;
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const HTTP_LIMITS = Object.freeze({
  artifacts: MAX_HTTP_ARTIFACTS,
  uncompressedOutputBytes: MAX_HTTP_OUTPUT_BYTES
});

function responseHeaders(contentType, length) {
  return {
    "Content-Type": contentType,
    ...(Number.isSafeInteger(length) ? { "Content-Length": length } : {}),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  };
}

function sendJson(response, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, responseHeaders("application/json; charset=utf-8", body.length));
  response.end(body);
}

function sendProblem(response, problem) {
  const body = Buffer.from(JSON.stringify(problem));
  response.writeHead(
    problem.status,
    responseHeaders("application/problem+json; charset=utf-8", body.length)
  );
  response.end(body);
}

function sameSecret(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function assertSafeJson(value, depth = 0) {
  if (depth > 24) throw new Error("options JSON nesting exceeds 24 levels");
  if (value == null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("options contains a non-finite number");
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 10_000) throw new Error("options array is too large");
    for (const entry of value) assertSafeJson(entry, depth + 1);
    return;
  }
  if (typeof value !== "object") throw new Error("options contains an unsupported value");
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) throw new Error(`options contains a forbidden key: ${key}`);
    assertSafeJson(entry, depth + 1);
  }
}

function parseOptions(value) {
  if (!value) return {};
  if (Buffer.byteLength(value, "utf8") > MAX_OPTIONS_BYTES) throw new Error("options exceeds the 64 KB limit");
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (_error) {
    throw new Error("options must be valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("options must be a JSON object");
  }
  assertSafeJson(parsed);
  return parsed;
}

function readMultipart(request) {
  return new Promise((resolve, reject) => {
    if (!/^multipart\/form-data\b/i.test(String(request.headers["content-type"] || ""))) {
      reject(Object.assign(new Error("Content-Type must be multipart/form-data"), { statusCode: 415 }));
      return;
    }
    const declaredLength = Number(request.headers["content-length"]);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_MULTIPART_BYTES) {
      reject(Object.assign(new Error("Multipart request exceeds the 126 MB limit"), { statusCode: 413 }));
      return;
    }
    let parser;
    try {
      parser = Busboy({
        headers: request.headers,
        limits: {
          fileSize: MAX_TEMPLATE_BYTES,
          files: 2,
          fields: 8,
          fieldSize: MAX_OPTIONS_BYTES,
          parts: 10
        }
      });
    } catch (error) {
      reject(Object.assign(new Error(`Invalid multipart request: ${error.message}`), { statusCode: 400 }));
      return;
    }
    const files = Object.create(null);
    const fields = Object.create(null);
    const seenFileFields = new Set();
    let totalBytes = 0;
    let failure = null;

    const fail = (message, statusCode = 400) => {
      failure ||= Object.assign(new Error(message), { statusCode });
    };

    parser.on("file", (fieldName, stream, info) => {
      const key = String(fieldName || "");
      const chunks = [];
      let size = 0;
      if (!["data", "template"].includes(key) || seenFileFields.has(key)) {
        fail(`Unexpected or duplicate file field "${key}"`);
        stream.resume();
        return;
      }
      seenFileFields.add(key);
      stream.on("data", chunk => {
        size += chunk.length;
        totalBytes += chunk.length;
        if (totalBytes > MAX_MULTIPART_BYTES) fail("Multipart request exceeds the 126 MB limit", 413);
        if (key === "data" && size > MAX_DATA_BYTES) fail("Data file exceeds the 25 MB limit", 413);
        if (!failure) chunks.push(chunk);
      });
      stream.on("limit", () => fail(`${key} file exceeds its size limit`, 413));
      stream.on("error", error => fail(error.message));
      stream.on("end", () => {
        if (!failure) {
          files[key] = {
            filename: path.basename(String(info.filename || key)),
            mediaType: String(info.mimeType || "application/octet-stream"),
            bytes: Buffer.concat(chunks)
          };
        }
      });
    });
    parser.on("field", (name, value, info) => {
      if (info.valueTruncated) fail(`Field "${name}" exceeds the 64 KB limit`, 413);
      else fields[String(name)] = String(value);
    });
    parser.on("filesLimit", () => fail("Multipart request contains too many files", 413));
    parser.on("fieldsLimit", () => fail("Multipart request contains too many fields", 413));
    parser.on("partsLimit", () => fail("Multipart request contains too many parts", 413));
    parser.on("error", error => reject(error));
    parser.on("finish", () => failure ? reject(failure) : resolve({ files, fields }));
    request.on("aborted", () => reject(new Error("Request was aborted")));
    request.pipe(parser);
  });
}

function requestJob(upload) {
  if (!upload.files.data) throw new Error('Multipart field "data" is required');
  if (!upload.files.template) throw new Error('Multipart field "template" is required');
  return {
    schemaVersion: SCHEMA_VERSION,
    ...parseOptions(upload.fields.options),
    data: upload.files.data,
    template: upload.files.template
  };
}

function zipArtifacts(artifacts) {
  const zip = new AdmZip();
  const manifest = [];
  for (const artifact of artifacts) {
    zip.addFile(artifact.relativePath, artifact.bytes);
    manifest.push({
      relativePath: artifact.relativePath,
      mediaType: artifact.mediaType,
      rowIndex: artifact.rowIndex,
      bytes: artifact.bytes.length,
      sha256: artifact.sha256
    });
  }
  zip.addFile("docflow-manifest.json", Buffer.from(JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    product: "@docflow/core",
    version: CORE_VERSION,
    generatedAt: new Date().toISOString(),
    artifacts: manifest
  }, null, 2)));
  return zip.toBuffer();
}

async function collectHttpArtifacts(iterable) {
  const artifacts = [];
  let uncompressedOutputBytes = 0;
  for await (const artifact of iterable) {
    const artifactNumber = artifacts.length + 1;
    if (artifactNumber > MAX_HTTP_ARTIFACTS) {
      throw new DocFlowError(
        ERROR_CODES.DATA_LIMIT,
        `Generated output exceeds the ${MAX_HTTP_ARTIFACTS}-artifact HTTP limit`,
        {
          status: 413,
          details: {
            limit: "artifact-count",
            maximum: MAX_HTTP_ARTIFACTS,
            actual: artifactNumber
          }
        }
      );
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
      || uncompressedOutputBytes > MAX_HTTP_OUTPUT_BYTES
    ) {
      throw new DocFlowError(
        ERROR_CODES.DATA_LIMIT,
        "Generated output exceeds the 256 MB uncompressed HTTP limit",
        {
          status: 413,
          details: {
            limit: "uncompressed-output-bytes",
            maximum: MAX_HTTP_OUTPUT_BYTES,
            actual: uncompressedOutputBytes
          }
        }
      );
    }
    artifacts.push(artifact);
  }
  return artifacts;
}

async function createHttpServer(options = {}) {
  const engine = options.engine || createEngine(options.engineOptions);
  const host = String(options.host || "127.0.0.1");
  if (!options.allowRemote && !LOOPBACK_HOSTS.has(host)) {
    throw new Error("Refusing to bind the Core API beyond loopback without allowRemote: true");
  }
  const token = String(options.token || crypto.randomBytes(32).toString("base64url"));
  if (Buffer.byteLength(token) < 24) throw new Error("API bearer token must be at least 24 bytes");
  const requestedPort = options.port == null ? 0 : Number(options.port);
  if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65_535) {
    throw new Error("API port must be an integer from 0 through 65535");
  }
  const allowedOrigins = new Set((options.allowedOrigins || []).map(String));
  let expectedHost = "";
  let origin = "";

  const server = http.createServer(async (request, response) => {
    try {
      const hostHeader = String(request.headers.host || "").toLowerCase();
      if (!expectedHost || hostHeader !== expectedHost.toLowerCase()) {
        const problem = problemFromError(new DocFlowError(
          ERROR_CODES.HOST_UNTRUSTED,
          "Request Host is not trusted",
          { status: 403 }
        ), request.url);
        sendProblem(response, problem);
        return;
      }
      const requestOrigin = String(request.headers.origin || "");
      if (requestOrigin && requestOrigin !== origin && !allowedOrigins.has(requestOrigin)) {
        const problem = problemFromError(new DocFlowError(
          ERROR_CODES.ORIGIN_UNTRUSTED,
          "Request Origin is not trusted",
          { status: 403 }
        ), request.url);
        sendProblem(response, problem);
        return;
      }
      const authorization = String(request.headers.authorization || "");
      const suppliedToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
      if (!sameSecret(suppliedToken, token)) {
        const problem = problemFromError(new DocFlowError(
          ERROR_CODES.UNAUTHORIZED,
          "A valid bearer token is required",
          { status: 401 }
        ), request.url);
        sendProblem(response, problem);
        return;
      }

      const requestUrl = new URL(request.url, origin);
      if (request.method === "GET" && requestUrl.pathname === "/v1/health") {
        sendJson(response, 200, {
          schemaVersion: SCHEMA_VERSION,
          ok: true,
          product: "@docflow/core",
          version: CORE_VERSION,
          apiVersion: "v1",
          pluginApiVersion: engine.registry.apiVersion
        });
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/v1/inspect-template") {
        const upload = await readMultipart(request);
        if (!upload.files.template) throw new Error('Multipart field "template" is required');
        sendJson(response, 200, await engine.inspectTemplate({ template: upload.files.template }));
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/v1/validate") {
        const upload = await readMultipart(request);
        sendJson(response, 200, await engine.validate(requestJob(upload)));
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/v1/generate") {
        const upload = await readMultipart(request);
        const artifacts = await collectHttpArtifacts(engine.generate(requestJob(upload)));
        const archive = zipArtifacts(artifacts);
        response.writeHead(200, {
          ...responseHeaders("application/zip", archive.length),
          "Content-Disposition": 'attachment; filename="docflow-output.zip"',
          "X-DocFlow-Artifacts": String(artifacts.length)
        });
        response.end(archive);
        return;
      }
      if (!["GET", "POST"].includes(request.method)) {
        sendJson(response, 405, { error: "Method not allowed", code: "METHOD_NOT_ALLOWED" });
        return;
      }
      sendJson(response, 404, { error: "Not found", code: "NOT_FOUND" });
    } catch (error) {
      const normalized = error instanceof DocFlowError
        ? error
        : new DocFlowError(
          error.statusCode === 413 ? ERROR_CODES.DATA_LIMIT : ERROR_CODES.INVALID_REQUEST,
          error.message || "Request failed",
          { status: Number(error.statusCode) || 400, cause: error }
        );
      const problem = problemFromError(normalized, request.url);
      if (!response.headersSent) {
        sendProblem(response, problem);
      } else {
        response.end();
      }
    }
  });

  server.requestTimeout = Number(options.requestTimeoutMs) || 120_000;
  server.headersTimeout = Math.min(server.requestTimeout, Number(options.headersTimeoutMs) || 15_000);
  server.keepAliveTimeout = 5_000;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(requestedPort, host, resolve);
  });
  const address = server.address();
  const displayHost = address.family === "IPv6" ? `[${address.address}]` : address.address;
  expectedHost = `${displayHost}:${address.port}`;
  origin = `http://${expectedHost}`;

  return Object.freeze({
    engine,
    origin,
    token,
    server,
    close: () => new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    })
  });
}

module.exports = {
  HTTP_LIMITS,
  createHttpServer
};
