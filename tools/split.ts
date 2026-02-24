/**
 * GLB Splitter — takes a multi-instance GLB (where multiple copies of a monster
 * are baked into one mesh) and splits them into individual GLB files with
 * cropped textures.
 *
 * Usage: bun run tools/split.ts <input.glb> [--out <dir>] [--clusters <n>]
 *
 * If --clusters is omitted, the script auto-detects the number of instances
 * by analysing density gaps along the X axis.
 *
 * The script:
 * 1. Parses the GLB binary directly (no Three.js dependency)
 * 2. Reads indices, positions, normals, and UVs from the single mesh
 * 3. Runs Union-Find on triangle edges to identify connected geometry islands
 * 4. Builds an X-axis vertex density histogram to find valleys between characters
 * 5. For each cluster: extracts geometry, crops texture, remaps UVs, writes GLB
 */
import { Jimp } from "jimp";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, basename, extname } from "path";

// ─── CLI argument parsing ────────────────────────────────────────────────────

const args = process.argv.slice(2);
let inputPath = "";
let outDir = resolve(process.cwd(), "tools/out");
let numClusters = 0; // 0 = auto-detect
let clustersExplicit = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out" && args[i + 1]) {
    outDir = resolve(process.cwd(), args[++i]);
  } else if (args[i] === "--clusters" && args[i + 1]) {
    numClusters = parseInt(args[++i], 10);
    clustersExplicit = true;
  } else if (!args[i].startsWith("--")) {
    inputPath = args[i];
  }
}

if (!inputPath) {
  console.log("Usage: bun run tools/split.ts <input.glb> [--out <dir>] [--clusters <n>]");
  process.exit(1);
}

const glbPath = resolve(process.cwd(), inputPath);
const modelName = basename(glbPath, extname(glbPath));

console.log("Input:    " + glbPath);
console.log("Output:   " + outDir);
console.log("Clusters: " + (clustersExplicit ? numClusters : "auto-detect"));
console.log("");

// ─── Parse GLB ───────────────────────────────────────────────────────────────

const fileBuf = readFileSync(glbPath);
const ab = fileBuf.buffer.slice(fileBuf.byteOffset, fileBuf.byteOffset + fileBuf.byteLength);
const view = new DataView(ab);

// Validate GLB header
const magic = view.getUint32(0, true);
if (magic !== 0x46546C67) {
  console.log("ERROR: Not a valid GLB file (bad magic)");
  process.exit(1);
}

const version = view.getUint32(4, true);
const totalLength = view.getUint32(8, true);
console.log("GLB v" + version + "  " + (totalLength / 1024 / 1024).toFixed(1) + " MB");

// JSON chunk
const jsonChunkLen = view.getUint32(12, true);
const jsonChunkType = view.getUint32(16, true);
if (jsonChunkType !== 0x4E4F534A) {
  console.log("ERROR: First chunk is not JSON");
  process.exit(1);
}
const jsonBytes = new Uint8Array(ab, 20, jsonChunkLen);
const gltf = JSON.parse(new TextDecoder().decode(jsonBytes));

// BIN chunk
const binChunkOffset = 20 + jsonChunkLen;
const binChunkLen = view.getUint32(binChunkOffset, true);
const binChunkType = view.getUint32(binChunkOffset + 4, true);
if (binChunkType !== 0x004E4942) {
  console.log("ERROR: Second chunk is not BIN");
  process.exit(1);
}
const binData = new Uint8Array(ab, binChunkOffset + 8, binChunkLen);

// ─── Helper: read accessor data from BIN chunk ──────────────────────────────

function readAccessorFloat32(accessorIdx: number): Float32Array {
  const acc = gltf.accessors[accessorIdx];
  const bv = gltf.bufferViews[acc.bufferView];
  const byteOffset = (acc.byteOffset || 0) + (bv.byteOffset || 0);
  const componentCount = acc.type === "VEC2" ? 2 : acc.type === "VEC3" ? 3 : acc.type === "VEC4" ? 4 : 1;
  return new Float32Array(
    binData.buffer,
    binData.byteOffset + byteOffset,
    acc.count * componentCount,
  );
}

function readIndices(accessorIdx: number): Uint16Array | Uint32Array {
  const acc = gltf.accessors[accessorIdx];
  const bv = gltf.bufferViews[acc.bufferView];
  const byteOffset = (acc.byteOffset || 0) + (bv.byteOffset || 0);
  if (acc.componentType === 5123) {
    // UNSIGNED_SHORT
    return new Uint16Array(binData.buffer, binData.byteOffset + byteOffset, acc.count);
  } else {
    // UNSIGNED_INT (5125)
    return new Uint32Array(binData.buffer, binData.byteOffset + byteOffset, acc.count);
  }
}

// ─── Read mesh data ──────────────────────────────────────────────────────────

const mesh = gltf.meshes[0];
const prim = mesh.primitives[0];

const indices = readIndices(prim.indices);
const positions = readAccessorFloat32(prim.attributes.POSITION);
const normals = prim.attributes.NORMAL !== undefined
  ? readAccessorFloat32(prim.attributes.NORMAL)
  : null;
