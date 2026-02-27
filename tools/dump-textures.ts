/**
 * Extract all textures from a GLB to PNG files for visual QC.
 *
 * Usage: bun run tools/dump-textures.ts <input.glb> [--out <dir>]
 */
import { Jimp } from "jimp";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, basename, extname } from "path";

const args = process.argv.slice(2);
let inputPath = "";
let outDir = "";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out" && args[i + 1]) { outDir = args[++i]; }
  else if (!args[i].startsWith("--")) { inputPath = args[i]; }
}

if (!inputPath) {
  console.log("Usage: bun run tools/dump-textures.ts <input.glb> [--out <dir>]");
  process.exit(1);
}

const glbPath = resolve(process.cwd(), inputPath);
const modelName = basename(glbPath, extname(glbPath));
if (!outDir) outDir = resolve(process.cwd(), "tools/out/textures_" + modelName);
else outDir = resolve(process.cwd(), outDir);

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

console.log("Input:  " + glbPath);
console.log("Output: " + outDir);

// Parse GLB
const buf = readFileSync(glbPath);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const view = new DataView(ab);

const jsonLen = view.getUint32(12, true);
const json = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 20, jsonLen)));
const binOffset = 20 + jsonLen;
const binLen = view.getUint32(binOffset, true);
const binData = new Uint8Array(ab, binOffset + 8, binLen);

const imgCount = json.images?.length ?? 0;
console.log("Found " + imgCount + " image(s)\n");

for (let i = 0; i < imgCount; i++) {
  const imgDef = json.images[i];
  const bv = json.bufferViews[imgDef.bufferView];
  const offset = bv.byteOffset || 0;
  const length = bv.byteLength;
  const imgBytes = binData.slice(offset, offset + length);

  const image = await Jimp.read(Buffer.from(imgBytes));
  const outPath = resolve(outDir, "texture_" + i + ".png");
  await image.write(outPath as `${string}.${string}`);

  console.log(
    "[" + i + "] " + image.bitmap.width + "x" + image.bitmap.height +
    "  " + imgDef.mimeType +
    "  " + (length / 1024).toFixed(0) + " KB" +
    "  -> " + outPath
  );

  // Show which materials reference this image
  for (let m = 0; m < (json.materials?.length ?? 0); m++) {
    const mat = json.materials[m];
    const texIdx = mat.pbrMetallicRoughness?.baseColorTexture?.index;
    if (texIdx !== undefined) {
      const texDef = json.textures[texIdx];
      if (texDef.source === i) {
        console.log("     used by material[" + m + "] \"" + (mat.name || "?") + "\"");
      }
    }
  }
}

console.log("\nDone!");
