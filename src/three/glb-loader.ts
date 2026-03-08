/**
 * GLB loading for the OpenTUI WebGPU terminal renderer.
 *
 * Pipeline:
 * 1. Detect terminal capabilities → adapt texture size & FPS.
 * 2. Polyfill createImageBitmap for Bun (Jimp decode + contrast boost).
 * 3. Convert polyfilled textures → DataTexture for WebGPU.
 * 4. Swap ALL non-Basic materials → MeshBasicMaterial.
 * 5. Merge meshes sharing the same material into one draw call.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Jimp, ResizeStrategy } from "jimp";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

/* ── Terminal detection ─────────────────────────────────────────────── */

export type TerminalTier = 1 | 2 | 3;

export interface TerminalProfile {
  name: string;
  tier: TerminalTier;
  fps: number;
  textureSize: number;
  showGround: boolean;
}

export function detectTerminal(): TerminalProfile {
  const prog = (process.env.TERM_PROGRAM ?? "").toLowerCase();
  const term = (process.env.TERM ?? "").toLowerCase();

  // Tier 1: GPU-accelerated terminals (true color, fast output)
  if (
    prog === "ghostty" || prog === "alacritty" || prog === "wezterm" ||
    prog === "kitty" || term === "xterm-kitty"
  ) {
    return { name: prog || "kitty", tier: 1, fps: 30, textureSize: 512, showGround: true };
  }

  // Tier 3: Very limited terminals (256 color, slow)
  if (prog === "apple_terminal") {
    return { name: "Terminal.app", tier: 3, fps: 8, textureSize: 512, showGround: false };
  }

  // Tier 2: xterm.js-based (VS Code, Cursor) — fast GPU but slow ANSI throughput
  if (prog === "vscode" || prog.includes("cursor")) {
    return { name: prog, tier: 2, fps: 15, textureSize: 512, showGround: true };
  }

  // Unknown — conservative defaults
  return { name: prog || "unknown", tier: 2, fps: 15, textureSize: 512, showGround: true };
}

export const terminal = detectTerminal();
const MAX_TEXTURE_SIZE = terminal.textureSize;
const DEBUG = true;
const debugLog: string[] = [];
function log(msg: string) {
  if (DEBUG) debugLog.push(msg);
}
log(`[terminal] ${terminal.name} tier=${terminal.tier} fps=${terminal.fps} tex=${terminal.textureSize}`);

if (typeof globalThis.createImageBitmap === "undefined") {
  (globalThis as any).createImageBitmap = async function (
    source: Blob | ImageData,
  ) {
    let buffer: Buffer;
    if (source instanceof Blob) {
      buffer = Buffer.from(await source.arrayBuffer());
    } else {
      throw new Error("createImageBitmap polyfill: unsupported source type");
    }

    const image = await Jimp.read(buffer);
    log(`[polyfill] decoded ${buffer.length} bytes -> ${image.bitmap.width}x${image.bitmap.height}`);

    if (
      image.bitmap.width > MAX_TEXTURE_SIZE ||
      image.bitmap.height > MAX_TEXTURE_SIZE
    ) {
      const aspect = image.bitmap.width / image.bitmap.height;
      const newW = aspect >= 1 ? MAX_TEXTURE_SIZE : Math.round(MAX_TEXTURE_SIZE * aspect);
      const newH = aspect >= 1 ? Math.round(MAX_TEXTURE_SIZE / aspect) : MAX_TEXTURE_SIZE;
      image.resize({ w: newW, h: newH, mode: ResizeStrategy.BICUBIC });
      log(`[polyfill] downscaled to ${newW}x${newH}`);
    }

    try {
      image.contrast(0.12);
    } catch {}

    // Gamma lift to bring out shadow detail
    const { width, height } = image.bitmap;
    const px = image.bitmap.data as Buffer;
    for (let i = 0; i < px.length; i += 4) {
      px[i]     = Math.round(255 * Math.pow(px[i]     / 255, 0.78));
      px[i + 1] = Math.round(255 * Math.pow(px[i + 1] / 255, 0.78));
      px[i + 2] = Math.round(255 * Math.pow(px[i + 2] / 255, 0.78));
    }

    const data = new Uint8Array(px);
    return { width, height, data, close: () => {} };
  };
}

