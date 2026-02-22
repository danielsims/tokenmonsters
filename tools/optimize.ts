/**
 * GLB Optimizer — terminal-ready asset processing.
 *
 * Takes a single-instance GLB and produces a smaller, terminal-optimized version:
 * 1. Downscale textures (4096 → 1024 or custom size)
 * 2. Boost contrast & saturation for terminal visibility
 * 3. Compress to JPEG where appropriate (massive size reduction)
 * 4. Optionally decimate geometry (reduce vertex count)
 *
 * Usage: bun run tools/optimize.ts <input.glb> [options]
 *
 * Options:
 *   --out <path>         Output file path (default: <input>_opt.glb)
 *   --tex-size <n>       Max texture dimension (default: 1024)
 *   --quality <n>        JPEG quality 1-100 (default: 85)
 *   --format <fmt>       Texture format: jpeg | png (default: jpeg)
 *   --contrast <n>       Contrast boost amount (default: 0.12)
 *   --saturation <n>     Saturation boost amount (default: 15)
 *   --no-boost           Skip contrast/saturation boost
 *   --decimate <ratio>   Decimate geometry to this ratio (0.0-1.0, e.g. 0.5 = half)
 */
import { Jimp, ResizeStrategy } from "jimp";
import { readFileSync, writeFileSync } from "fs";
import { resolve, basename, dirname, extname } from "path";

// ─── CLI ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let inputPath = "";
let outPath = "";
let maxTexSize = 1024;
let jpegQuality = 85;
let texFormat: "jpeg" | "png" = "jpeg";
let contrast = 0.12;
let saturation = 15;
let noBoost = false;
let decimateRatio = 1.0; // 1.0 = keep all

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out" && args[i + 1]) { outPath = args[++i]; }
  else if (args[i] === "--tex-size" && args[i + 1]) { maxTexSize = parseInt(args[++i], 10); }
  else if (args[i] === "--quality" && args[i + 1]) { jpegQuality = parseInt(args[++i], 10); }
  else if (args[i] === "--format" && args[i + 1]) { texFormat = args[++i] as "jpeg" | "png"; }
  else if (args[i] === "--contrast" && args[i + 1]) { contrast = parseFloat(args[++i]); }
  else if (args[i] === "--saturation" && args[i + 1]) { saturation = parseFloat(args[++i]); }
  else if (args[i] === "--no-boost") { noBoost = true; }
  else if (args[i] === "--decimate" && args[i + 1]) { decimateRatio = parseFloat(args[++i]); }
  else if (!args[i].startsWith("--")) { inputPath = args[i]; }
}

if (!inputPath) {
  console.log("Usage: bun run tools/optimize.ts <input.glb> [--out <path>] [--tex-size <n>] [--quality <n>] [--format jpeg|png]");
  process.exit(1);
}

const glbPath = resolve(process.cwd(), inputPath);
if (!outPath) {
  const dir = dirname(glbPath);
  const name = basename(glbPath, extname(glbPath));
  outPath = resolve(dir, name + "_opt.glb");
}
outPath = resolve(process.cwd(), outPath);

console.log("Input:     " + glbPath);
console.log("Output:    " + outPath);
console.log("Max tex:   " + maxTexSize + "px");
console.log("Format:    " + texFormat + (texFormat === "jpeg" ? " (q=" + jpegQuality + ")" : ""));
console.log("Boost:     " + (noBoost ? "off" : "contrast=" + contrast + " sat=" + saturation));
if (decimateRatio < 1.0) console.log("Decimate:  " + (decimateRatio * 100).toFixed(0) + "%");
console.log("");

// ─── Parse GLB ──────────────────────────────────────────────────────────────

const fileBuf = readFileSync(glbPath);
const ab = fileBuf.buffer.slice(fileBuf.byteOffset, fileBuf.byteOffset + fileBuf.byteLength);
const view = new DataView(ab);

if (view.getUint32(0, true) !== 0x46546C67) {
  console.log("ERROR: Not a valid GLB file");
  process.exit(1);
}

const jsonChunkLen = view.getUint32(12, true);
const gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 20, jsonChunkLen)));
const binChunkOffset = 20 + jsonChunkLen;
const binChunkLen = view.getUint32(binChunkOffset, true);
const binData = new Uint8Array(ab, binChunkOffset + 8, binChunkLen);

const originalSize = fileBuf.byteLength;
console.log("Original: " + (originalSize / 1024).toFixed(0) + " KB");

// ─── Process images ─────────────────────────────────────────────────────────

