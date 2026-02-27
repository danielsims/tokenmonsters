/**
 * Quick spatial clustering test — find the 3 monster instances by grouping island centroids.
 * Run: bun run tools/_cluster-test.ts models/bytepup.glb
 */
import { readFileSync } from "fs";
import { resolve } from "path";

const glbPath = resolve(process.cwd(), process.argv[2] || "models/bytepup.glb");
const buf = readFileSync(glbPath);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const view = new DataView(ab);

const jsonLen = view.getUint32(12, true);
const json = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 20, jsonLen)));
const binOffset = 20 + jsonLen;
const binLen = view.getUint32(binOffset, true);
const binData = new Uint8Array(ab, binOffset + 8, binLen);

const prim = json.meshes[0].primitives[0];

// Read indices
const idxAcc = json.accessors[prim.indices];
const idxBv = json.bufferViews[idxAcc.bufferView];
const idxByteOff = (idxAcc.byteOffset || 0) + (idxBv.byteOffset || 0);
let indices: Uint16Array | Uint32Array;
if (idxAcc.componentType === 5123) {
  indices = new Uint16Array(binData.buffer, binData.byteOffset + idxByteOff, idxAcc.count);
} else {
  indices = new Uint32Array(binData.buffer, binData.byteOffset + idxByteOff, idxAcc.count);
}

// Read positions
const posAcc = json.accessors[prim.attributes.POSITION];
const posBv = json.bufferViews[posAcc.bufferView];
const posByteOff = (posAcc.byteOffset || 0) + (posBv.byteOffset || 0);
const positions = new Float32Array(binData.buffer, binData.byteOffset + posByteOff, posAcc.count * 3);
const vertCount = posAcc.count;

// Union-Find
const parent = new Int32Array(vertCount);
for (let i = 0; i < vertCount; i++) parent[i] = i;
function find(x: number): number {
  while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
  return x;
}
function unite(a: number, b: number) {
  a = find(a); b = find(b);
  if (a !== b) parent[b] = a;
}
for (let t = 0; t < indices.length / 3; t++) {
  unite(indices[t * 3], indices[t * 3 + 1]);
  unite(indices[t * 3 + 1], indices[t * 3 + 2]);
}

// Compute island centroids + sizes
const islandSum = new Map<number, { sx: number; sy: number; sz: number; count: number }>();
for (let v = 0; v < vertCount; v++) {
  const root = find(v);
  if (!islandSum.has(root)) islandSum.set(root, { sx: 0, sy: 0, sz: 0, count: 0 });
  const s = islandSum.get(root)!;
  s.sx += positions[v * 3];
  s.sy += positions[v * 3 + 1];
  s.sz += positions[v * 3 + 2];
  s.count++;
}

const islands = [...islandSum.entries()].map(([root, s]) => ({
  root,
  cx: s.sx / s.count,
  cy: s.sy / s.count,
  cz: s.sz / s.count,
  count: s.count,
}));

console.log("Total islands: " + islands.length);
console.log("Total verts: " + vertCount);

// K-means with k=3 on centroids (weighted by vertex count)
// Initialize centroids by picking the 3 islands with most spread on X axis
const sortedByX = [...islands].sort((a, b) => a.cx - b.cx);
let centroids = [
  { x: sortedByX[0].cx, y: sortedByX[0].cy, z: sortedByX[0].cz },
  { x: sortedByX[Math.floor(sortedByX.length / 2)].cx, y: sortedByX[Math.floor(sortedByX.length / 2)].cy, z: sortedByX[Math.floor(sortedByX.length / 2)].cz },
  { x: sortedByX[sortedByX.length - 1].cx, y: sortedByX[sortedByX.length - 1].cy, z: sortedByX[sortedByX.length - 1].cz },
];

let assignments = new Int32Array(islands.length);

for (let iter = 0; iter < 50; iter++) {
  // Assign each island to nearest centroid
  let changed = false;
  for (let i = 0; i < islands.length; i++) {
    const isl = islands[i];
    let bestDist = Infinity;
    let bestK = 0;
    for (let k = 0; k < 3; k++) {
      const dx = isl.cx - centroids[k].x;
      const dy = isl.cy - centroids[k].y;
      const dz = isl.cz - centroids[k].z;
      const dist = dx * dx + dy * dy + dz * dz;
      if (dist < bestDist) { bestDist = dist; bestK = k; }
    }
    if (assignments[i] !== bestK) { assignments[i] = bestK; changed = true; }
  }
  if (!changed) {
    console.log("K-means converged at iteration " + iter);
    break;
  }

  // Recompute centroids (weighted by vertex count)
  for (let k = 0; k < 3; k++) {
    let wx = 0, wy = 0, wz = 0, totalW = 0;
    for (let i = 0; i < islands.length; i++) {
      if (assignments[i] !== k) continue;
      const w = islands[i].count;
      wx += islands[i].cx * w;
      wy += islands[i].cy * w;
      wz += islands[i].cz * w;
      totalW += w;
    }
    if (totalW > 0) {
      centroids[k] = { x: wx / totalW, y: wy / totalW, z: wz / totalW };
    }
  }
}

// Report clusters
for (let k = 0; k < 3; k++) {
  let totalVerts = 0;
  let islandCount = 0;
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < islands.length; i++) {
    if (assignments[i] !== k) continue;
    totalVerts += islands[i].count;
    islandCount++;
    minX = Math.min(minX, islands[i].cx); maxX = Math.max(maxX, islands[i].cx);
    minY = Math.min(minY, islands[i].cy); maxY = Math.max(maxY, islands[i].cy);
    minZ = Math.min(minZ, islands[i].cz); maxZ = Math.max(maxZ, islands[i].cz);
  }
  console.log(
    "\nCluster " + k + ": " + totalVerts + " verts (" + (totalVerts / vertCount * 100).toFixed(1) + "%), " +
    islandCount + " islands"
  );
  console.log(
    "  centroid: (" + centroids[k].x.toFixed(3) + ", " + centroids[k].y.toFixed(3) + ", " + centroids[k].z.toFixed(3) + ")"
  );
  console.log(
    "  X range: " + minX.toFixed(3) + " to " + maxX.toFixed(3) +
    "  Y range: " + minY.toFixed(3) + " to " + maxY.toFixed(3) +
    "  Z range: " + minZ.toFixed(3) + " to " + maxZ.toFixed(3)
  );
}