function convertToDataTextures(model: THREE.Group) {
  const converted = new Map<THREE.Texture, THREE.DataTexture>();
  let count = 0;

  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];

    for (const mat of materials) {
      for (const prop of ["map", "normalMap", "emissiveMap", "aoMap"] as const) {
        const tex = (mat as any)[prop] as THREE.Texture | null;
        if (!tex || !tex.image?.data || (tex as any).isDataTexture) continue;

        if (!converted.has(tex)) {
          const img = tex.image;
          const dataTex = new THREE.DataTexture(
            img.data, img.width, img.height,
            THREE.RGBAFormat, THREE.UnsignedByteType,
          );
          dataTex.flipY = false;
          dataTex.wrapS = tex.wrapS;
          dataTex.wrapT = tex.wrapT;
          dataTex.colorSpace = tex.colorSpace;
          dataTex.magFilter = THREE.LinearFilter;
          dataTex.minFilter = THREE.LinearFilter;
          dataTex.generateMipmaps = false;
          dataTex.needsUpdate = true;
          converted.set(tex, dataTex);
          count++;
          log(`[dataTex] ${img.width}x${img.height}`);
        }
        (mat as any)[prop] = converted.get(tex)!;
      }
    }
  });
  log(`[dataTex] converted ${count} textures`);
}

function swapToBasicMaterials(model: THREE.Group) {
  let count = 0;
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];

    const newMaterials = materials.map((mat: THREE.Material) => {
      if ((mat as any).isMeshBasicMaterial) return mat;

      const src = mat as any;
      log(`[swap] "${mat.name}" ${mat.type} -> MeshBasicMaterial`);

      const basic = new THREE.MeshBasicMaterial({
        map: src.map ?? undefined,
        color: src.color ?? new THREE.Color(0xffffff),
        side: src.side ?? THREE.FrontSide,
        transparent: src.transparent ?? false,
        opacity: src.opacity ?? 1.0,
        alphaTest: src.alphaTest ?? 0,
      });
      basic.name = mat.name;
      count++;
      return basic;
    });

    child.material = newMaterials.length === 1 ? newMaterials[0] : newMaterials;
  });
  log(`[swap] swapped ${count} materials`);
}

function mergeModelMeshes(model: THREE.Group) {
  const groups = new Map<string, { material: THREE.Material; meshes: THREE.Mesh[] }>();

  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const mat = Array.isArray(child.material) ? child.material[0] : child.material;
    if (!groups.has(mat.uuid)) groups.set(mat.uuid, { material: mat, meshes: [] });
    groups.get(mat.uuid)!.meshes.push(child);
  });

  for (const [, { material, meshes }] of groups) {
    if (meshes.length <= 1) continue;

    model.updateMatrixWorld(true);
    const modelInverse = new THREE.Matrix4().copy(model.matrixWorld).invert();

    const attrSets = meshes.map((m) => new Set(Object.keys(m.geometry.attributes)));
    const commonAttrs = [...attrSets[0]].filter((a) => attrSets.every((s) => s.has(a)));
    log(`[merge] ${meshes.length} meshes, attrs: ${commonAttrs.join(", ")}`);

    const clones: THREE.BufferGeometry[] = [];
    for (const mesh of meshes) {
      const geo = mesh.geometry.clone();
      for (const name of Object.keys(geo.attributes)) {
        if (!commonAttrs.includes(name)) geo.deleteAttribute(name);
      }
      geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(modelInverse, mesh.matrixWorld));
      clones.push(geo);
    }

    const merged = mergeGeometries(clones, false);
    clones.forEach((g) => g.dispose());

    if (!merged) {
      log(`[merge] FAILED`);
      continue;
    }

    for (const mesh of meshes) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
    model.add(new THREE.Mesh(merged, material));
    log(`[merge] ${meshes.length} -> 1`);
  }
}

