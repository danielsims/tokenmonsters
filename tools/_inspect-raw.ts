/**
 * Quick raw GLB inspection — no Three.js, just parses the binary structure.
 * Run: bun run tools/_inspect-raw.ts <path-to-glb>
 */
import { readFileSync } from "fs";
import { resolve } from "path";

const glbPath = process.argv[2] || "models/bytepup.glb";
const abs = resolve(process.cwd(), glbPath);
console.log("\n=== Inspecting: " + abs + " ===\n");

const buf = readFileSync(abs);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const view = new DataView(ab);

// GLB header
const magic = view.getUint32(0, true);
const version = view.getUint32(4, true);
const totalLength = view.getUint32(8, true);
console.log("GLB version " + version + ", total " + (totalLength / 1024 / 1024).toFixed(1) + " MB");

// JSON chunk
const jsonLen = view.getUint32(12, true);
const jsonBytes = new Uint8Array(ab, 20, jsonLen);
const json = JSON.parse(new TextDecoder().decode(jsonBytes));

// BIN chunk
const binOffset = 20 + jsonLen;
const binLen = view.getUint32(binOffset, true);
console.log("JSON chunk: " + (jsonLen / 1024).toFixed(0) + " KB, BIN chunk: " + (binLen / 1024 / 1024).toFixed(1) + " MB\n");

// Nodes
const nodeCount = json.nodes?.length ?? 0;
console.log("--- Nodes (" + nodeCount + ") ---");
for (let i = 0; i < nodeCount; i++) {
  const n = json.nodes[i];
  let line = "[" + i + "] \"" + (n.name || "(unnamed)") + "\"";
  if (n.mesh !== undefined) line += "  mesh=" + n.mesh;
  if (n.children?.length) line += "  children=[" + n.children.join(",") + "]";
  if (n.translation) line += "  pos=[" + n.translation.map((v: number) => v.toFixed(2)).join(", ") + "]";
  if (n.scale) line += "  scale=[" + n.scale.map((v: number) => v.toFixed(2)).join(", ") + "]";
  if (n.rotation) line += "  rot=[" + n.rotation.map((v: number) => v.toFixed(2)).join(", ") + "]";
  console.log(line);
}

// Meshes
const meshCount = json.meshes?.length ?? 0;
console.log("\n--- Meshes (" + meshCount + ") ---");
for (let i = 0; i < meshCount; i++) {
  const m = json.meshes[i];
  const primCount = m.primitives?.length ?? 0;
  const matIndices = m.primitives?.map((p: any) => p.material).filter((x: any) => x !== undefined);
  const attrs = m.primitives?.[0]?.attributes ? Object.keys(m.primitives[0].attributes) : [];
  console.log("[" + i + "] \"" + (m.name || "(unnamed)") + "\" - " + primCount + " prim(s), materials=[" + matIndices.join(",") + "], attrs=[" + attrs.join(",") + "]");

  // Bounding box from POSITION accessor
  for (const prim of (m.primitives ?? [])) {
    const posIdx = prim.attributes?.POSITION;
    if (posIdx !== undefined) {
      const acc = json.accessors[posIdx];
      const minStr = acc.min?.map((v: number) => v.toFixed(3)).join(", ") ?? "?";
      const maxStr = acc.max?.map((v: number) => v.toFixed(3)).join(", ") ?? "?";
      console.log("     verts=" + acc.count + "  min=[" + minStr + "]  max=[" + maxStr + "]");
    }
  }
}

// Materials
const matCount = json.materials?.length ?? 0;
console.log("\n--- Materials (" + matCount + ") ---");
for (let i = 0; i < matCount; i++) {
  const mat = json.materials[i];
  const pbr = mat.pbrMetallicRoughness || {};
  let line = "[" + i + "] \"" + (mat.name || "(unnamed)") + "\"";
  if (pbr.baseColorTexture) line += "  colorTex=" + pbr.baseColorTexture.index;
  if (pbr.baseColorFactor) line += "  colorFactor=[" + pbr.baseColorFactor.map((v: number) => v.toFixed(2)).join(",") + "]";
  if (pbr.metallicFactor !== undefined) line += "  metal=" + pbr.metallicFactor;
  if (pbr.roughnessFactor !== undefined) line += "  rough=" + pbr.roughnessFactor;
  if (mat.normalTexture) line += "  normalTex=" + mat.normalTexture.index;
  if (mat.emissiveTexture) line += "  emissiveTex=" + mat.emissiveTexture.index;
  if (mat.occlusionTexture) line += "  aoTex=" + mat.occlusionTexture.index;
  console.log(line);
}

// Textures & Images
const texCount = json.textures?.length ?? 0;
console.log("\n--- Textures (" + texCount + ") ---");
for (let i = 0; i < texCount; i++) {
  const t = json.textures[i];
  console.log("[" + i + "] source=image[" + t.source + "]  sampler=" + (t.sampler ?? "default"));
}

const imgCount = json.images?.length ?? 0;
console.log("\n--- Images (" + imgCount + ") ---");
for (let i = 0; i < imgCount; i++) {
  const img = json.images[i];
  const bv = json.bufferViews[img.bufferView];
  const size = bv.byteLength;
  console.log("[" + i + "] \"" + (img.name || "(unnamed)") + "\"  mime=" + img.mimeType + "  size=" + (size / 1024).toFixed(0) + " KB");
}

// Scene hierarchy
console.log("\n--- Scene hierarchy ---");
const scenes = json.scenes ?? [];
for (const sc of scenes) {
  console.log("Scene \"" + (sc.name || "(unnamed)") + "\" roots: [" + sc.nodes.join(", ") + "]");
  function printTree(nodeIdx: number, depth: number) {
    const n = json.nodes[nodeIdx];
    const prefix = "  ".repeat(depth);
    const meshTag = n.mesh !== undefined ? " [mesh " + n.mesh + "]" : "";
    const posTag = n.translation ? " @ (" + n.translation.map((v: number) => v.toFixed(2)).join(", ") + ")" : "";
    console.log(prefix + "|- [" + nodeIdx + "] \"" + (n.name || "(unnamed)") + "\"" + meshTag + posTag);
    for (const c of (n.children ?? [])) {
      printTree(c, depth + 1);
    }
  }
  for (const root of sc.nodes) {
    printTree(root, 1);
  }
}

console.log("\n--- Summary ---");
console.log("Nodes: " + (json.nodes?.length ?? 0));
console.log("Meshes: " + (json.meshes?.length ?? 0));
console.log("Materials: " + (json.materials?.length ?? 0));
console.log("Textures: " + (json.textures?.length ?? 0));
console.log("Images: " + (json.images?.length ?? 0));
console.log("Accessors: " + (json.accessors?.length ?? 0));
console.log("BufferViews: " + (json.bufferViews?.length ?? 0));