const uvs = prim.attributes.TEXCOORD_0 !== undefined
  ? readAccessorFloat32(prim.attributes.TEXCOORD_0)
  : null;

const vertCount = gltf.accessors[prim.attributes.POSITION].count;
const triCount = indices.length / 3;

console.log("Mesh: " + vertCount + " verts, " + triCount + " tris");

// ─── Union-Find to identify connected geometry islands ───────────────────────

const parent = new Int32Array(vertCount);
const ufRank = new Int32Array(vertCount);
for (let i = 0; i < vertCount; i++) parent[i] = i;

function find(x: number): number {
  while (parent[x] !== x) {
    parent[x] = parent[parent[x]]; // path compression
    x = parent[x];
  }
  return x;
}

function unite(a: number, b: number): void {
  a = find(a);
  b = find(b);
  if (a === b) return;
  if (ufRank[a] < ufRank[b]) { const t = a; a = b; b = t; }
  parent[b] = a;
  if (ufRank[a] === ufRank[b]) ufRank[a]++;
}

// Unite all vertices sharing triangle edges
for (let t = 0; t < triCount; t++) {
  const i0 = indices[t * 3];
  const i1 = indices[t * 3 + 1];
  const i2 = indices[t * 3 + 2];
  unite(i0, i1);
  unite(i1, i2);
}

// Compute island centroids, vertex counts, and X-axis bounding boxes
const islandData = new Map<number, { sx: number; sy: number; sz: number; count: number; minX: number; maxX: number }>();
for (let v = 0; v < vertCount; v++) {
  const root = find(v);
  const x = positions[v * 3];
  if (!islandData.has(root)) {
    islandData.set(root, { sx: 0, sy: 0, sz: 0, count: 0, minX: x, maxX: x });
  }
  const s = islandData.get(root)!;
  s.sx += x;
  s.sy += positions[v * 3 + 1];
  s.sz += positions[v * 3 + 2];
  s.count++;
  if (x < s.minX) s.minX = x;
  if (x > s.maxX) s.maxX = x;
}

const islands = [...islandData.entries()].map(([root, s]) => ({
  root,
  cx: s.sx / s.count,
  cy: s.sy / s.count,
  cz: s.sz / s.count,
  count: s.count,
  minX: s.minX,
  maxX: s.maxX,
}));

console.log("Islands: " + islands.length);

// ─── X-axis vertex density valley detection ─────────────────────────────────
//
// Instead of clustering island centroids (which can misassign parts when models
// are tightly packed), we build a histogram of actual vertex density along the
// X axis and cut at the lowest-density valleys. This directly finds where
// geometry is sparse — i.e. the gaps between characters.
//
// Then each island is assigned to whichever segment contains the majority of
// its vertices, preventing face/body parts from being split by the cut line.

const numBins = 300;
let globalMinX = Infinity, globalMaxX = -Infinity;
for (let v = 0; v < vertCount; v++) {
  const x = positions[v * 3];
  if (x < globalMinX) globalMinX = x;
  if (x > globalMaxX) globalMaxX = x;
}
const xRange = globalMaxX - globalMinX;

// Build vertex density histogram
const histogram = new Float64Array(numBins);
for (let v = 0; v < vertCount; v++) {
  const x = positions[v * 3];
  const bin = Math.min(numBins - 1, Math.floor(((x - globalMinX) / xRange) * numBins));
  histogram[bin]++;
}

// Smooth with a window of 3 bins on each side
const smoothed = new Float64Array(numBins);
const kw = 3;
for (let i = 0; i < numBins; i++) {
  let sum = 0, cnt = 0;
  for (let j = Math.max(0, i - kw); j <= Math.min(numBins - 1, i + kw); j++) {
    sum += histogram[j];
    cnt++;
  }
  smoothed[i] = sum / cnt;
}

// Find cut points by detecting true density valleys (gaps between models).
// A valley is a local minimum where density drops below a threshold relative
// to the peak density. This auto-detects the number of clusters when not
// explicitly specified via --clusters.

const margin = Math.floor(numBins * 0.10);
const minSeparation = Math.floor(numBins * 0.15);

// Find peak density (excluding margins) as reference
let peakDensity = 0;
for (let i = margin; i < numBins - margin; i++) {
  if (smoothed[i] > peakDensity) peakDensity = smoothed[i];
}

