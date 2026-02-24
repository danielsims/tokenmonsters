/**
 * Three.js dual preview — HD + terminal-pixelated.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const loader = new GLTFLoader();

// ── Shared scene setup ──

function createScene(canvas, bgColor) {
  const rect = canvas.parentElement.getBoundingClientRect();
  const w = Math.floor(rect.width) || 340;
  const h = Math.floor(rect.height) || 400;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(w, h, false);
  renderer.setClearColor(parseInt(bgColor, 16));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const dir = new THREE.DirectionalLight(0xffffff, 1.0);
  dir.position.set(3, 5, 4);
  scene.add(dir);

  const camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 100);
  camera.position.set(0, 1, 3);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 2.0;

  return { renderer, scene, camera, controls, w, h };
}

function fitCamera(camera, controls, root) {
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const dist = maxDim / (2 * Math.tan((camera.fov * Math.PI) / 360));
  camera.position.set(center.x, center.y + maxDim * 0.3, center.z + dist * 1.4);
  controls.target.copy(center);
  camera.near = dist * 0.01;
  camera.far = dist * 20;
  camera.updateProjectionMatrix();
  controls.update();
}

function addBackground(scene, bgHex) {
  const base = new THREE.Color(parseInt(bgHex, 16));
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);

  const topColor = new THREE.Color().setHSL(hsl.h, hsl.s, Math.min(1, hsl.l * 1.3));
  const bottomColor = new THREE.Color().setHSL(hsl.h, hsl.s * 0.9, hsl.l * 0.5);

  const bgMat = new THREE.ShaderMaterial({
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uTopColor: { value: topColor },
      uBottomColor: { value: bottomColor },
    },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }",
    fragmentShader: "uniform vec3 uTopColor; uniform vec3 uBottomColor; varying vec2 vUv; void main() { gl_FragColor = vec4(mix(uBottomColor, uTopColor, vUv.y), 1.0); }",
  });
  const bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat);
  bgMesh.renderOrder = -1;
  bgMesh.frustumCulled = false;
  scene.add(bgMesh);

  // Ground disc
  const groundColor = new THREE.Color().setHSL(hsl.h, hsl.s * 0.8, hsl.l * 0.6);
  const groundMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uColor: { value: groundColor }, uRadius: { value: 4 } },
    vertexShader: "varying vec2 vPos; void main() { vPos = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform vec3 uColor; uniform float uRadius; varying vec2 vPos; void main() { float dist = length(vPos) / uRadius; float alpha = smoothstep(1.0, 0.3, dist) * 0.6; gl_FragColor = vec4(uColor, alpha); }",
  });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(4, 48), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  scene.add(ground);

  return { bgMat, groundMat, topColor, bottomColor, groundColor };
}

// ── HD Preview ──

export function createHdPreview(canvasEl) {
  let setup = null;
  let model = null;
  let textures = []; // tracked textures for live updates
  let bgHex = "27272a";
  let running = true;

  // Raycasting paint state
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let paintCallback = null;  // (u, v, button) => void
  let isPainting = false;
  let paintLocked = false;  // when true, left-click paints; when false, left-click orbits

  function init(newBgHex) {
    bgHex = newBgHex || bgHex;
    cleanup();
    setup = createScene(canvasEl, bgHex);

    setup.controls.mouseButtons = {
      LEFT: paintLocked ? null : THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    setup.controls.autoRotate = false;

    addBackground(setup.scene, bgHex);
    running = true;
    animate();
  }

  function loadModel(glbUrl) {
    return new Promise((resolve, reject) => {
      if (!setup) init(bgHex);
      // Remove old model
      if (model) { setup.scene.remove(model); model = null; }
      textures = [];

      loader.load(glbUrl, (gltf) => {
        model = gltf.scene;
        setup.scene.add(model);
        fitCamera(setup.camera, setup.controls, model);

        // Collect all textures for live update
        model.traverse((child) => {
          if (child.isMesh) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            for (const mat of mats) {
              if (mat.map && !textures.includes(mat.map)) textures.push(mat.map);
            }
          }
        });

        resolve(textures);
      }, undefined, reject);
    });
  }

  // Live-edit DataTexture per texture index
  const editTextures = new Map(); // textureIndex -> DataTexture

  function swapToDataTexture(textureIndex, imageData) {
    const origTex = textures[textureIndex];
    const data = new Uint8Array(imageData.data);
    const dataTex = new THREE.DataTexture(data, imageData.width, imageData.height, THREE.RGBAFormat, THREE.UnsignedByteType);
    dataTex.flipY = false;
    dataTex.wrapS = origTex.wrapS;
    dataTex.wrapT = origTex.wrapT;
    dataTex.colorSpace = origTex.colorSpace || THREE.SRGBColorSpace;
    dataTex.magFilter = origTex.magFilter;
    dataTex.minFilter = THREE.LinearFilter;
    dataTex.generateMipmaps = false;
    dataTex.needsUpdate = true;

    // Replace on every material
    model.traverse((child) => {
      if (!child.isMesh) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (mat.map === origTex) {
          mat.map = dataTex;
          mat.needsUpdate = true;
        }
      }
    });

    textures[textureIndex] = dataTex;
    editTextures.set(textureIndex, dataTex);
    return dataTex;
  }

  function updateTexture(textureIndex, dataUrl) {
    if (!textures[textureIndex]) return;
    const img = new Image();
    img.onload = () => {
      // Draw image to temp canvas to get ImageData
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, img.width, img.height);
      updateTextureData(textureIndex, imgData);
    };
    img.src = dataUrl;
  }

  function updateTextureData(textureIndex, imageData) {
    if (!textures[textureIndex]) return;
    let dataTex = editTextures.get(textureIndex);
    if (!dataTex) {
      dataTex = swapToDataTexture(textureIndex, imageData);
    } else {
      dataTex.image.data.set(new Uint8Array(imageData.data));
      dataTex.needsUpdate = true;
    }
  }

  function animate() {
    if (!running || !setup) return;
    requestAnimationFrame(animate);
    setup.controls.update();
    setup.renderer.render(setup.scene, setup.camera);
  }

  function resize() {
    if (!setup) return;
    const rect = canvasEl.parentElement.getBoundingClientRect();
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);
    if (w > 0 && h > 0) {
      setup.renderer.setSize(w, h, false);
      setup.camera.aspect = w / h;
      setup.camera.updateProjectionMatrix();
    }
  }

  // ── Raycasting paint on model ──

  function raycastUV(clientX, clientY) {
    if (!setup || !model) return null;
    const rect = canvasEl.getBoundingClientRect();
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, setup.camera);

    const meshes = [];
    model.traverse((child) => { if (child.isMesh) meshes.push(child); });
    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length > 0 && hits[0].uv) {
      return { u: hits[0].uv.x, v: hits[0].uv.y };
    }
    return null;
  }

  canvasEl.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !paintCallback || !paintLocked) return;
    const uv = raycastUV(e.clientX, e.clientY);
    if (!uv) return;
    isPainting = true;
    canvasEl.setPointerCapture(e.pointerId);
    paintCallback(uv.u, uv.v, e.altKey ? "sample" : "paint-start");
    e.preventDefault();
    e.stopPropagation();
  });

  canvasEl.addEventListener("pointermove", (e) => {
    if (!isPainting || !paintCallback) return;
    const uv = raycastUV(e.clientX, e.clientY);
    if (uv) paintCallback(uv.u, uv.v, e.altKey ? "sample" : "paint");
    e.stopPropagation();
  });

  canvasEl.addEventListener("pointerup", (e) => {
    if (!isPainting) return;
    isPainting = false;
    if (paintCallback) paintCallback(0, 0, "paint-end");
  });

  canvasEl.addEventListener("pointercancel", () => {
    if (!isPainting) return;
    isPainting = false;
    if (paintCallback) paintCallback(0, 0, "paint-end");
  });

  canvasEl.addEventListener("contextmenu", (e) => e.preventDefault());

  function enablePainting(callback) {
    paintCallback = callback;
  }

  function setPaintLocked(locked) {
    paintLocked = locked;
    canvasEl.style.cursor = locked ? "crosshair" : "grab";
    if (setup) {
      setup.controls.mouseButtons.LEFT = locked ? null : THREE.MOUSE.ROTATE;
    }
  }

  function cleanup() {
    running = false;
    if (setup) { setup.renderer.dispose(); setup = null; }
    model = null;
    textures = [];
    editTextures.clear();
    // Don't reset paintCallback — it's set once by main.js and should persist
    isPainting = false;
  }

  return { init, loadModel, updateTexture, updateTextureData, resize, cleanup, enablePainting, setPaintLocked };
}

// ── Terminal-Pixelated Preview ──

export function createPixelPreview(canvasEl) {
  let setup = null;
  let model = null;
  let bgHex = "27272a";
  let running = true;

  // Offscreen render target at low res
  const TERM_W = 80;
  const TERM_H = 40;
  let renderTarget = null;
  let offscreenPixels = null;

  // WebGL needs its own canvas — can't share with a 2D context
  let glCanvas = null;
  const ctx2d = canvasEl.getContext("2d");

  function init(newBgHex) {
    bgHex = newBgHex || bgHex;
    cleanup();

    // Create a hidden canvas for WebGL rendering
    glCanvas = document.createElement("canvas");
    glCanvas.style.display = "none";
    canvasEl.parentElement.appendChild(glCanvas);

    setup = createScene(glCanvas, bgHex);
    addBackground(setup.scene, bgHex);

    // Low-res render target
    renderTarget = new THREE.WebGLRenderTarget(TERM_W, TERM_H, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    offscreenPixels = new Uint8Array(TERM_W * TERM_H * 4);

    running = true;
    animate();
  }

  function loadModel(glbUrl, hdTextures) {
    return new Promise((resolve, reject) => {
      if (!setup) init(bgHex);
      if (model) { setup.scene.remove(model); model = null; }

      loader.load(glbUrl, (gltf) => {
        model = gltf.scene;
        setup.scene.add(model);
        fitCamera(setup.camera, setup.controls, model);
        resolve();
      }, undefined, reject);
    });
  }

  function updateTexture(textureIndex, dataUrl) {
    // Update textures on this model too
    if (!model) return;
    const textures = [];
    model.traverse((child) => {
      if (child.isMesh) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats) {
          if (mat.map && !textures.includes(mat.map)) textures.push(mat.map);
        }
      }
    });
    if (!textures[textureIndex]) return;
    const tex = textures[textureIndex];
    const img = new Image();
    img.onload = () => {
      tex.image = img;
      tex.needsUpdate = true;
    };
    img.src = dataUrl;
  }

  function animate() {
    if (!running || !setup) return;
    requestAnimationFrame(animate);
    setup.controls.update();

    // Render to low-res target for terminal simulation
    setup.renderer.setRenderTarget(renderTarget);
    setup.renderer.render(setup.scene, setup.camera);
    setup.renderer.setRenderTarget(null);

    // Read pixels and apply post-processing
    setup.renderer.readRenderTargetPixels(renderTarget, 0, 0, TERM_W, TERM_H, offscreenPixels);
    applyTerminalPostProcess(offscreenPixels);

    // Draw to the visible 2D canvas at pixelated scale
    const rect = canvasEl.parentElement.getBoundingClientRect();
    const dw = Math.floor(rect.width) || TERM_W;
    const dh = Math.floor(rect.height) || TERM_H;
    canvasEl.width = TERM_W;
    canvasEl.height = TERM_H;
    canvasEl.style.width = dw + "px";
    canvasEl.style.height = dh + "px";
    canvasEl.style.imageRendering = "pixelated";

    const imgData = new ImageData(new Uint8ClampedArray(offscreenPixels), TERM_W, TERM_H);
    // WebGL reads bottom-to-top, flip vertically
    const flipped = new ImageData(TERM_W, TERM_H);
    for (let y = 0; y < TERM_H; y++) {
      const srcRow = (TERM_H - 1 - y) * TERM_W * 4;
      const dstRow = y * TERM_W * 4;
      flipped.data.set(imgData.data.subarray(srcRow, srcRow + TERM_W * 4), dstRow);
    }
    ctx2d.putImageData(flipped, 0, 0);
  }

  function applyTerminalPostProcess(pixels) {
    // Simulate the optimize pipeline: contrast boost + gamma lift
    // Matches glb-loader.ts: contrast(0.12) + pow(0.78) gamma
    const contrastFactor = 0.12;
    const gamma = 0.78;

    for (let i = 0; i < pixels.length; i += 4) {
      // Contrast
      let r = pixels[i] / 255;
      let g = pixels[i + 1] / 255;
      let b = pixels[i + 2] / 255;

      r = Math.max(0, Math.min(1, (r - 0.5) * (1 + contrastFactor) + 0.5));
      g = Math.max(0, Math.min(1, (g - 0.5) * (1 + contrastFactor) + 0.5));
      b = Math.max(0, Math.min(1, (b - 0.5) * (1 + contrastFactor) + 0.5));

      // Gamma lift
      r = Math.pow(r, gamma);
      g = Math.pow(g, gamma);
      b = Math.pow(b, gamma);

      pixels[i] = Math.round(r * 255);
      pixels[i + 1] = Math.round(g * 255);
      pixels[i + 2] = Math.round(b * 255);
    }
  }

  function resize() {
    if (!setup) return;
    const rect = canvasEl.parentElement.getBoundingClientRect();
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);
    if (w > 0 && h > 0) {
      setup.renderer.setSize(w, h, false);
      setup.camera.aspect = w / h;
      setup.camera.updateProjectionMatrix();
    }
  }

  function cleanup() {
    running = false;
    if (renderTarget) { renderTarget.dispose(); renderTarget = null; }
    if (setup) { setup.renderer.dispose(); setup = null; }
    if (glCanvas) { glCanvas.remove(); glCanvas = null; }
    model = null;
  }

  return { init, loadModel, updateTexture, resize, cleanup };
}