const processedImages: Array<{ buffer: Buffer; mimeType: string }> = [];

for (let i = 0; i < (gltf.images?.length ?? 0); i++) {
  const imgDef = gltf.images[i];
  const bv = gltf.bufferViews[imgDef.bufferView];
  const imgOffset = bv.byteOffset || 0;
  const imgLength = bv.byteLength;
  const imgBytes = binData.slice(imgOffset, imgOffset + imgLength);

  console.log("Image [" + i + "]: " + (imgLength / 1024).toFixed(0) + " KB original");

  const image = await Jimp.read(Buffer.from(imgBytes));
  const origW = image.bitmap.width;
  const origH = image.bitmap.height;

  // Downscale if needed
  if (origW > maxTexSize || origH > maxTexSize) {
    const aspect = origW / origH;
    const newW = aspect >= 1 ? maxTexSize : Math.round(maxTexSize * aspect);
    const newH = aspect >= 1 ? Math.round(maxTexSize / aspect) : maxTexSize;
    image.resize({ w: newW, h: newH, mode: ResizeStrategy.BICUBIC });
    console.log("  Resized: " + origW + "x" + origH + " -> " + newW + "x" + newH);
  }

  // Contrast and saturation boost for terminal visibility
  if (!noBoost) {
    try {
      image.contrast(contrast);
      image.color([{ apply: "saturate", params: [saturation] }]);
      console.log("  Boosted: contrast=" + contrast + " saturation=" + saturation);
    } catch (e) {
      console.log("  Warning: boost failed, skipping");
    }
  }

  // Encode
  let outBuf: Buffer;
  let mimeType: string;

  if (texFormat === "jpeg") {
    outBuf = await image.getBuffer("image/jpeg", { quality: jpegQuality });
    mimeType = "image/jpeg";
  } else {
    outBuf = await image.getBuffer("image/png");
    mimeType = "image/png";
  }

  console.log(
    "  Output: " + image.bitmap.width + "x" + image.bitmap.height +
    " " + texFormat + " " + (outBuf.length / 1024).toFixed(0) + " KB" +
    " (" + ((1 - outBuf.length / imgLength) * 100).toFixed(0) + "% smaller)"
  );

  processedImages.push({ buffer: outBuf, mimeType });
}

// ─── Decimate geometry ──────────────────────────────────────────────────────

// Read all geometry data from the original
interface MeshData {
  indices: Uint16Array | Uint32Array;
  positions: Float32Array;
  normals: Float32Array | null;
  uvs: Float32Array | null;
  vertCount: number;
  triCount: number;
}

function readMeshData(meshIdx: number, primIdx: number): MeshData {
  const prim = gltf.meshes[meshIdx].primitives[primIdx];

  // Indices
  const idxAcc = gltf.accessors[prim.indices];
  const idxBv = gltf.bufferViews[idxAcc.bufferView];
  const idxOff = (idxAcc.byteOffset || 0) + (idxBv.byteOffset || 0);
  let indices: Uint16Array | Uint32Array;
  if (idxAcc.componentType === 5123) {
    indices = new Uint16Array(binData.buffer, binData.byteOffset + idxOff, idxAcc.count);
  } else {
    indices = new Uint32Array(binData.buffer, binData.byteOffset + idxOff, idxAcc.count);
  }

  // Positions
  const posAcc = gltf.accessors[prim.attributes.POSITION];
  const posBv = gltf.bufferViews[posAcc.bufferView];
  const posOff = (posAcc.byteOffset || 0) + (posBv.byteOffset || 0);
  const positions = new Float32Array(binData.buffer, binData.byteOffset + posOff, posAcc.count * 3);

  // Normals
  let normals: Float32Array | null = null;
  if (prim.attributes.NORMAL !== undefined) {
    const nAcc = gltf.accessors[prim.attributes.NORMAL];
    const nBv = gltf.bufferViews[nAcc.bufferView];
    const nOff = (nAcc.byteOffset || 0) + (nBv.byteOffset || 0);
    normals = new Float32Array(binData.buffer, binData.byteOffset + nOff, nAcc.count * 3);
  }

  // UVs
  let uvs: Float32Array | null = null;
  if (prim.attributes.TEXCOORD_0 !== undefined) {
    const uvAcc = gltf.accessors[prim.attributes.TEXCOORD_0];
    const uvBv = gltf.bufferViews[uvAcc.bufferView];
    const uvOff = (uvAcc.byteOffset || 0) + (uvBv.byteOffset || 0);
    uvs = new Float32Array(binData.buffer, binData.byteOffset + uvOff, uvAcc.count * 2);
  }

  return {
    indices,
    positions,
    normals,
    uvs,
    vertCount: posAcc.count,
    triCount: idxAcc.count / 3,
  };
}