// Auto-detect: find gaps where density drops to near-zero across a wide enough
// region. Real gaps between separate models have virtually no vertices — sparse
// areas within a single mesh (e.g. between limbs) still have significant density.
// We require: density < 1% of peak AND the gap spans at least 3% of the range.
if (!clustersExplicit) {
  // Two-pass valley detection:
  // Pass 1: near-zero absolute gaps (original method)
  // Pass 2: relative valleys — where density drops below 15% of local average
  const absThreshold = peakDensity * 0.01;
  const minGapWidth = Math.floor(numBins * 0.02);
  const gaps: Array<{ center: number; density: number; width: number }> = [];

  // Pass 1: absolute near-zero gaps
  let inGap = false;
  let gapStart = 0;
  let gapMinDensity = Infinity;
  let gapMinBin = 0;

  for (let i = margin; i < numBins - margin; i++) {
    if (smoothed[i] <= absThreshold) {
      if (!inGap) {
        inGap = true;
        gapStart = i;
        gapMinDensity = smoothed[i];
        gapMinBin = i;
      } else if (smoothed[i] < gapMinDensity) {
        gapMinDensity = smoothed[i];
        gapMinBin = i;
      }
    } else if (inGap) {
      const width = i - gapStart;
      if (width >= minGapWidth) {
        gaps.push({ center: gapMinBin, density: gapMinDensity, width });
      }
      inGap = false;
      gapMinDensity = Infinity;
    }
  }
  if (inGap) {
    const width = (numBins - margin) - gapStart;
    if (width >= minGapWidth) {
      gaps.push({ center: gapMinBin, density: gapMinDensity, width });
    }
  }

  // Pass 2: relative valleys — find bins where density drops to <15% of the
  // average of the 20 bins on each side. This catches gaps that still have some
  // debris vertices from AI-generated models.
  const localWindow = 20;
  const relativeDropRatio = 0.15;
  for (let i = margin; i < numBins - margin; i++) {
    // Already found as absolute gap?
    if (gaps.some((g) => Math.abs(g.center - i) < minSeparation)) continue;

    // Compute local average from surrounding bins (excluding the center region)
    let leftSum = 0, leftCount = 0;
    for (let j = Math.max(margin, i - localWindow); j < Math.max(margin, i - 2); j++) {
      leftSum += smoothed[j];
      leftCount++;
    }
    let rightSum = 0, rightCount = 0;
    for (let j = Math.min(numBins - margin, i + 3); j < Math.min(numBins - margin, i + localWindow + 1); j++) {
      rightSum += smoothed[j];
      rightCount++;
    }

    if (leftCount === 0 || rightCount === 0) continue;
    const leftAvg = leftSum / leftCount;
    const rightAvg = rightSum / rightCount;
    const localAvg = (leftAvg + rightAvg) / 2;

    // Both sides must have substantial density for this to be a real gap
    if (leftAvg < peakDensity * 0.1 || rightAvg < peakDensity * 0.1) continue;

    if (smoothed[i] < localAvg * relativeDropRatio) {
      gaps.push({ center: i, density: smoothed[i], width: 1 });
      console.log(
        "  relative valley at bin " + i +
        " density=" + smoothed[i].toFixed(0) +
        " localAvg=" + localAvg.toFixed(0) +
        " ratio=" + (smoothed[i] / localAvg).toFixed(3)
      );
    }
  }

  // Filter gaps that are too close together (keep the deeper one)
  const filteredGaps: Array<{ center: number; density: number; width: number }> = [];
  for (const gap of gaps) {
    const tooClose = filteredGaps.findIndex((g) => Math.abs(g.center - gap.center) < minSeparation);
    if (tooClose >= 0) {
      if (gap.density < filteredGaps[tooClose].density) {
        filteredGaps[tooClose] = gap;
      }
    } else {
      filteredGaps.push(gap);
    }
  }

  numClusters = filteredGaps.length + 1;
  console.log("Auto-detected " + numClusters + " cluster(s) from density histogram");
  for (const gap of filteredGaps) {
    console.log("  gap at bin " + gap.center + " width=" + gap.width + " density=" + gap.density.toFixed(0));
  }
}

const cutBins: number[] = [];
const cutPoints: number[] = [];
const assignments = new Int32Array(islands.length);
const islandToCluster = new Map<number, number>();

