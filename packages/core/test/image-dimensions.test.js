"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  MAX_IMAGE_BYTES,
  measureImageDimensions
} = require("../src/image-dimensions");
const { validateImageData } = require("../src/template-engine");

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

function jpeg(width, height) {
  return Buffer.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x0b, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x01, 0x01, 0x11, 0x00,
    0xff, 0xd9
  ]);
}

function gif(width, height) {
  const buffer = Buffer.alloc(10);
  buffer.write("GIF89a", 0, "ascii");
  buffer.writeUInt16LE(width, 6);
  buffer.writeUInt16LE(height, 8);
  return buffer;
}

function webpChunk(type, payload) {
  const padding = payload.length & 1;
  const buffer = Buffer.alloc(12 + 8 + payload.length + padding);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WEBP", 8, "ascii");
  buffer.write(type, 12, "ascii");
  buffer.writeUInt32LE(payload.length, 16);
  payload.copy(buffer, 20);
  return buffer;
}

function webpExtended(width, height) {
  const payload = Buffer.alloc(10);
  payload.writeUIntLE(width - 1, 4, 3);
  payload.writeUIntLE(height - 1, 7, 3);
  return webpChunk("VP8X", payload);
}

function webpLossless(width, height) {
  const payload = Buffer.alloc(5);
  payload[0] = 0x2f;
  payload.writeUInt32LE((((height - 1) << 14) | (width - 1)) >>> 0, 1);
  return webpChunk("VP8L", payload);
}

function webpLossy(width, height) {
  const payload = Buffer.alloc(10);
  payload.set([0x9d, 0x01, 0x2a], 3);
  payload.writeUInt16LE(width, 6);
  payload.writeUInt16LE(height, 8);
  return webpChunk("VP8 ", payload);
}

test("bounded image reader identifies PNG, JPEG, GIF and WebP dimensions", () => {
  assert.deepEqual(measureImageDimensions(PNG), { width: 1, height: 1, type: "png" });
  assert.deepEqual(measureImageDimensions(jpeg(640, 480)), { width: 640, height: 480, type: "jpg" });
  assert.deepEqual(measureImageDimensions(gif(320, 200)), { width: 320, height: 200, type: "gif" });
  assert.deepEqual(measureImageDimensions(webpExtended(800, 600)), { width: 800, height: 600, type: "webp" });
  assert.deepEqual(measureImageDimensions(webpLossless(257, 129)), { width: 257, height: 129, type: "webp" });
  assert.deepEqual(measureImageDimensions(webpLossy(1024, 768)), { width: 1024, height: 768, type: "webp" });
});

test("template image validation keeps the existing PNG/JPEG product boundary", () => {
  assert.equal(validateImageData(PNG).mimeType, "image/png");
  assert.equal(validateImageData(jpeg(12, 8)).mimeType, "image/jpeg");
  assert.throws(() => validateImageData(gif(12, 8)), /图片仅支持 PNG 或 JPEG/);
  assert.throws(() => validateImageData(webpExtended(12, 8)), /图片仅支持 PNG 或 JPEG/);
});

test("truncated and malformed PNG/JPEG headers are rejected promptly", { timeout: 1000 }, () => {
  for (let length = 0; length < 33; length += 1) {
    assert.throws(() => measureImageDimensions(PNG.subarray(0, length)));
  }
  assert.throws(() => measureImageDimensions(Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x42, 0x41, 0x44, 0x21,
    ...Buffer.alloc(17)
  ])), /IHDR/);

  assert.throws(() => measureImageDimensions(Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff])), /Truncated JPEG segment/);
  assert.throws(() => measureImageDimensions(Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x00])), /Invalid JPEG segment length/);

  const restartLoop = Buffer.alloc(2 + (MAX_IMAGE_BYTES - 2));
  restartLoop.set([0xff, 0xd8]);
  for (let offset = 2; offset < restartLoop.length; offset += 2) restartLoop.set([0xff, 0xd0], offset);
  assert.throws(() => measureImageDimensions(restartLoop), /too many segments/);
});

test("reader enforces its own input limit and bounded WebP chunk traversal", { timeout: 1000 }, () => {
  assert.throws(() => measureImageDimensions(Buffer.alloc(MAX_IMAGE_BYTES + 1)), /5 MB/);

  const chunks = Buffer.alloc(8 * 4097);
  for (let offset = 0; offset < chunks.length; offset += 8) chunks.write("JUNK", offset, "ascii");
  const webp = Buffer.alloc(12 + chunks.length);
  webp.write("RIFF", 0, "ascii");
  webp.writeUInt32LE(webp.length - 8, 4);
  webp.write("WEBP", 8, "ascii");
  chunks.copy(webp, 12);
  assert.throws(() => measureImageDimensions(webp), /too many chunks/);
});
