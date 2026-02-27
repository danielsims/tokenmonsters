/**
 * Inspect a GLB file — dump mesh structure, materials, textures, and geometry islands.
 *
 * Usage: bun run tools/inspect.ts <path-to-glb>
 */
import { readFileSync } from "fs";
import { resolve } from "path";

const glbPath = resolve(process.cwd(), process.argv[2] || "models/bytepup.glb");
console.log("\nInspecting: " + glbPath + "\n");

const buf = readFileSync(glbPath);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const view = new DataView(ab);

const version = view.getUint32(4, true);
const totalLength = view.getUint32(8, true);
console.log("GLB v" + version + "  " + (totalLength / 1024 / 1024).toFixed(1) + " MB");

// Parse JSON chunk
const jsonLen = view.getUint32(12, true);
const json = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 20, jsonLen)));

// Parse BIN chunk
const binOffset = 20 + jsonLen;
const binLen = view.getUint32(binOffset, true);
const binData = new Uint8Array(ab, binOffset + 8, binLen);

// -- Meshes + bounding boxes --
console.log("\nMeshes: " + (json.meshes?.length ?? 0));
for (let i = 0; i < (json.meshes?.length ?? 0); i++) {
  const m = json.meshes[i];
  for (const prim of m.primitives ?? []) {
    const posAcc = json.accessors[prim.attributes.POSITION];
    console.log(
      "  [" + i + "] \"" + (m.name || "?") + "\"  " +
      posAcc.count + " verts  " +
      "bbox [" + posAcc.min.map((v: number) => v.toFixed(3)).join(", ") + "] -> [" +
      posAcc.max.map((v: number) => v.toFixed(3)).join(", ") + "]"
    );
  }
}

// -- Materials --
console.log("\nMaterials: " + (json.materials?.length ?? 0));
for (let i = 0; i < (json.materials?.length ?? 0); i++) {
  const mat = json.materials[i];
  const pbr = mat.pbrMetallicRoughness || {};
  let line = "  [" + i + "] \"" + (mat.name || "?") + "\"";
  if (pbr.baseColorTexture) line += "  tex=" + pbr.baseColorTexture.index;
  console.log(line);
}

// -- Images --
console.log("\nImages: " + (json.images?.length ?? 0));
for (let i = 0; i < (json.images?.length ?? 0); i++) {
  const img = json.images[i];
  const bv = json.bufferViews[img.bufferView];
  console.log("  [" + i + "] " + img.mimeType + "  " + (bv.byteLength / 1024).toFixed(0) + " KB");
}

// -- Connected component analysis on each mesh --
console.log("\n--- Geometry islands ---");

for (let mi = 0; mi < (json.meshes?.length ?? 0); mi++) {
  const mesh = json.meshes[mi];
  for (let pi = 0; pi < mesh.primitives.length; pi++) {
    const prim = mesh.primitives[pi];

    // Read index buffer
    const idxAcc = json.accessors[prim.indices];
    const idxBv = json.bufferViews[idxAcc.bufferView];
    const idxByteOffset = (idxAcc.byteOffset || 0) + (idxBv.byteOffset || 0);
    let indices: Uint16Array | Uint32Array;
    if (idxAcc.componentType === 5123) {
      indices = new Uint16Array(binData.buffer, binData.byteOffset + idxByteOffset, idxAcc.count);
    } else {
      indices = new Uint32Array(binData.buffer, binData.byteOffset + idxByteOffset, idxAcc.count);
    }

    // Read positions
    const posAcc = json.accessors[prim.attributes.POSITION];
    const posBv = json.bufferViews[posAcc.bufferView];
    const posByteOffset = (posAcc.byteOffset || 0) + (posBv.byteOffset || 0);
    const positions = new Float32Array(binData.buffer, binData.byteOffset + posByteOffset, posAcc.count * 3);

    // Union-Find for connected components
    const vertCount = posAcc.count;
    const parent = new Int32Array(vertCount);
    const rank = new Int32Array(vertCount);
    for (let i = 0; i < vertCount; i++) parent[i] = i;

    function find(x: number): number {
      while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
      return x;
    }
    function unite(a: number, b: number) {
      a = find(a); b = find(b);
      if (a === b) return;
      if (rank[a] < rank[b]) [a, b] = [b, a];
      parent[b] = a;
      if (rank[a] === rank[b]) rank[a]++;
    }

    // Unite vertices sharing triangle edges
    const triCount = indices.length / 3;
    for (let t = 0; t < triCount; t++) {
      const i0 = indices[t * 3];
      const i1 = indices[t * 3 + 1];
      const i2 = indices[t * 3 + 2];
      unite(i0, i1);
      unite(i1, i2);
    }

    // Count components and their sizes
    const componentVerts = new Map<number, number>();
    const componentBBox = new Map<number, { min: number[]; max: number[] }>();

    for (let v = 0; v < vertCount; v++) {
      const root = find(v);
      componentVerts.set(root, (componentVerts.get(root) || 0) + 1);

      const x = positions[v * 3];
      const y = positions[v * 3 + 1];
      const z = positions[v * 3 + 2];

      if (!componentBBox.has(root)) {
        componentBBox.set(root, {
          min: [x, y, z],
          max: [x, y, z],
        });
      } else {
        const bb = componentBBox.get(root)!;
        bb.min[0] = Math.min(bb.min[0], x);
        bb.min[1] = Math.min(bb.min[1], y);
        bb.min[2] = Math.min(bb.min[2], z);
        bb.max[0] = Math.max(bb.max[0], x);
        bb.max[1] = Math.max(bb.max[1], y);
        bb.max[2] = Math.max(bb.max[2], z);
      }
    }

    // Sort islands by vertex count descending
    const islands = [...componentVerts.entries()]
      .map(([root, count]) => {
        const bb = componentBBox.get(root)!;
        return { root, count, bbox: bb };
      })
      .sort((a, b) => b.count - a.count);

    console.log(
      "\nMesh [" + mi + "] prim [" + pi + "]: " +
      vertCount + " verts, " + triCount + " tris, " +
      islands.length + " island(s)"
    );

    for (let i = 0; i < Math.min(islands.length, 20); i++) {
      const isl = islands[i];
      const pct = (isl.count / vertCount * 100).toFixed(1);
      const bmin = isl.bbox.min.map((v) => v.toFixed(3)).join(", ");
      const bmax = isl.bbox.max.map((v) => v.toFixed(3)).join(", ");
      console.log(
        "  island " + i + ": " + isl.count + " verts (" + pct + "%)  " +
        "bbox [" + bmin + "] -> [" + bmax + "]"
      );
    }
    if (islands.length > 20) {
      console.log("  ... and " + (islands.length - 20) + " more tiny islands");
    }
  }
}