if (numClusters <= 1) {
  // Density detection found no gaps — try proximity-based splitting.
  // If the models overlap in space but don't share vertices, connected
  // islands that are near each other form distinct super-clusters.
  console.log("Density found 1 cluster — trying proximity-based split...");
  const PROXIMITY = 0.008;

  // Compute island bounding boxes
  const islandBounds = islands.map((isl) => {
    let minIX = Infinity, maxIX = -Infinity;
    let minIY = Infinity, maxIY = -Infinity;
    let minIZ = Infinity, maxIZ = -Infinity;
    for (let v = 0; v < vertCount; v++) {
      if (find(v) !== isl.root) continue;
      const x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
      if (x < minIX) minIX = x; if (x > maxIX) maxIX = x;
      if (y < minIY) minIY = y; if (y > maxIY) maxIY = y;
      if (z < minIZ) minIZ = z; if (z > maxIZ) maxIZ = z;
    }
    return { minX: minIX, maxX: maxIX, minY: minIY, maxY: maxIY, minZ: minIZ, maxZ: maxIZ };
  });

  // Union-find on islands: connect if bounding boxes overlap within tolerance
  const iParent = new Int32Array(islands.length);
  const iRank = new Int32Array(islands.length);
  for (let i = 0; i < islands.length; i++) iParent[i] = i;

  function findI(x: number): number {
    while (iParent[x] !== x) { iParent[x] = iParent[iParent[x]]; x = iParent[x]; }
    return x;
  }
  function uniteI(a: number, b: number) {
    a = findI(a); b = findI(b);
    if (a === b) return;
    if (iRank[a] < iRank[b]) { const t = a; a = b; b = t; }
    iParent[b] = a;
    if (iRank[a] === iRank[b]) iRank[a]++;
  }

  for (let i = 0; i < islands.length; i++) {
    const a = islandBounds[i];
    for (let j = i + 1; j < islands.length; j++) {
      const b = islandBounds[j];
      if (a.maxX + PROXIMITY >= b.minX && b.maxX + PROXIMITY >= a.minX &&
          a.maxY + PROXIMITY >= b.minY && b.maxY + PROXIMITY >= a.minY &&
          a.maxZ + PROXIMITY >= b.minZ && b.maxZ + PROXIMITY >= a.minZ) {
        uniteI(i, j);
      }
    }
  }

  // Count super-clusters
  const superMap = new Map<number, number[]>();
  for (let i = 0; i < islands.length; i++) {
    const root = findI(i);
    if (!superMap.has(root)) superMap.set(root, []);
    superMap.get(root)!.push(i);
  }

  const superClusters = [...superMap.values()].sort((a, b) => {
    const aV = a.reduce((s, i) => s + islands[i].count, 0);
    const bV = b.reduce((s, i) => s + islands[i].count, 0);
    return bV - aV;
  });

  if (superClusters.length >= 2) {
    numClusters = superClusters.length;
    console.log("Proximity split found " + numClusters + " clusters");
    for (let k = 0; k < numClusters; k++) {
      const totalVerts = superClusters[k].reduce((s, i) => s + islands[i].count, 0);
      console.log("  Cluster " + k + ": " + superClusters[k].length + " islands, " + totalVerts + " verts (" + (totalVerts / vertCount * 100).toFixed(1) + "%)");
      for (const idx of superClusters[k]) {
        assignments[idx] = k;
        islandToCluster.set(islands[idx].root, k);
      }
    }
  } else {
    numClusters = 1;
    console.log("Proximity split also found 1 cluster — single model");
    for (let i = 0; i < islands.length; i++) {
      assignments[i] = 0;
      islandToCluster.set(islands[i].root, 0);
    }
  }
} else {
  const candidates: Array<{ bin: number; density: number }> = [];
  for (let i = margin; i < numBins - margin; i++) {
    candidates.push({ bin: i, density: smoothed[i] });
  }
  candidates.sort((a, b) => a.density - b.density);

  // Greedily pick lowest-density bins with minimum separation
  for (const cand of candidates) {
    if (cutBins.length >= numClusters - 1) break;
    if (!cutBins.some((b) => Math.abs(b - cand.bin) < minSeparation)) {
      cutBins.push(cand.bin);
    }
  }
  cutBins.sort((a, b) => a - b);

  cutPoints.push(...cutBins.map((bin) => globalMinX + (bin + 0.5) / numBins * xRange));
  console.log("Density valley cuts: " + cutPoints.map((c) => c.toFixed(4)).join(", "));
  for (const bin of cutBins) {
    console.log(
      "  bin " + bin + "/" + numBins + " density=" + smoothed[bin].toFixed(0) +
      " (X=" + (globalMinX + (bin + 0.5) / numBins * xRange).toFixed(4) + ")"
    );
  }

  // Assign each island by MAJORITY VOTE: count how many of the island's vertices
  // fall on each side of the cut lines, and assign to the segment with the most.
  // This prevents a cut line from splitting an island that straddles the boundary.
  const islandSegmentVotes = new Map<number, Int32Array>(); // root -> votes per segment
  for (let v = 0; v < vertCount; v++) {
    const root = find(v);
    if (!islandSegmentVotes.has(root)) {
      islandSegmentVotes.set(root, new Int32Array(numClusters));
    }
    const x = positions[v * 3];
    let seg = 0;
    for (const cut of cutPoints) {
      if (x >= cut) seg++;
    }
    islandSegmentVotes.get(root)![seg]++;
  }

  for (let i = 0; i < islands.length; i++) {
    const votes = islandSegmentVotes.get(islands[i].root)!;
    let bestSeg = 0, bestCount = 0;
    for (let s = 0; s < numClusters; s++) {
      if (votes[s] > bestCount) {
        bestCount = votes[s];
        bestSeg = s;
      }
    }
    assignments[i] = bestSeg;
    islandToCluster.set(islands[i].root, bestSeg);
  }
}

// Report cluster stats
for (let k = 0; k < numClusters; k++) {
  let totalVerts = 0;
  let islandCount = 0;
  let minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < islands.length; i++) {
    if (assignments[i] !== k) continue;
    totalVerts += islands[i].count;
    islandCount++;
    if (islands[i].cx < minX) minX = islands[i].cx;
    if (islands[i].cx > maxX) maxX = islands[i].cx;
  }
  const pct = (totalVerts / vertCount * 100).toFixed(1);
  console.log(
    "Cluster " + k + ": " + totalVerts + " verts (" + pct + "%), " +
    islandCount + " islands, X range [" +
    minX.toFixed(3) + ", " + maxX.toFixed(3) + "]"
  );
}

// ─── Extract the texture atlas from the GLB ──────────────────────────────────

// Find the base color texture image
const materialDef = gltf.materials[prim.material ?? 0];
const texIdx = materialDef.pbrMetallicRoughness?.baseColorTexture?.index;
let atlasImage: Awaited<ReturnType<typeof Jimp.read>> | null = null;