/**
 * Simple vertex-collapse decimation.
 * Groups vertices that are within a spatial threshold into a single vertex.
 * Not as good as quadric error metrics but fast and dependency-free.
 */
function decimateMesh(mesh: MeshData, targetRatio: number): MeshData {
  if (targetRatio >= 1.0) return mesh;

  const targetVerts = Math.max(100, Math.floor(mesh.vertCount * targetRatio));

  // Spatial hashing — compute grid cell size to achieve target vertex count
  // Estimate: gridSize^3 ~ targetVerts, so gridSize ~ cbrt(targetVerts)
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < mesh.vertCount; i++) {
    const x = mesh.positions[i * 3];
    const y = mesh.positions[i * 3 + 1];
    const z = mesh.positions[i * 3 + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }

  const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  const gridRes = Math.max(4, Math.round(Math.cbrt(targetVerts)));
  const cellSize = extent / gridRes;

  // Map each vertex to a grid cell, accumulate
  const cellMap = new Map<string, {
    sumPos: [number, number, number];
    sumNorm: [number, number, number];
    sumUV: [number, number];
    count: number;
    newIdx: number;
  }>();

  const vertexRemap = new Int32Array(mesh.vertCount);
  let nextIdx = 0;

  for (let v = 0; v < mesh.vertCount; v++) {
    const x = mesh.positions[v * 3];
    const y = mesh.positions[v * 3 + 1];
    const z = mesh.positions[v * 3 + 2];

    const cx = Math.floor((x - minX) / cellSize);
    const cy = Math.floor((y - minY) / cellSize);
    const cz = Math.floor((z - minZ) / cellSize);
    const key = cx + "," + cy + "," + cz;

    if (!cellMap.has(key)) {
      cellMap.set(key, {
        sumPos: [0, 0, 0],
        sumNorm: [0, 0, 0],
        sumUV: [0, 0],
        count: 0,
        newIdx: nextIdx++,
      });
    }

    const cell = cellMap.get(key)!;
    cell.sumPos[0] += x;
    cell.sumPos[1] += y;
    cell.sumPos[2] += z;
    if (mesh.normals) {
      cell.sumNorm[0] += mesh.normals[v * 3];
      cell.sumNorm[1] += mesh.normals[v * 3 + 1];
      cell.sumNorm[2] += mesh.normals[v * 3 + 2];
    }
    if (mesh.uvs) {
      cell.sumUV[0] += mesh.uvs[v * 2];
      cell.sumUV[1] += mesh.uvs[v * 2 + 1];
    }
    cell.count++;
    vertexRemap[v] = cell.newIdx;
  }

  // Build new vertex arrays
  const newVertCount = cellMap.size;
  const newPositions = new Float32Array(newVertCount * 3);
  const newNormals = mesh.normals ? new Float32Array(newVertCount * 3) : null;
  const newUVs = mesh.uvs ? new Float32Array(newVertCount * 2) : null;

  for (const cell of cellMap.values()) {
    const i = cell.newIdx;
    const c = cell.count;
    newPositions[i * 3] = cell.sumPos[0] / c;
    newPositions[i * 3 + 1] = cell.sumPos[1] / c;
    newPositions[i * 3 + 2] = cell.sumPos[2] / c;
    if (newNormals) {
      // Normalize the averaged normal
      let nx = cell.sumNorm[0] / c;
      let ny = cell.sumNorm[1] / c;
      let nz = cell.sumNorm[2] / c;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      newNormals[i * 3] = nx / len;
      newNormals[i * 3 + 1] = ny / len;
      newNormals[i * 3 + 2] = nz / len;
    }
    if (newUVs) {
      newUVs[i * 2] = cell.sumUV[0] / c;
      newUVs[i * 2 + 1] = cell.sumUV[1] / c;
    }
  }

  // Remap indices, skip degenerate triangles
  const newIndices: number[] = [];
  for (let t = 0; t < mesh.triCount; t++) {
    const i0 = vertexRemap[mesh.indices[t * 3]];
    const i1 = vertexRemap[mesh.indices[t * 3 + 1]];
    const i2 = vertexRemap[mesh.indices[t * 3 + 2]];
    // Skip degenerate (collapsed) triangles
    if (i0 === i1 || i1 === i2 || i0 === i2) continue;
    newIndices.push(i0, i1, i2);
  }

  console.log(
    "  Decimated: " + mesh.vertCount + " -> " + newVertCount + " verts, " +
    mesh.triCount + " -> " + (newIndices.length / 3) + " tris"
  );

  // Build the output indices as a typed array
  const useShort = newVertCount <= 65535;
  let typedIndices: Uint16Array | Uint32Array;
  if (useShort) {
    typedIndices = new Uint16Array(newIndices);
  } else {
    typedIndices = new Uint32Array(newIndices);
  }

  return {
    indices: typedIndices,
    positions: newPositions,
    normals: newNormals,
    uvs: newUVs,
    vertCount: newVertCount,
    triCount: newIndices.length / 3,
  };
}

