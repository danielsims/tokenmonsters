import { readFileSync, writeFileSync } from "fs";

// Minimal GLB/glTF parser — extract mesh geometry
const glbBuf = readFileSync("/Users/danielsims/Documents/token-monsters/src/three/models/pinchy.glb");

// GLB header: magic(4) version(4) length(4) then chunks
const magic = glbBuf.readUInt32LE(0);
if (magic !== 0x46546C67) throw new Error("Not a GLB file");

const jsonLen = glbBuf.readUInt32LE(12);
const jsonStr = glbBuf.subarray(20, 20 + jsonLen).toString("utf-8");
const gltf = JSON.parse(jsonStr);

// Binary chunk starts after JSON chunk
const binChunkStart = 20 + jsonLen;
const binLen = glbBuf.readUInt32LE(binChunkStart);
const binData = glbBuf.subarray(binChunkStart + 8, binChunkStart + 8 + binLen);

// Get accessor data
function getAccessorData(accessorIdx: number): { data: Float32Array | Uint16Array | Uint32Array; count: number; type: string } {
  const accessor = gltf.accessors[accessorIdx];
  const bufferView = gltf.bufferViews[accessor.bufferView];
  const offset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
  const count = accessor.count;

  if (accessor.componentType === 5126) { // FLOAT
    const data = new Float32Array(binData.buffer, binData.byteOffset + offset, count * (accessor.type === "VEC3" ? 3 : accessor.type === "VEC2" ? 2 : 1));
    return { data, count, type: accessor.type };
  } else if (accessor.componentType === 5123) { // UNSIGNED_SHORT
    const data = new Uint16Array(binData.buffer, binData.byteOffset + offset, count);
    return { data, count, type: "SCALAR" };
  } else if (accessor.componentType === 5125) { // UNSIGNED_INT
    const data = new Uint32Array(binData.buffer, binData.byteOffset + offset, count);
    return { data, count, type: "SCALAR" };
  }
  throw new Error(`Unsupported component type: ${accessor.componentType}`);
}

// Get mesh primitives
const meshPrim = gltf.meshes[0].primitives[0];
const posAccessor = meshPrim.attributes.POSITION;
const indexAccessor = meshPrim.indices;

const { data: positions, count: vertCount } = getAccessorData(posAccessor);
const { data: indices, count: indexCount } = getAccessorData(indexAccessor);
const faceCount = indexCount / 3;

console.log(`Vertices: ${vertCount}, Faces: ${faceCount}`);

// Build islands via flood fill
console.log("Building islands...");
const vertToFaces: number[][] = new Array(vertCount);
for (let i = 0; i < vertCount; i++) vertToFaces[i] = [];

for (let f = 0; f < faceCount; f++) {
  vertToFaces[indices[f * 3]].push(f);
  vertToFaces[indices[f * 3 + 1]].push(f);
  vertToFaces[indices[f * 3 + 2]].push(f);
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
    const v0 = indices[cf * 3];
    const v1 = indices[cf * 3 + 1];
    const v2 = indices[cf * 3 + 2];
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

// Analyze island 1099
function islandCenter(idx: number): { x: number; y: number; z: number } {
  const verts = islandVerts[idx];
  let sx = 0, sy = 0, sz = 0;
  for (const vi of verts) {
    sx += positions[vi * 3];
    sy += positions[vi * 3 + 1];
    sz += positions[vi * 3 + 2];
  }
  const n = verts.size;
  return { x: sx / n, y: sy / n, z: sz / n };
}

function islandBounds(idx: number) {
  const verts = islandVerts[idx];
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const vi of verts) {
    const x = positions[vi * 3], y = positions[vi * 3 + 1], z = positions[vi * 3 + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

const target = islandCenter(1099);
const targetBounds = islandBounds(1099);
console.log(`\nIsland 1099:`);
console.log(`  Center: (${target.x.toFixed(4)}, ${target.y.toFixed(4)}, ${target.z.toFixed(4)})`);
console.log(`  Bounds: X[${targetBounds.minX.toFixed(3)}, ${targetBounds.maxX.toFixed(3)}] Y[${targetBounds.minY.toFixed(3)}, ${targetBounds.maxY.toFixed(3)}] Z[${targetBounds.minZ.toFixed(3)}, ${targetBounds.maxZ.toFixed(3)}]`);
console.log(`  Verts: ${islandVerts[1099].size}`);

// Find all islands within a spatial radius of island 1099's center
// These likely form the same "leg" cluster
const CLUSTER_RADIUS = 0.15;
const legIslands: number[] = [];

for (let i = 0; i < islandVerts.length; i++) {
  const c = islandCenter(i);
  const dx = c.x - target.x;
  const dy = c.y - target.y;
  const dz = c.z - target.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist < CLUSTER_RADIUS) {
    legIslands.push(i);
  }
}

console.log(`\nLeg cluster (within ${CLUSTER_RADIUS} of island 1099): ${legIslands.length} islands`);

let totalVerts = 0;
let clusterMinX = Infinity, clusterMaxX = -Infinity;
let clusterMinY = Infinity, clusterMaxY = -Infinity;
let clusterMinZ = Infinity, clusterMaxZ = -Infinity;

for (const i of legIslands) {
  const b = islandBounds(i);
  totalVerts += islandVerts[i].size;
  if (b.minX < clusterMinX) clusterMinX = b.minX;
  if (b.maxX > clusterMaxX) clusterMaxX = b.maxX;
  if (b.minY < clusterMinY) clusterMinY = b.minY;
  if (b.maxY > clusterMaxY) clusterMaxY = b.maxY;
  if (b.minZ < clusterMinZ) clusterMinZ = b.minZ;
  if (b.maxZ > clusterMaxZ) clusterMaxZ = b.maxZ;
}

console.log(`  Total verts: ${totalVerts}`);
console.log(`  Cluster bounds: X[${clusterMinX.toFixed(3)}, ${clusterMaxX.toFixed(3)}] Y[${clusterMinY.toFixed(3)}, ${clusterMaxY.toFixed(3)}] Z[${clusterMinZ.toFixed(3)}, ${clusterMaxZ.toFixed(3)}]`);

// Now figure out where the body is — find the nearest body geometry
// Look for large islands (body) near the leg cluster
console.log("\nNearest large islands (potential body attachment point):");
const nearbyLarge: { idx: number; dist: number; center: { x: number; y: number; z: number }; verts: number }[] = [];

for (let i = 0; i < islandVerts.length; i++) {
  if (legIslands.includes(i)) continue;
  if (islandVerts[i].size < 100) continue; // only look at substantial islands
  const c = islandCenter(i);
  const dx = c.x - target.x;
  const dy = c.y - target.y;
  const dz = c.z - target.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist < 0.5) {
    nearbyLarge.push({ idx: i, dist, center: c, verts: islandVerts[i].size });
  }
}

nearbyLarge.sort((a, b) => a.dist - b.dist);
for (const n of nearbyLarge.slice(0, 10)) {
  console.log(`  Island ${n.idx}: ${n.verts} verts, dist=${n.dist.toFixed(4)}, center=(${n.center.x.toFixed(3)}, ${n.center.y.toFixed(3)}, ${n.center.z.toFixed(3)})`);
}
