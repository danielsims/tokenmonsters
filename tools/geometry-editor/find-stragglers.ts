import { readFileSync } from "fs";

const glbBuf = readFileSync("/Users/danielsims/Documents/token-monsters/src/three/models/pinchy.glb");

// Parse GLB
const jsonLen = glbBuf.readUInt32LE(12);
const jsonStr = glbBuf.subarray(20, 20 + jsonLen).toString("utf-8");
const gltf = JSON.parse(jsonStr);

const binChunkStart = 20 + jsonLen;
const binStart = binChunkStart + 8;

const meshPrim = gltf.meshes[0].primitives[0];
const posAcc = gltf.accessors[meshPrim.attributes.POSITION];
const posBV = gltf.bufferViews[posAcc.bufferView];
const posOffset = binStart + (posBV.byteOffset || 0) + (posAcc.byteOffset || 0);

const idxAcc = gltf.accessors[meshPrim.indices];
const idxBV = gltf.bufferViews[idxAcc.bufferView];
const idxOffset = binStart + (idxBV.byteOffset || 0) + (idxAcc.byteOffset || 0);

const vertCount = posAcc.count;
const faceCount = idxAcc.count / 3;

function getPos(vi: number): [number, number, number] {
  const off = posOffset + vi * 12;
  return [glbBuf.readFloatLE(off), glbBuf.readFloatLE(off + 4), glbBuf.readFloatLE(off + 8)];
}

function getIndex(i: number): number {
  if (idxAcc.componentType === 5123) return glbBuf.readUInt16LE(idxOffset + i * 2);
  return glbBuf.readUInt32LE(idxOffset + i * 4);
}

// Build islands
console.log("Building islands...");
const vertToFaces: number[][] = new Array(vertCount);
for (let i = 0; i < vertCount; i++) vertToFaces[i] = [];

for (let f = 0; f < faceCount; f++) {
  vertToFaces[getIndex(f * 3)].push(f);
  vertToFaces[getIndex(f * 3 + 1)].push(f);
  vertToFaces[getIndex(f * 3 + 2)].push(f);
}

const faceIsland = new Int32Array(faceCount).fill(-1);
const islandVerts: Set<number>[] = [];
let islandIdx = 0;

for (let f = 0; f < faceCount; f++) {
  if (faceIsland[f] !== -1) continue;
  const verts = new Set<number>();
  const queue = [f];
  faceIsland[f] = islandIdx;

  while (queue.length > 0) {
    const cf = queue.pop()!;
    const v0 = getIndex(cf * 3);
    const v1 = getIndex(cf * 3 + 1);
    const v2 = getIndex(cf * 3 + 2);
    verts.add(v0); verts.add(v1); verts.add(v2);

    for (const vi of [v0, v1, v2]) {
      for (const nf of vertToFaces[vi]) {
        if (faceIsland[nf] === -1) {
          faceIsland[nf] = islandIdx;
          queue.push(nf);
        }
      }
    }
  }

  islandVerts.push(verts);
  islandIdx++;
}

console.log(`Total islands: ${islandVerts.length}`);

function islandCenter(idx: number) {
  const verts = islandVerts[idx];
  let sx = 0, sy = 0, sz = 0;
  for (const vi of verts) {
    const [x, y, z] = getPos(vi);
    sx += x; sy += y; sz += z;
  }
  const n = verts.size;
  return { x: sx / n, y: sy / n, z: sz / n };
}

function islandBounds(idx: number) {
  const verts = islandVerts[idx];
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const vi of verts) {
    const [x, y, z] = getPos(vi);
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

// These are the islands we already moved
const movedIslands = new Set([
  // Original cluster (within 0.15 of island 1099)
  // Plus extras: 1093, 1104, 1102, 1112, 1113
]);

// Rebuild the moved set: cluster within 0.15 of 1099 + extras
const target = islandCenter(1099);
const extras = [1093, 1104, 1102, 1112, 1113];

for (let i = 0; i < islandVerts.length; i++) {
  const c = islandCenter(i);
  const dx = c.x - target.x;
  const dy = c.y - target.y;
  const dz = c.z - target.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist < 0.15 || extras.includes(i)) {
    movedIslands.add(i);
  }
}

console.log(`Already moved: ${movedIslands.size} islands`);
console.log(`Moved IDs: ${[...movedIslands].sort((a, b) => a - b).join(", ")}`);

// Now find stragglers: islands NOT in the moved set but spatially close to the leg region
// The leg region (original position) is roughly:
// X: [-0.45, -0.20], Y: [0.0, 0.35], Z: [-0.35, -0.18]
// Expand slightly to catch edge cases

const LEG_REGION = {
  minX: -0.50, maxX: -0.15,
  minY: -0.02, maxY: 0.40,
  minZ: -0.38, maxZ: -0.10,
};

console.log(`\nSearching for stragglers in leg region...`);
console.log(`Region: X[${LEG_REGION.minX}, ${LEG_REGION.maxX}] Y[${LEG_REGION.minY}, ${LEG_REGION.maxY}] Z[${LEG_REGION.minZ}, ${LEG_REGION.maxZ}]`);

const stragglers: { idx: number; verts: number; center: { x: number; y: number; z: number } }[] = [];

for (let i = 0; i < islandVerts.length; i++) {
  if (movedIslands.has(i)) continue;
  const c = islandCenter(i);
  if (c.x >= LEG_REGION.minX && c.x <= LEG_REGION.maxX &&
      c.y >= LEG_REGION.minY && c.y <= LEG_REGION.maxY &&
      c.z >= LEG_REGION.minZ && c.z <= LEG_REGION.maxZ) {
    stragglers.push({ idx: i, verts: islandVerts[i].size, center: c });
  }
}

stragglers.sort((a, b) => b.verts - a.verts);

console.log(`\nFound ${stragglers.length} potential stragglers:`);
for (const s of stragglers) {
  const b = islandBounds(s.idx);
  console.log(`  Island ${s.idx}: ${s.verts} verts, center=(${s.center.x.toFixed(3)}, ${s.center.y.toFixed(3)}, ${s.center.z.toFixed(3)}), bounds X[${b.minX.toFixed(3)},${b.maxX.toFixed(3)}] Y[${b.minY.toFixed(3)},${b.maxY.toFixed(3)}] Z[${b.minZ.toFixed(3)},${b.maxZ.toFixed(3)}]`);
}

console.log(`\nStraggler IDs: ${stragglers.map(s => s.idx).join(",")}`);
