"use strict";

// SPDX-License-Identifier: MPL-2.0

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_JPEG_SEGMENTS = 4096;
const MAX_WEBP_CHUNKS = 4096;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_STANDALONE_MARKERS = new Set([0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7]);

function checkedDimensions(type, width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new Error(`Invalid ${type.toUpperCase()} image dimensions`);
  }
  return { width, height, type };
}

function readPng(buffer) {
  // Signature + IHDR length/type/data + CRC. Requiring the complete first
  // chunk prevents truncated headers from being treated as valid images.
  if (buffer.length < 33) throw new Error("Truncated PNG header");
  if (buffer.readUInt32BE(8) !== 13 || buffer.toString("ascii", 12, 16) !== "IHDR") {
    throw new Error("PNG is missing its IHDR chunk");
  }
  return checkedDimensions("png", buffer.readUInt32BE(16), buffer.readUInt32BE(20));
}

function isJpegStartOfFrame(marker) {
  return marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
}

function readJpeg(buffer) {
  if (buffer.length < 4) throw new Error("Truncated JPEG header");
  let offset = 2;
  let segmentCount = 0;

  while (offset < buffer.length) {
    segmentCount += 1;
    if (segmentCount > MAX_JPEG_SEGMENTS) throw new Error("JPEG contains too many segments");
    if (buffer[offset] !== 0xff) throw new Error("Malformed JPEG marker");

    // JPEG permits fill bytes before a marker. The offset always advances and
    // the input limit bounds this scan even for adversarial files.
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) throw new Error("Truncated JPEG marker");
    const marker = buffer[offset];
    offset += 1;

    if (marker === 0x00) throw new Error("Unexpected JPEG stuffed byte");
    if (marker === 0xd9 || marker === 0xda) break;
    if (JPEG_STANDALONE_MARKERS.has(marker)) continue;
    if (marker === 0xd8) throw new Error("Unexpected JPEG start marker");
    if (offset + 2 > buffer.length) throw new Error("Truncated JPEG segment length");

    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2) throw new Error("Invalid JPEG segment length");
    const segmentEnd = offset + segmentLength;
    if (segmentEnd > buffer.length) throw new Error("Truncated JPEG segment");

    if (isJpegStartOfFrame(marker)) {
      if (segmentLength < 8) throw new Error("Truncated JPEG frame header");
      return checkedDimensions("jpg", buffer.readUInt16BE(offset + 5), buffer.readUInt16BE(offset + 3));
    }
    offset = segmentEnd;
  }

  throw new Error("JPEG dimensions were not found");
}

function readGif(buffer) {
  if (buffer.length < 10) throw new Error("Truncated GIF header");
  return checkedDimensions("gif", buffer.readUInt16LE(6), buffer.readUInt16LE(8));
}

function readUInt24LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function readWebpDimensions(buffer, chunkType, payloadOffset, chunkSize) {
  if (chunkType === "VP8X") {
    if (chunkSize < 10) throw new Error("Truncated WebP VP8X header");
    return checkedDimensions(
      "webp",
      readUInt24LE(buffer, payloadOffset + 4) + 1,
      readUInt24LE(buffer, payloadOffset + 7) + 1
    );
  }
  if (chunkType === "VP8L") {
    if (chunkSize < 5 || buffer[payloadOffset] !== 0x2f) throw new Error("Malformed WebP VP8L header");
    const byte1 = buffer[payloadOffset + 1];
    const byte2 = buffer[payloadOffset + 2];
    const byte3 = buffer[payloadOffset + 3];
    const byte4 = buffer[payloadOffset + 4];
    return checkedDimensions(
      "webp",
      1 + byte1 + ((byte2 & 0x3f) << 8),
      1 + (byte2 >> 6) + (byte3 << 2) + ((byte4 & 0x0f) << 10)
    );
  }
  if (chunkType === "VP8 ") {
    if (
      chunkSize < 10
      || buffer[payloadOffset + 3] !== 0x9d
      || buffer[payloadOffset + 4] !== 0x01
      || buffer[payloadOffset + 5] !== 0x2a
    ) {
      throw new Error("Malformed WebP VP8 header");
    }
    return checkedDimensions(
      "webp",
      buffer.readUInt16LE(payloadOffset + 6) & 0x3fff,
      buffer.readUInt16LE(payloadOffset + 8) & 0x3fff
    );
  }
  return null;
}

function readWebp(buffer) {
  if (buffer.length < 20) throw new Error("Truncated WebP header");
  const riffSize = buffer.readUInt32LE(4);
  if (riffSize < 12 || riffSize > buffer.length - 8) throw new Error("Invalid or truncated WebP RIFF size");
  const riffEnd = riffSize + 8;
  let offset = 12;
  let chunkCount = 0;

  while (offset + 8 <= riffEnd) {
    chunkCount += 1;
    if (chunkCount > MAX_WEBP_CHUNKS) throw new Error("WebP contains too many chunks");
    const chunkType = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const payloadOffset = offset + 8;
    const payloadEnd = payloadOffset + chunkSize;
    if (!Number.isSafeInteger(payloadEnd) || payloadEnd > riffEnd) throw new Error("Truncated WebP chunk");

    const dimensions = readWebpDimensions(buffer, chunkType, payloadOffset, chunkSize);
    if (dimensions) return dimensions;

    const nextOffset = payloadEnd + (chunkSize & 1);
    if (nextOffset <= offset || nextOffset > riffEnd) throw new Error("Invalid WebP chunk size");
    offset = nextOffset;
  }

  throw new Error("WebP dimensions were not found");
}

function measureImageDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new TypeError("Image input must be a non-empty Buffer");
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error("Image exceeds the 5 MB limit");

  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return readPng(buffer);
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return readJpeg(buffer);
  const signature = buffer.toString("ascii", 0, 6);
  if (signature === "GIF87a" || signature === "GIF89a") return readGif(buffer);
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return readWebp(buffer);
  }
  throw new Error("Unsupported image format");
}

module.exports = {
  MAX_IMAGE_BYTES,
  measureImageDimensions
};