// ─── Rebuild GLB ────────────────────────────────────────────────────────────

// Process each mesh primitive
const meshDatas: MeshData[] = [];
for (let mi = 0; mi < gltf.meshes.length; mi++) {
  for (let pi = 0; pi < gltf.meshes[mi].primitives.length; pi++) {
    let md = readMeshData(mi, pi);
    if (decimateRatio < 1.0) {
      md = decimateMesh(md, decimateRatio);
    }
    meshDatas.push(md);
  }
}

// Assemble new BIN chunk
const bufferViews: Array<{ byteOffset: number; byteLength: number; target?: number }> = [];
const accessors: any[] = [];
const binChunks: Uint8Array[] = [];
let binWriteOffset = 0;

function appendBV(bytes: Uint8Array, target?: number): number {
  // Align to 4 bytes
  const pad = (4 - (binWriteOffset % 4)) % 4;
  if (pad > 0) {
    binChunks.push(new Uint8Array(pad));
    binWriteOffset += pad;
  }
  const idx = bufferViews.length;
  bufferViews.push({
    byteOffset: binWriteOffset,
    byteLength: bytes.byteLength,
    ...(target !== undefined ? { target } : {}),
  });
  binChunks.push(bytes);
  binWriteOffset += bytes.byteLength;
  return idx;
}

// Write geometry for each mesh
let mdIdx = 0;
const newMeshes: any[] = [];
for (let mi = 0; mi < gltf.meshes.length; mi++) {
  const prims: any[] = [];
  for (let pi = 0; pi < gltf.meshes[mi].primitives.length; pi++) {
    const md = meshDatas[mdIdx++];
    const origPrim = gltf.meshes[mi].primitives[pi];

    // Index buffer
    const idxBytes = new Uint8Array(md.indices.buffer, md.indices.byteOffset, md.indices.byteLength);
    const idxBvIdx = appendBV(idxBytes, 34963);
    const idxCompType = md.indices instanceof Uint16Array ? 5123 : 5125;
    const idxAccIdx = accessors.length;

    let idxMin = Infinity, idxMax = -Infinity;
    for (let i = 0; i < md.indices.length; i++) {
      if (md.indices[i] < idxMin) idxMin = md.indices[i];
      if (md.indices[i] > idxMax) idxMax = md.indices[i];
    }

    accessors.push({
      bufferView: idxBvIdx,
      componentType: idxCompType,
      count: md.indices.length,
      type: "SCALAR",
      min: [idxMin === Infinity ? 0 : idxMin],
      max: [idxMax === -Infinity ? 0 : idxMax],
    });

    // Position buffer
    const posBvIdx = appendBV(new Uint8Array(md.positions.buffer, md.positions.byteOffset, md.positions.byteLength), 34962);
    let pMinX = Infinity, pMaxX = -Infinity;
    let pMinY = Infinity, pMaxY = -Infinity;
    let pMinZ = Infinity, pMaxZ = -Infinity;
    for (let i = 0; i < md.vertCount; i++) {
      const x = md.positions[i * 3], y = md.positions[i * 3 + 1], z = md.positions[i * 3 + 2];
      if (x < pMinX) pMinX = x; if (x > pMaxX) pMaxX = x;
      if (y < pMinY) pMinY = y; if (y > pMaxY) pMaxY = y;
      if (z < pMinZ) pMinZ = z; if (z > pMaxZ) pMaxZ = z;
    }
    const posAccIdx = accessors.length;
    accessors.push({
      bufferView: posBvIdx,
      componentType: 5126,
      count: md.vertCount,
      type: "VEC3",
      min: [pMinX, pMinY, pMinZ],
      max: [pMaxX, pMaxY, pMaxZ],
    });

    const attributes: Record<string, number> = { POSITION: posAccIdx };

    // Normal buffer
    if (md.normals) {
      const nBvIdx = appendBV(new Uint8Array(md.normals.buffer, md.normals.byteOffset, md.normals.byteLength), 34962);
      const nAccIdx = accessors.length;
      accessors.push({
        bufferView: nBvIdx,
        componentType: 5126,
        count: md.vertCount,
        type: "VEC3",
      });
      attributes.NORMAL = nAccIdx;
    }

    // UV buffer
    if (md.uvs) {
      const uvBvIdx = appendBV(new Uint8Array(md.uvs.buffer, md.uvs.byteOffset, md.uvs.byteLength), 34962);
      const uvAccIdx = accessors.length;
      accessors.push({
        bufferView: uvBvIdx,
        componentType: 5126,
        count: md.vertCount,
        type: "VEC2",
      });
      attributes.TEXCOORD_0 = uvAccIdx;
    }

    prims.push({
      attributes,
      indices: idxAccIdx,
      ...(origPrim.material !== undefined ? { material: origPrim.material } : {}),
    });
  }
  newMeshes.push({ primitives: prims });
}

