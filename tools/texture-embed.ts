/**
 * GLB texture extraction & re-embedding.
 *
 * Extract: bun tools/texture-embed.ts extract <path.glb>
 *   → stdout JSON array of {index, width, height, mimeType, dataUrl}
 *
 * Embed:   bun tools/texture-embed.ts embed <path.glb> <textureIndex> <newImage.png>
 *   → replaces texture in-place, backs up original first
 */
import { Jimp } from "jimp";
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "fs";
import { resolve, basename, extname, dirname } from "path";

const [command, ...rest] = process.argv.slice(2);

if (!command || !["extract", "embed"].includes(command)) {
  console.error("Usage:");
  console.error("  bun tools/texture-embed.ts extract <path.glb>");
  console.error("  bun tools/texture-embed.ts embed <path.glb> <textureIndex> <newImage.png>");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// GLB parsing helpers
// ---------------------------------------------------------------------------

function parseGlb(buf: Buffer) {
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const view = new DataView(ab);

  // Header: magic(4) + version(4) + length(4) = 12
  const magic = view.getUint32(0, true);
  if (magic !== 0x46546c67) throw new Error("Not a GLB file");

  // JSON chunk: length(4) + type(4) + data
  const jsonLen = view.getUint32(12, true);
  const jsonStr = new TextDecoder().decode(new Uint8Array(ab, 20, jsonLen));
  const json = JSON.parse(jsonStr);

  // BIN chunk
  const binChunkOffset = 20 + jsonLen;
  const binLen = view.getUint32(binChunkOffset, true);
  const binData = new Uint8Array(ab, binChunkOffset + 8, binLen);

  return { json, jsonLen, binData, binChunkOffset };
}

function getImageBytes(json: any, binData: Uint8Array, imageIndex: number): Uint8Array {
  const imgDef = json.images[imageIndex];
  const bv = json.bufferViews[imgDef.bufferView];
  const offset = bv.byteOffset || 0;
  const length = bv.byteLength;
  return binData.slice(offset, offset + length);
}

// ---------------------------------------------------------------------------
// Extract
// ---------------------------------------------------------------------------

if (command === "extract") {
  const glbPath = resolve(process.cwd(), rest[0] || "");
  if (!glbPath || !existsSync(glbPath)) {
    console.error("GLB file not found: " + (rest[0] || "(none)"));
    process.exit(1);
  }

  const buf = readFileSync(glbPath);
  const { json, binData } = parseGlb(buf);
  const imgCount = json.images?.length ?? 0;
  const results: any[] = [];

  for (let i = 0; i < imgCount; i++) {
    const imgBytes = getImageBytes(json, binData, i);
    const image = await Jimp.read(Buffer.from(imgBytes));

    // Detect mime type from magic bytes
    let mimeType = json.images[i].mimeType || "image/png";
    if (imgBytes[0] === 0x89 && imgBytes[1] === 0x50) mimeType = "image/png";
    else if (imgBytes[0] === 0xff && imgBytes[1] === 0xd8) mimeType = "image/jpeg";

    // Encode to PNG for editing regardless of source format
    const pngBuf = await image.getBuffer("image/png");
    const b64 = Buffer.from(pngBuf).toString("base64");

    results.push({
      index: i,
      width: image.width,
      height: image.height,
      mimeType,
      dataUrl: "data:image/png;base64," + b64,
    });
  }

  console.log(JSON.stringify(results));
}

// ---------------------------------------------------------------------------
// Embed
// ---------------------------------------------------------------------------

if (command === "embed") {
  const glbPath = resolve(process.cwd(), rest[0] || "");
  const textureIndex = parseInt(rest[1], 10);
  const newImagePath = resolve(process.cwd(), rest[2] || "");

  if (!existsSync(glbPath)) {
    console.error("GLB file not found: " + (rest[0] || "(none)"));
    process.exit(1);
  }
  if (isNaN(textureIndex)) {
    console.error("Invalid texture index: " + rest[1]);
    process.exit(1);
  }
  if (!existsSync(newImagePath)) {
    console.error("Image file not found: " + (rest[2] || "(none)"));
    process.exit(1);
  }

  const buf = readFileSync(glbPath);
  const { json, binData } = parseGlb(buf);

  if (textureIndex < 0 || textureIndex >= (json.images?.length ?? 0)) {
    console.error("Texture index " + textureIndex + " out of range (0-" + ((json.images?.length ?? 1) - 1) + ")");
    process.exit(1);
  }

  // Read new image bytes
  const newImgBuf = readFileSync(newImagePath);

  // Find the target image's bufferView
  const imgDef = json.images[textureIndex];
  const bvIndex = imgDef.bufferView;
  const bv = json.bufferViews[bvIndex];
  const oldOffset = bv.byteOffset || 0;
  const oldLength = bv.byteLength;

  // Build new BIN chunk by replacing the target image bytes
  // We need to rebuild because the new image may be a different size
  const newImgBytes = new Uint8Array(newImgBuf);
  const sizeDiff = newImgBytes.length - oldLength;

  // Create new bin data
  const newBinLength = binData.length + sizeDiff;
  const newBinData = new Uint8Array(newBinLength);

  // Copy bytes before the target image
  newBinData.set(binData.subarray(0, oldOffset), 0);
  // Insert new image bytes
  newBinData.set(newImgBytes, oldOffset);
  // Copy bytes after the target image
  newBinData.set(binData.subarray(oldOffset + oldLength), oldOffset + newImgBytes.length);

  // Update the target bufferView
  bv.byteLength = newImgBytes.length;

  // Update mimeType to PNG since we always save as PNG
  imgDef.mimeType = "image/png";

  // Fix all subsequent bufferView offsets
  for (const otherBv of json.bufferViews) {
    if (otherBv === bv) continue;
    const otherOffset = otherBv.byteOffset || 0;
    if (otherOffset > oldOffset) {
      otherBv.byteOffset = otherOffset + sizeDiff;
    }
  }

  // Update buffer total length
  json.buffers[0].byteLength = newBinLength;

  // Rebuild GLB
  const jsonStr = JSON.stringify(json);
  // JSON chunk must be padded to 4-byte alignment with spaces
  const jsonPadded = jsonStr + " ".repeat((4 - (jsonStr.length % 4)) % 4);
  const jsonBytes = new TextEncoder().encode(jsonPadded);

  // BIN chunk must be padded to 4-byte alignment with zeros
  const binPad = (4 - (newBinData.length % 4)) % 4;
  const paddedBinLength = newBinData.length + binPad;

  // Total GLB size: header(12) + json chunk header(8) + json + bin chunk header(8) + bin
  const totalLength = 12 + 8 + jsonBytes.length + 8 + paddedBinLength;

  const outBuf = new ArrayBuffer(totalLength);
  const outView = new DataView(outBuf);
  const outArr = new Uint8Array(outBuf);

  // GLB header
  outView.setUint32(0, 0x46546c67, true); // magic
  outView.setUint32(4, 2, true);           // version
  outView.setUint32(8, totalLength, true);  // total length

  // JSON chunk
  outView.setUint32(12, jsonBytes.length, true);
  outView.setUint32(16, 0x4e4f534a, true); // "JSON"
  outArr.set(jsonBytes, 20);

  // BIN chunk
  const binStart = 20 + jsonBytes.length;
  outView.setUint32(binStart, paddedBinLength, true);
  outView.setUint32(binStart + 4, 0x004e4942, true); // "BIN\0"
  outArr.set(newBinData, binStart + 8);
  // Padding zeros are already 0 from ArrayBuffer init

  writeFileSync(glbPath, Buffer.from(outBuf));
  console.log("Embedded texture " + textureIndex + " into " + glbPath + " (" + newImgBytes.length + " bytes)");
}