export interface GLBSceneResult {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  update: (time: number, rotationOffset?: number) => void;
  ready: Promise<void>;
}

/** Dispose all geometries, materials, and textures in a scene */
export function disposeScene(scene: THREE.Scene): void {
  try {
    if (scene.background instanceof THREE.Texture) {
      scene.background.dispose();
    }
  } catch {}
  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    try {
      child.geometry?.dispose();
    } catch {}
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of materials) {
      if (!mat) continue;
      try {
        if (mat.map) mat.map.dispose();
        if ((mat as any).normalMap) (mat as any).normalMap.dispose();
        if ((mat as any).emissiveMap) (mat as any).emissiveMap.dispose();
        mat.dispose();
      } catch {}
    }
  });
}

/** Update a scene's gradient background without rebuilding the scene */
export function updateSceneBackground(scene: THREE.Scene, background: number): void {
  // Dispose old background texture
  if (scene.background instanceof THREE.Texture) {
    scene.background.dispose();
  }
  const bgBase = new THREE.Color(background);
  const hsl = { h: 0, s: 0, l: 0 };
  bgBase.getHSL(hsl);
  const top = new THREE.Color().setHSL(hsl.h, hsl.s, Math.min(1, hsl.l * 1.3));
  const bot = new THREE.Color().setHSL(hsl.h, hsl.s * 0.9, hsl.l * 0.5);
  const h = 64;
  const data = new Uint8Array(h * 4);
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);
    data[y * 4]     = Math.round((bot.r + (top.r - bot.r) * t) * 255);
    data[y * 4 + 1] = Math.round((bot.g + (top.g - bot.g) * t) * 255);
    data[y * 4 + 2] = Math.round((bot.b + (top.b - bot.b) * t) * 255);
    data[y * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, 1, h, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  scene.background = tex;
}