// Write processed images
const newImages: any[] = [];
for (let i = 0; i < processedImages.length; i++) {
  const pi = processedImages[i];
  const imgBvIdx = appendBV(new Uint8Array(pi.buffer));
  newImages.push({
    mimeType: pi.mimeType,
    bufferView: imgBvIdx,
  });
}

// ─── Build output glTF JSON ─────────────────────────────────────────────────

const outGltf: any = {
  asset: { version: "2.0", generator: "tokemon-optimize" },
  scene: gltf.scene ?? 0,
  scenes: gltf.scenes ?? [{ nodes: [0] }],
  nodes: (gltf.nodes ?? [{ mesh: 0 }]).map((n: any) => {
    // Strip rotation from root node — the split step already baked it in
    const out: any = { ...n };
    // Keep mesh reference, children, etc
    return out;
  }),
  meshes: newMeshes,
  materials: gltf.materials ?? [],
  accessors,
  bufferViews: bufferViews.map((bv) => ({ buffer: 0, ...bv })),
  buffers: [{ byteLength: binWriteOffset }],
};

if (gltf.textures) outGltf.textures = gltf.textures;
if (newImages.length > 0) outGltf.images = newImages;
if (gltf.samplers) {
  outGltf.samplers = gltf.samplers;
} else if (newImages.length > 0) {
  outGltf.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
}

// ─── Write GLB ──────────────────────────────────────────────────────────────

const jsonStr = JSON.stringify(outGltf);
const jsonRaw = new TextEncoder().encode(jsonStr);
const jsonPad = (4 - (jsonRaw.byteLength % 4)) % 4;
const jsonPadded = new Uint8Array(jsonRaw.byteLength + jsonPad);
jsonPadded.set(jsonRaw);
for (let i = 0; i < jsonPad; i++) jsonPadded[jsonRaw.byteLength + i] = 0x20;

const binTotal = binChunks.reduce((s, c) => s + c.byteLength, 0);
const binPad = (4 - (binTotal % 4)) % 4;
const binPadded = new Uint8Array(binTotal + binPad);
let wOff = 0;
for (const chunk of binChunks) {
  binPadded.set(chunk, wOff);
  wOff += chunk.byteLength;
}

const glbTotalLen = 12 + 8 + jsonPadded.byteLength + 8 + binPadded.byteLength;
const glbBuf = new ArrayBuffer(glbTotalLen);
const glbView = new DataView(glbBuf);
const glbBytes = new Uint8Array(glbBuf);

let off = 0;
glbView.setUint32(off, 0x46546C67, true); off += 4;
glbView.setUint32(off, 2, true); off += 4;
glbView.setUint32(off, glbTotalLen, true); off += 4;
glbView.setUint32(off, jsonPadded.byteLength, true); off += 4;
glbView.setUint32(off, 0x4E4F534A, true); off += 4;
glbBytes.set(jsonPadded, off); off += jsonPadded.byteLength;
glbView.setUint32(off, binPadded.byteLength, true); off += 4;
glbView.setUint32(off, 0x004E4942, true); off += 4;
glbBytes.set(binPadded, off);

writeFileSync(outPath, Buffer.from(glbBuf));

const pct = ((1 - glbTotalLen / originalSize) * 100).toFixed(1);
console.log("");
console.log("Output: " + outPath);
console.log("Size: " + (glbTotalLen / 1024).toFixed(0) + " KB (was " + (originalSize / 1024).toFixed(0) + " KB, " + pct + "% smaller)");