if (texIdx !== undefined) {
  const texDef = gltf.textures[texIdx];
  const imgDef = gltf.images[texDef.source];
  const imgBv = gltf.bufferViews[imgDef.bufferView];
  const imgOffset = imgBv.byteOffset || 0;
  const imgLength = imgBv.byteLength;
  const imgBytes = binData.slice(imgOffset, imgOffset + imgLength);
  atlasImage = await Jimp.read(Buffer.from(imgBytes));
  console.log(
    "Texture atlas: " + atlasImage.bitmap.width + "x" + atlasImage.bitmap.height +
    " (" + (imgLength / 1024).toFixed(0) + " KB)"
  );
} else {
  console.log("WARNING: No base color texture found, output will have no texture");
}

// ─── Detect root node rotation ───────────────────────────────────────────────

// The GLB may have a root node with a rotation quaternion (e.g. 90 deg X rotation)
// We need to apply this to the extracted geometry so the output stands upright.
let rootRotation: [number, number, number, number] | null = null;

if (gltf.scenes && gltf.scenes.length > 0) {
  const sceneNodes = gltf.scenes[gltf.scene ?? 0].nodes ?? [];
  for (const nodeIdx of sceneNodes) {
    const node = gltf.nodes[nodeIdx];
    if (node.rotation) {
      rootRotation = node.rotation as [number, number, number, number];
      console.log(
        "Root node rotation: [" +
        rootRotation.map((v: number) => v.toFixed(3)).join(", ") + "]"
      );
      break;
    }
  }
}

/**
 * Apply a unit quaternion [x, y, z, w] to a vec3 [vx, vy, vz].
 * Returns the rotated vector as [rx, ry, rz].
 */
function applyQuaternion(
  qx: number, qy: number, qz: number, qw: number,
  vx: number, vy: number, vz: number,
): [number, number, number] {
  // q * v * q^-1, expanded:
  const ix = qw * vx + qy * vz - qz * vy;
  const iy = qw * vy + qz * vx - qx * vz;
  const iz = qw * vz + qx * vy - qy * vx;
  const iw = -qx * vx - qy * vy - qz * vz;

  const rx = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  const ry = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  const rz = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  return [rx, ry, rz];
}

// ─── Create output directory ─────────────────────────────────────────────────

if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

// ─── Split: extract each cluster into its own GLB ────────────────────────────