export function loadGlbTestScene(
  modelPath: string,
  options: {
    targetHeight?: number;
    cameraFov?: number;
    cameraDistance?: number;
    cameraHeight?: number;
    lookAtHeight?: number;
    orbitSpeed?: number;
    background?: number;
    showGround?: boolean;
    yOffset?: number;
    brightness?: number;
    tint?: number;
  } = {},
): GLBSceneResult {
  const {
    targetHeight = 2.0,
    cameraFov = 45,
    cameraDistance = 4.0,
    cameraHeight = 1.5,
    lookAtHeight = 0.8,
    orbitSpeed = 0.3,
    background = 0x2a3a5c,
    showGround = terminal.showGround,
    yOffset = 0,
    brightness = 1.0,
    tint,
  } = options;

  const scene = new THREE.Scene();

  // Bake a vertical gradient into a DataTexture for scene.background
  {
    const bgBase = new THREE.Color(background);
    const hsl = { h: 0, s: 0, l: 0 };
    bgBase.getHSL(hsl);
    const top = new THREE.Color().setHSL(hsl.h, hsl.s, Math.min(1, hsl.l * 1.3));
    const bot = new THREE.Color().setHSL(hsl.h, hsl.s * 0.9, hsl.l * 0.5);
    const h = 64;
    const data = new Uint8Array(h * 4);
    for (let y = 0; y < h; y++) {
      const t = y / (h - 1); // 0 = bottom row, 1 = top row
      data[y * 4]     = Math.round((bot.r + (top.r - bot.r) * t) * 255);
      data[y * 4 + 1] = Math.round((bot.g + (top.g - bot.g) * t) * 255);
      data[y * 4 + 2] = Math.round((bot.b + (top.b - bot.b) * t) * 255);
      data[y * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, 1, h, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    scene.background = tex;
  }

  if (showGround) {
    // Bake a radial gradient with alpha fade into a DataTexture
    const gSize = 64;
    // Derive ground color from background (slightly darker)
    const gColor = new THREE.Color(background);
    const gHSL = { h: 0, s: 0, l: 0 };
    gColor.getHSL(gHSL);
    gColor.setHSL(gHSL.h, gHSL.s * 0.8, gHSL.l * 0.6);
    const gData = new Uint8Array(gSize * gSize * 4);
    for (let y = 0; y < gSize; y++) {
      for (let x = 0; x < gSize; x++) {
        const dx = (x / (gSize - 1)) * 2 - 1;
        const dy = (y / (gSize - 1)) * 2 - 1;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const alpha = Math.max(0, 1 - dist * dist) * 0.6;
        const idx = (y * gSize + x) * 4;
        gData[idx]     = Math.round(gColor.r * 255);
        gData[idx + 1] = Math.round(gColor.g * 255);
        gData[idx + 2] = Math.round(gColor.b * 255);
        gData[idx + 3] = Math.round(alpha * 255);
      }
    }
    const gTex = new THREE.DataTexture(gData, gSize, gSize, THREE.RGBAFormat);
    gTex.magFilter = THREE.LinearFilter;
    gTex.minFilter = THREE.LinearFilter;
    gTex.needsUpdate = true;

    const groundGeo = new THREE.PlaneGeometry(8, 8);
    const groundMat = new THREE.MeshBasicMaterial({
      map: gTex,
      transparent: true,
      depthWrite: false,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    scene.add(ground);
  }

  // Pivot group — model gets added here so we can spin it
  const pivot = new THREE.Group();
  scene.add(pivot);

  const camera = new THREE.PerspectiveCamera(cameraFov, 1, 0.1, 100);
  camera.position.set(0, cameraHeight, cameraDistance);
  camera.lookAt(0, lookAtHeight, 0);

  const fileBuffer = readFileSync(modelPath);
  const arrayBuffer = fileBuffer.buffer.slice(
    fileBuffer.byteOffset,
    fileBuffer.byteOffset + fileBuffer.byteLength,
  );

  const loader = new GLTFLoader();

  const ready = new Promise<void>((resolvePromise, reject) => {
    loader.parse(
      arrayBuffer,
      "",
      (gltf) => {
        const model = gltf.scene;
        let meshCount = 0;
        model.traverse((c) => { if (c instanceof THREE.Mesh) meshCount++; });
        log(`[gltf] ${meshCount} meshes`);

        convertToDataTextures(model);
        swapToBasicMaterials(model);

        // Per-model brightness / tint adjustment
        if (brightness !== 1.0 || tint != null) {
          const tintColor = tint != null ? new THREE.Color(tint) : null;
          model.traverse((child) => {
            if (!(child instanceof THREE.Mesh)) return;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            for (const mat of mats) {
              if (mat.color) {
                if (brightness !== 1.0) {
                  mat.color.multiplyScalar(brightness);
                }
                if (tintColor) {
                  mat.color.lerp(tintColor, 0.3);
                }
              }
            }
          });
        }

        mergeModelMeshes(model);

        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const scale = targetHeight / size.y;
        model.scale.setScalar(scale);

        box.setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.x -= center.x;
        model.position.z -= center.z;
        model.position.y -= box.min.y - yOffset;

        pivot.add(model);

        if (DEBUG) {
          try {
            writeFileSync(
              resolve(import.meta.dir, "glb-loader-debug.log"),
              debugLog.join("\n") + "\n",
            );
          } catch {}
        }

        resolvePromise();
      },
      (error) => reject(error),
    );
  });

  const update = (time: number, rotationOffset = 0) => {
    pivot.rotation.y = time * orbitSpeed + rotationOffset;
  };

  return { scene, camera, update, ready };
}
