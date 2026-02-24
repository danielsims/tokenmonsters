import { readFileSync, writeFileSync } from "fs";

const glbBuf = Buffer.from(readFileSync("/Users/danielsims/Documents/token-monsters/src/three/models/pinchy.glb"));

// Parse GLB
const jsonLen = glbBuf.readUInt32LE(12);
const jsonStr = glbBuf.subarray(20, 20 + jsonLen).toString("utf-8");
const gltf = JSON.parse(jsonStr);

const binChunkStart = 20 + jsonLen;
const binLen = glbBuf.readUInt32LE(binChunkStart);
const binStart = binChunkStart + 8;

// Get position accessor info
const meshPrim = gltf.meshes[0].primitives[0];
const posAcc = gltf.accessors[meshPrim.attributes.POSITION];
const posBV = gltf.bufferViews[posAcc.bufferView];
const posOffset = binStart + (posBV.byteOffset || 0) + (posAcc.byteOffset || 0);

const idxAcc = gltf.accessors[meshPrim.indices];
const idxBV = gltf.bufferViews[idxAcc.bufferView];
const idxOffset = binStart + (idxBV.byteOffset || 0) + (idxAcc.byteOffset || 0);

const vertCount = posAcc.count;
const faceCount = idxAcc.count / 3;

// Read positions directly from buffer
function getPos(vi: number): [number, number, number] {
  const off = posOffset + vi * 12;
  return [glbBuf.readFloatLE(off), glbBuf.readFloatLE(off + 4), glbBuf.readFloatLE(off + 8)];
}

function setPos(vi: number, x: number, y: number, z: number) {
  const off = posOffset + vi * 12;
  glbBuf.writeFloatLE(x, off);
  glbBuf.writeFloatLE(y, off + 4);
  glbBuf.writeFloatLE(z, off + 8);
}

function getIndex(i: number): number {
  if (idxAcc.componentType === 5123) return glbBuf.readUInt16LE(idxOffset + i * 2);
  return glbBuf.readUInt32LE(idxOffset + i * 4);
}

// Build islands
console.log(`Vertices: ${vertCount}, Faces: ${faceCount}`);
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

console.log(`Islands: ${islandVerts.length}`);

// Find island 1099's center
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

const target = islandCenter(1099);
console.log(`Island 1099 center: (${target.x.toFixed(4)}, ${target.y.toFixed(4)}, ${target.z.toFixed(4)})`);

// Find all islands in the leg cluster
const CLUSTER_RADIUS = 0.15;
const legIslands: number[] = [];

// Extra islands to include (specified manually)
const EXTRA_ISLANDS = (process.env.EXTRA || "").split(",").filter(Boolean).map(Number);

for (let i = 0; i < islandVerts.length; i++) {
  if (EXTRA_ISLANDS.includes(i)) {
    legIslands.push(i);
    continue;
  }
  const c = islandCenter(i);
  const dx = c.x - target.x;
  const dy = c.y - target.y;
  const dz = c.z - target.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist < CLUSTER_RADIUS) {
    legIslands.push(i);
  }
}

console.log(`Leg cluster: ${legIslands.length} islands`);

// Nudge offset — move toward body (inward: +X, +Z direction)
const NUDGE_X = parseFloat(process.argv[2] || "0.04");
const NUDGE_Y = parseFloat(process.argv[3] || "0");
const NUDGE_Z = parseFloat(process.argv[4] || "0.02");

console.log(`Nudging by (${NUDGE_X}, ${NUDGE_Y}, ${NUDGE_Z})`);

let movedVerts = 0;
for (const isl of legIslands) {
  for (const vi of islandVerts[isl]) {
    const [x, y, z] = getPos(vi);
    setPos(vi, x + NUDGE_X, y + NUDGE_Y, z + NUDGE_Z);
    movedVerts++;
  }
}

console.log(`Moved ${movedVerts} vertices`);

// Update position accessor min/max
let minX = Infinity, minY = Infinity, minZ = Infinity;
let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
for (let i = 0; i < vertCount; i++) {
  const [x, y, z] = getPos(i);
  if (x < minX) minX = x; if (x > maxX) maxX = x;
  if (y < minY) minY = y; if (y > maxY) maxY = y;
  if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
}
posAcc.min = [minX, minY, minZ];
posAcc.max = [maxX, maxY, maxZ];

// Write updated JSON back into GLB
const newJson = JSON.stringify(gltf);
const jsonBuf = Buffer.from(newJson, "utf-8");
// Pad to 4-byte alignment
const padded = jsonBuf.length % 4 === 0 ? jsonBuf : Buffer.concat([jsonBuf, Buffer.alloc(4 - (jsonBuf.length % 4), 0x20)]);

// Rebuild GLB: header(12) + json chunk header(8) + json + bin chunk header(8) + bin
const totalLen = 12 + 8 + padded.length + 8 + binLen;
const out = Buffer.alloc(totalLen);

// GLB header
out.writeUInt32LE(0x46546C67, 0); // magic
out.writeUInt32LE(2, 4);           // version
out.writeUInt32LE(totalLen, 8);    // total length

// JSON chunk
out.writeUInt32LE(padded.length, 12);
out.writeUInt32LE(0x4E4F534A, 16); // "JSON"
padded.copy(out, 20);

// Bin chunk — copy from modified buffer
const binChunkOffset = 20 + padded.length;
out.writeUInt32LE(binLen, binChunkOffset);
out.writeUInt32LE(0x004E4942, binChunkOffset + 4); // "BIN\0"
glbBuf.copy(out, binChunkOffset + 8, binStart, binStart + binLen);

const outPath = "/private/tmp/geo-editor/pinchy-nudged.glb";
writeFileSync(outPath, out);
console.log(`Written to ${outPath}`);