for (let k = 0; k < numClusters; k++) {
  console.log("");
  console.log("--- Cluster " + k + " ---");

  // Step 1: Identify which vertices belong to this cluster
  const vertexInCluster = new Uint8Array(vertCount);
  for (let v = 0; v < vertCount; v++) {
    const root = find(v);
    if (islandToCluster.get(root) === k) {
      vertexInCluster[v] = 1;
    }
  }

  // Step 2: Collect triangles belonging to this cluster
  // A triangle belongs to this cluster if all its vertices do.
  const clusterTriIndices: number[] = [];
  for (let t = 0; t < triCount; t++) {
    const i0 = indices[t * 3];
    const i1 = indices[t * 3 + 1];
    const i2 = indices[t * 3 + 2];
    if (vertexInCluster[i0] && vertexInCluster[i1] && vertexInCluster[i2]) {
      clusterTriIndices.push(i0, i1, i2);
    }
  }

  // Step 3: Remap vertex indices to be contiguous (0, 1, 2, ...)
  const oldToNew = new Map<number, number>();
  const newIndices: number[] = [];
  let nextIdx = 0;

  for (const oldIdx of clusterTriIndices) {
    if (!oldToNew.has(oldIdx)) {
      oldToNew.set(oldIdx, nextIdx++);
    }
    newIndices.push(oldToNew.get(oldIdx)!);
  }

  const newVertCount = oldToNew.size;
  const newTriCount = newIndices.length / 3;
  console.log("Verts: " + newVertCount + "  Tris: " + newTriCount);

  // Step 4: Copy vertex attributes into new contiguous arrays
  const newPositions = new Float32Array(newVertCount * 3);
  const newNormals = normals ? new Float32Array(newVertCount * 3) : null;
  const newUVs = uvs ? new Float32Array(newVertCount * 2) : null;

  for (const [oldIdx, newIdx] of oldToNew) {
    newPositions[newIdx * 3] = positions[oldIdx * 3];
    newPositions[newIdx * 3 + 1] = positions[oldIdx * 3 + 1];
    newPositions[newIdx * 3 + 2] = positions[oldIdx * 3 + 2];
    if (normals && newNormals) {
      newNormals[newIdx * 3] = normals[oldIdx * 3];
      newNormals[newIdx * 3 + 1] = normals[oldIdx * 3 + 1];
      newNormals[newIdx * 3 + 2] = normals[oldIdx * 3 + 2];
    }
    if (uvs && newUVs) {
      newUVs[newIdx * 2] = uvs[oldIdx * 2];
      newUVs[newIdx * 2 + 1] = uvs[oldIdx * 2 + 1];
    }
  }

  // Step 5: Compute UV bounding box for texture cropping
  let uvMinU = Infinity, uvMaxU = -Infinity;
  let uvMinV = Infinity, uvMaxV = -Infinity;

  if (newUVs) {
    for (let i = 0; i < newVertCount; i++) {
      const u = newUVs[i * 2];
      const v = newUVs[i * 2 + 1];
      if (u < uvMinU) uvMinU = u;
      if (u > uvMaxU) uvMaxU = u;
      if (v < uvMinV) uvMinV = v;
      if (v > uvMaxV) uvMaxV = v;
    }
    console.log(
      "UV bounds: u=[" + uvMinU.toFixed(4) + ", " + uvMaxU.toFixed(4) +
      "] v=[" + uvMinV.toFixed(4) + ", " + uvMaxV.toFixed(4) + "]"
    );
  }

  // Step 6: Crop the texture atlas to the UV region used by this cluster
  let croppedPngBuffer: Buffer | null = null;

  if (atlasImage && newUVs) {
    const atlasW = atlasImage.bitmap.width;
    const atlasH = atlasImage.bitmap.height;

    // Clamp UV bounds to [0, 1] to be safe
    const clampedMinU = Math.max(0, uvMinU);
    const clampedMaxU = Math.min(1, uvMaxU);
    const clampedMinV = Math.max(0, uvMinV);
    const clampedMaxV = Math.min(1, uvMaxV);

    // Convert UV coords to pixel coords
    // In glTF, UV (0,0) is top-left, U goes right, V goes down
    const pixX = Math.floor(clampedMinU * atlasW);
    const pixY = Math.floor(clampedMinV * atlasH);
    const pixW = Math.ceil((clampedMaxU - clampedMinU) * atlasW);
    const pixH = Math.ceil((clampedMaxV - clampedMinV) * atlasH);

    // Clamp to atlas bounds
    const cropX = Math.max(0, Math.min(pixX, atlasW - 1));
    const cropY = Math.max(0, Math.min(pixY, atlasH - 1));
    const cropW = Math.max(1, Math.min(pixW, atlasW - cropX));
    const cropH = Math.max(1, Math.min(pixH, atlasH - cropY));

    console.log(
      "Texture crop: x=" + cropX + " y=" + cropY +
      " w=" + cropW + " h=" + cropH +
      " (atlas " + atlasW + "x" + atlasH + ")"
    );

    const cropped = atlasImage.clone().crop({ x: cropX, y: cropY, w: cropW, h: cropH });
    croppedPngBuffer = await cropped.getBuffer("image/png");

    console.log("Cropped texture: " + cropped.bitmap.width + "x" + cropped.bitmap.height +
      " (" + (croppedPngBuffer.length / 1024).toFixed(0) + " KB)");

    // Step 7: Remap UVs from atlas-space to cropped-texture-space
    const uvRangeU = uvMaxU - uvMinU;
    const uvRangeV = uvMaxV - uvMinV;
    for (let i = 0; i < newVertCount; i++) {
      newUVs[i * 2] = (newUVs[i * 2] - uvMinU) / uvRangeU;
      newUVs[i * 2 + 1] = (newUVs[i * 2 + 1] - uvMinV) / uvRangeV;
    }
  }

  // Step 8: Apply root node rotation to positions and normals
  if (rootRotation) {
    const [qx, qy, qz, qw] = rootRotation;
    for (let i = 0; i < newVertCount; i++) {
      const px = newPositions[i * 3];
      const py = newPositions[i * 3 + 1];
      const pz = newPositions[i * 3 + 2];
      const [rx, ry, rz] = applyQuaternion(qx, qy, qz, qw, px, py, pz);
      newPositions[i * 3] = rx;
      newPositions[i * 3 + 1] = ry;
      newPositions[i * 3 + 2] = rz;

      if (newNormals) {
        const nx = newNormals[i * 3];
        const ny = newNormals[i * 3 + 1];
        const nz = newNormals[i * 3 + 2];
        const [rnx, rny, rnz] = applyQuaternion(qx, qy, qz, qw, nx, ny, nz);
        newNormals[i * 3] = rnx;
        newNormals[i * 3 + 1] = rny;
        newNormals[i * 3 + 2] = rnz;
      }
    }
  }

  // Step 9: Center geometry at origin and normalize scale
  // Compute bounding box after rotation
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (let i = 0; i < newVertCount; i++) {
    const x = newPositions[i * 3];
    const y = newPositions[i * 3 + 1];
    const z = newPositions[i * 3 + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  // Center at origin (XZ center, Y sits on ground plane)
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const groundY = minY; // bottom of the model sits at Y=0

  // Normalize so the tallest dimension fits in [-1, 1] (height = 2 units)
  const sizeX = maxX - minX;
  const sizeY = maxY - minY;
  const sizeZ = maxZ - minZ;
  const maxDim = Math.max(sizeX, sizeY, sizeZ);
  const scale = maxDim > 0 ? 2.0 / maxDim : 1.0;

  for (let i = 0; i < newVertCount; i++) {
    newPositions[i * 3] = (newPositions[i * 3] - centerX) * scale;
    newPositions[i * 3 + 1] = (newPositions[i * 3 + 1] - groundY) * scale;
    newPositions[i * 3 + 2] = (newPositions[i * 3 + 2] - centerZ) * scale;
  }

  // Recompute bounding box for the accessor min/max
  let accMinX = Infinity, accMaxX = -Infinity;
  let accMinY = Infinity, accMaxY = -Infinity;
  let accMinZ = Infinity, accMaxZ = -Infinity;

  for (let i = 0; i < newVertCount; i++) {
    const x = newPositions[i * 3];
    const y = newPositions[i * 3 + 1];
    const z = newPositions[i * 3 + 2];
    if (x < accMinX) accMinX = x;
    if (x > accMaxX) accMaxX = x;
    if (y < accMinY) accMinY = y;
    if (y > accMaxY) accMaxY = y;
    if (z < accMinZ) accMinZ = z;
    if (z > accMaxZ) accMaxZ = z;
  }

  console.log(
    "Final bbox: [" +
    accMinX.toFixed(3) + ", " + accMinY.toFixed(3) + ", " + accMinZ.toFixed(3) +
    "] -> [" +
    accMaxX.toFixed(3) + ", " + accMaxY.toFixed(3) + ", " + accMaxZ.toFixed(3) + "]"
  );

  // Step 10: Build and write the standalone GLB file
  await writeClusterGLB(k, {
    indices: newIndices,
    positions: newPositions,
    normals: newNormals,
    uvs: newUVs,
    vertCount: newVertCount,
    posMin: [accMinX, accMinY, accMinZ],
    posMax: [accMaxX, accMaxY, accMaxZ],
    pngBuffer: croppedPngBuffer,
    materialName: materialDef.name || "material",
  });
}

// ─── GLB Writer ──────────────────────────────────────────────────────────────

interface ClusterData {
  indices: number[];
  positions: Float32Array;
  normals: Float32Array | null;
  uvs: Float32Array | null;
  vertCount: number;
  posMin: [number, number, number];
  posMax: [number, number, number];
  pngBuffer: Buffer | null;
  materialName: string;
}

async function writeClusterGLB(clusterIdx: number, data: ClusterData): Promise<void> {
  // Assemble the BIN chunk: index buffer + position buffer + normal buffer + UV buffer + image
  // Each buffer view needs to be aligned to 4 bytes.

  const bufferViews: Array<{ byteOffset: number; byteLength: number; target?: number }> = [];
  const accessors: any[] = [];
  const chunks: Uint8Array[] = [];
  let binOffset = 0;

  /**
   * Append a typed array to the BIN chunk, aligned to 4 bytes.
   * Returns the buffer view index.
   */
  function appendBufferView(
    bytes: Uint8Array,
    target?: number,
  ): number {
    // Pad to 4-byte alignment
    const padding = (4 - (binOffset % 4)) % 4;
    if (padding > 0) {
      chunks.push(new Uint8Array(padding));
      binOffset += padding;
    }

    const bvIdx = bufferViews.length;
    bufferViews.push({
      byteOffset: binOffset,
      byteLength: bytes.byteLength,
      ...(target !== undefined ? { target } : {}),
    });
    chunks.push(bytes);
    binOffset += bytes.byteLength;
    return bvIdx;
  }

  // --- Index buffer ---
  // Use UNSIGNED_SHORT if possible, UNSIGNED_INT otherwise
  const useShortIndices = data.vertCount <= 65535;
  let indexBytes: Uint8Array;
  let indexComponentType: number;

  if (useShortIndices) {
    const shortIndices = new Uint16Array(data.indices.length);
    for (let i = 0; i < data.indices.length; i++) {
      shortIndices[i] = data.indices[i];
    }
    indexBytes = new Uint8Array(shortIndices.buffer);
    indexComponentType = 5123; // UNSIGNED_SHORT
  } else {
    const intIndices = new Uint32Array(data.indices);
    indexBytes = new Uint8Array(intIndices.buffer);
    indexComponentType = 5125; // UNSIGNED_INT
  }

  const indexBvIdx = appendBufferView(indexBytes, 34963); // ELEMENT_ARRAY_BUFFER
  const indexAccIdx = accessors.length;
  accessors.push({
    bufferView: indexBvIdx,
    componentType: indexComponentType,
    count: data.indices.length,
    type: "SCALAR",
    max: [data.indices.reduce((a, b) => Math.max(a, b), 0)],
    min: [data.indices.reduce((a, b) => Math.min(a, b), Infinity)],
  });

  // --- Position buffer ---
  const posBvIdx = appendBufferView(
    new Uint8Array(data.positions.buffer),
    34962, // ARRAY_BUFFER
  );
  const posAccIdx = accessors.length;
  accessors.push({
    bufferView: posBvIdx,
    componentType: 5126, // FLOAT
    count: data.vertCount,
    type: "VEC3",
    max: data.posMax,
    min: data.posMin,
  });

  // --- Normal buffer ---
  let normAccIdx: number | undefined;
  if (data.normals) {
    const normBvIdx = appendBufferView(
      new Uint8Array(data.normals.buffer),
      34962,
    );
    normAccIdx = accessors.length;
    accessors.push({
      bufferView: normBvIdx,
      componentType: 5126,
      count: data.vertCount,
      type: "VEC3",
    });
  }

  // --- UV buffer ---
  let uvAccIdx: number | undefined;
  if (data.uvs) {
    const uvBvIdx = appendBufferView(
      new Uint8Array(data.uvs.buffer),
      34962,
    );
    uvAccIdx = accessors.length;
    accessors.push({
      bufferView: uvBvIdx,
      componentType: 5126,
      count: data.vertCount,
      type: "VEC2",
    });
  }

  // --- Image buffer (PNG) ---
  let imageBvIdx: number | undefined;
  if (data.pngBuffer) {
    imageBvIdx = appendBufferView(new Uint8Array(data.pngBuffer));
    // No target for image buffer views
  }

  // --- Build glTF JSON ---
  const attributes: Record<string, number> = {
    POSITION: posAccIdx,
  };
  if (normAccIdx !== undefined) attributes.NORMAL = normAccIdx;
  if (uvAccIdx !== undefined) attributes.TEXCOORD_0 = uvAccIdx;

  const gltfJson: any = {
    asset: { version: "2.0", generator: "tokemon-split" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{
      primitives: [{
        attributes,
        indices: indexAccIdx,
        material: 0,
      }],
    }],
    materials: [{
      name: data.materialName,
      pbrMetallicRoughness: {
        metallicFactor: 0,
        roughnessFactor: 1,
        ...(data.pngBuffer ? { baseColorTexture: { index: 0 } } : {}),
      },
    }],
    accessors,
    bufferViews: bufferViews.map((bv) => ({
      buffer: 0,
      ...bv,
    })),
    buffers: [{ byteLength: binOffset }],
  };

  // Add texture/image/sampler if we have an image
  if (data.pngBuffer && imageBvIdx !== undefined) {
    gltfJson.textures = [{ source: 0, sampler: 0 }];
    gltfJson.images = [{
      mimeType: "image/png",
      bufferView: imageBvIdx,
    }];
    gltfJson.samplers = [{
      magFilter: 9729, // LINEAR
      minFilter: 9987, // LINEAR_MIPMAP_LINEAR
      wrapS: 10497,    // REPEAT
      wrapT: 10497,    // REPEAT
    }];
  }

  // --- Encode JSON chunk ---
  const jsonString = JSON.stringify(gltfJson);
  const jsonEncoder = new TextEncoder();
  const jsonRaw = jsonEncoder.encode(jsonString);
  // Pad JSON chunk to 4-byte alignment with spaces (0x20)
  const jsonPadding = (4 - (jsonRaw.byteLength % 4)) % 4;
  const jsonPadded = new Uint8Array(jsonRaw.byteLength + jsonPadding);
  jsonPadded.set(jsonRaw);
  for (let i = 0; i < jsonPadding; i++) {
    jsonPadded[jsonRaw.byteLength + i] = 0x20; // space
  }

  // --- Assemble BIN chunk (merge all sub-chunks) ---
  const binTotal = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  // Pad BIN chunk to 4-byte alignment with null bytes
  const binPadding = (4 - (binTotal % 4)) % 4;
  const binPadded = new Uint8Array(binTotal + binPadding);
  let writeOffset = 0;
  for (const chunk of chunks) {
    binPadded.set(chunk, writeOffset);
    writeOffset += chunk.byteLength;
  }
  // Padding bytes are already 0 from Uint8Array initialization

  // --- Write GLB file ---
  // GLB structure:
  //   Header (12 bytes): magic + version + total length
  //   JSON chunk: length (4) + type (4) + data (padded)
  //   BIN chunk:  length (4) + type (4) + data (padded)
  const glbTotalLength = 12 + 8 + jsonPadded.byteLength + 8 + binPadded.byteLength;
  const glbBuffer = new ArrayBuffer(glbTotalLength);
  const glbView = new DataView(glbBuffer);
  const glbBytes = new Uint8Array(glbBuffer);

  let offset = 0;

  // GLB Header
  glbView.setUint32(offset, 0x46546C67, true); offset += 4; // magic: "glTF"
  glbView.setUint32(offset, 2, true);           offset += 4; // version: 2
  glbView.setUint32(offset, glbTotalLength, true); offset += 4; // total length

  // JSON Chunk Header
  glbView.setUint32(offset, jsonPadded.byteLength, true); offset += 4; // chunk length
  glbView.setUint32(offset, 0x4E4F534A, true);            offset += 4; // chunk type: JSON
  glbBytes.set(jsonPadded, offset);                        offset += jsonPadded.byteLength;

  // BIN Chunk Header
  glbView.setUint32(offset, binPadded.byteLength, true); offset += 4; // chunk length
  glbView.setUint32(offset, 0x004E4942, true);           offset += 4; // chunk type: BIN
  glbBytes.set(binPadded, offset);                        offset += binPadded.byteLength;

  // Write to disk
  const outPath = resolve(outDir, modelName + "_" + clusterIdx + ".glb");
  writeFileSync(outPath, Buffer.from(glbBuffer));
  console.log("Wrote: " + outPath + " (" + (glbTotalLength / 1024).toFixed(0) + " KB)");
}

console.log("");
console.log("Done! " + numClusters + " GLB files written to " + outDir);
