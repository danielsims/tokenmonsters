import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SPLITS = [0, 1, 2];
const TIERS = [
  { key: "high", label: "High (2048px)", suffix: "_high" },
  { key: "med",  label: "Medium (1024px)", suffix: "_med" },
  { key: "low",  label: "Low (512px)", suffix: "_low" },
];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const loader = new GLTFLoader();
const viewports = [];
let selectedVp = null;
let rotating = true;

const content = document.getElementById("content");
const selBar = document.getElementById("selection-bar");
const selName = document.getElementById("sel-name");
const selStats = document.getElementById("sel-stats");
const selConfirm = document.getElementById("sel-confirm");
const pauseBtn = document.getElementById("pause-btn");
const openBtn = document.getElementById("open-btn");

// ---------------------------------------------------------------------------
// Pause / Play
// ---------------------------------------------------------------------------

pauseBtn.addEventListener("click", () => {
  rotating = !rotating;
  for (const vp of viewports) {
    vp.controls.autoRotate = rotating;
  }
  pauseBtn.innerHTML = rotating
    ? '<span class="icon">||</span> Pause'
    : '<span class="icon">&#9654;</span> Play';
});

// ---------------------------------------------------------------------------
// Open Model (file picker)
// ---------------------------------------------------------------------------

const fileInput = document.createElement("input");
fileInput.type = "file";
fileInput.accept = ".glb";
fileInput.style.display = "none";
document.body.appendChild(fileInput);

openBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file || !file.name.toLowerCase().endsWith(".glb")) return;

  // Show processing state
  content.innerHTML = "";
  viewports.length = 0;
  selectedVp = null;
  selBar.classList.remove("visible");

  const status = document.createElement("p");
  status.style.cssText = "text-align:center;color:#71717a;font-size:13px;padding:40px 0;";
  status.textContent = "Processing " + file.name + "...";
  content.appendChild(status);

  openBtn.disabled = true;
  openBtn.style.opacity = "0.5";
  openBtn.textContent = "Processing...";

  try {
    // Upload file to server for split + optimize
    const buf = await file.arrayBuffer();
    const resp = await fetch("/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", "X-Filename": file.name },
      body: buf,
    });
    const result = await resp.json();

    if (!resp.ok || !result.ok) {
      status.textContent = "Error: " + (result.error || "Processing failed");
      status.style.color = "#ef4444";
      return;
    }

    // Clear and show results as grid: rows = splits, columns = quality tiers
    content.innerHTML = "";

    const tierLabels = ["High (2048px)", "Medium (1024px)", "Low (512px)"];
    const headerRow = document.createElement("div");
    headerRow.className = "tier-headers";
    for (const label of tierLabels) {
      const h = document.createElement("div");
      h.className = "tier-header";
      h.textContent = label;
      headerRow.appendChild(h);
    }
    content.appendChild(headerRow);

    for (let splitIdx = 0; splitIdx < result.results.length; splitIdx++) {
      const { tiers: tierFiles } = result.results[splitIdx];
      const row = document.createElement("div");
      row.className = "split-row";

      const label = document.createElement("div");
      label.className = "row-label";
      label.textContent = "Split " + splitIdx;
      row.appendChild(label);

      for (const tierFile of (tierFiles || [])) {
        const displayLabel = tierFile.replace(/\.glb$/i, "");
        const url = "/out/" + tierFile;
        const vp = createViewport(displayLabel, tierFile, row);

        try {
          const headResp = await fetch(url, { method: "HEAD" });
          if (headResp.ok) {
            const size = parseInt(headResp.headers.get("content-length") || "0", 10) || null;
            loadModel(vp, url, size);
          } else {
            vp.statsEl.innerHTML = "<span style='color:#3f3f46'>not found</span>";
            vp.el.style.opacity = "0.3";
          }
        } catch {
          vp.statsEl.innerHTML = "<span style='color:#3f3f46'>error</span>";
          vp.el.style.opacity = "0.3";
        }
      }

      content.appendChild(row);
    }
  } catch (err) {
    status.textContent = "Error: " + String(err);
    status.style.color = "#ef4444";
  } finally {
    openBtn.disabled = false;
    openBtn.style.opacity = "1";
    openBtn.textContent = "Open Model";
    fileInput.value = "";
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(n) {
  return n.toLocaleString();
}

function formatBytes(bytes) {
  if (bytes == null || bytes === 0) return "?";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function countGeometry(root) {
  let vertices = 0;
  let triangles = 0;
  root.traverse((child) => {
    if (child.isMesh && child.geometry) {
      const geo = child.geometry;
      const pos = geo.getAttribute("position");
      if (pos) vertices += pos.count;
      if (geo.index) {
        triangles += geo.index.count / 3;
      } else if (pos) {
        triangles += pos.count / 3;
      }
    }
  });
  return { vertices, triangles: Math.floor(triangles) };
}

// ---------------------------------------------------------------------------
// Viewport creation
// ---------------------------------------------------------------------------

function createViewport(label, sourceFile, parentEl) {
  const el = document.createElement("div");
  el.className = "viewport";

  const canvas = document.createElement("canvas");
  const width = 320;
  const height = 240;
  canvas.width = width * window.devicePixelRatio;
  canvas.height = height * window.devicePixelRatio;
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";
  el.appendChild(canvas);

  const statsEl = document.createElement("div");
  statsEl.className = "viewport-stats";
  statsEl.innerHTML = "<span>loading...</span>";
  el.appendChild(statsEl);

  parentEl.appendChild(el);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(width, height, false);
  renderer.setClearColor(0x27272a);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const dir = new THREE.DirectionalLight(0xffffff, 1.0);
  dir.position.set(3, 5, 4);
  scene.add(dir);

  const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 100);
  camera.position.set(0, 1, 3);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotate = rotating;
  controls.autoRotateSpeed = 2.0;

  const vp = { label, sourceFile, loadUrl: null, renderer, scene, camera, controls, statsEl, el, fileSize: null };
  viewports.push(vp);

  // Click to select
  el.addEventListener("click", (e) => {
    if (e.detail === 0) return;
    selectViewport(vp);
  });

  return vp;
}

function selectViewport(vp) {
  if (selectedVp) {
    selectedVp.el.classList.remove("selected");
  }
  selectedVp = vp;
  vp.el.classList.add("selected");

  selName.textContent = vp.label;
  selStats.textContent = vp.fileSize ? " (" + formatBytes(vp.fileSize) + ")" : "";
  selBar.classList.add("visible");
}

// ---------------------------------------------------------------------------
// Form names (mirrors src/models/species.ts evolution forms)
// ---------------------------------------------------------------------------

const FORMS = [
  "dim-egg", "flicker", "luminos", "phosphor",
  "jagged-egg", "bytepup", "bytesnap", "bytewrath",
  "hollow-egg", "slink", "cachefang",
  "fizzing-egg", "fry", "volteel", "ampstorm",
  "absent-egg", "segfault", "voidmaw", "nullvoid",
  "qwerty-egg", "qwerty", "daemon",
  "dense-egg", "megabyte", "gigabyte",
  "molting-egg", "pinchy", "viceclaw", "gigaclaw",
];

// ---------------------------------------------------------------------------
// Confirm flow — modal with species + form selection
// ---------------------------------------------------------------------------

selConfirm.addEventListener("click", () => {
  if (!selectedVp) return;
  showFinalizeModal(selectedVp);
});

const selectStyle = "width:100%;padding:8px 10px;background:#18181b;border:1px solid #3f3f46;border-radius:4px;color:#d4d4d8;font-family:inherit;font-size:13px;outline:none;appearance:none;cursor:pointer;";

// ---------------------------------------------------------------------------
// Finalize modal — side-by-side: settings left, live preview right
// ---------------------------------------------------------------------------

let previewCleanup = null; // track preview render loop + renderer

function showFinalizeModal(vp) {
  const existing = document.getElementById("finalize-modal");
  if (existing) existing.remove();
  if (previewCleanup) { previewCleanup(); previewCleanup = null; }

  // ── Overlay ──
  const overlay = document.createElement("div");
  overlay.id = "finalize-modal";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(9,9,11,0.88);z-index:200;display:flex;align-items:center;justify-content:center;";

  // ── Modal container — wide, side-by-side ──
  const modal = document.createElement("div");
  modal.style.cssText = "background:#18181b;border:1px solid #27272a;border-radius:8px;display:flex;width:780px;max-height:90vh;overflow:hidden;";

  // ── Left panel: settings ──
  const left = document.createElement("div");
  left.style.cssText = "width:320px;padding:24px;border-right:1px solid #27272a;overflow-y:auto;flex-shrink:0;";

  const title = document.createElement("div");
  title.style.cssText = "font-size:14px;font-weight:600;color:#d4d4d8;margin-bottom:4px;";
  title.textContent = "Finalize Model";
  left.appendChild(title);

  const sub = document.createElement("div");
  sub.style.cssText = "font-size:11px;color:#52525b;margin-bottom:16px;";
  sub.textContent = "Configure and preview before saving.";
  left.appendChild(sub);

  // File info
  const fileInfo = document.createElement("div");
  fileInfo.style.cssText = "font-size:11px;color:#71717a;margin-bottom:16px;padding:8px 10px;background:#09090b;border-radius:4px;border:1px solid #27272a;";
  fileInfo.textContent = vp.sourceFile + (vp.fileSize ? " (" + formatBytes(vp.fileSize) + ")" : "");
  left.appendChild(fileInfo);

  // Form
  const formLabel = document.createElement("label");
  formLabel.style.cssText = "font-size:12px;color:#a1a1aa;display:block;margin-bottom:6px;";
  formLabel.textContent = "Form";
  left.appendChild(formLabel);

  const formSelect = document.createElement("select");
  formSelect.style.cssText = selectStyle + "margin-bottom:14px;";
  const formDefault = document.createElement("option");
  formDefault.value = "";
  formDefault.textContent = "Choose form...";
  formDefault.disabled = true;
  formDefault.selected = true;
  formSelect.appendChild(formDefault);
  for (const f of FORMS) {
    const opt = document.createElement("option");
    opt.value = f;
    opt.textContent = f;
    formSelect.appendChild(opt);
  }
  left.appendChild(formSelect);

  let formConfig = null; // cached config

  // Load config once on modal open
  (async () => {
    try {
      const configResp = await fetch("/api/config");
      formConfig = await configResp.json();
    } catch {}
  })();

  // When a form is selected, apply its background if it has one
  formSelect.addEventListener("change", () => {
    if (!formConfig) return;
    const fm = formSelect.value;
    const bg = formConfig[fm]?.background;
    if (bg) {
      const hex = String(bg).replace("#", "");
      colorPicker.value = "#" + hex.padStart(6, "0");
      colorHex.value = hex.padStart(6, "0");
      applyColor(hex.padStart(6, "0"));
    }
  });

  // Background color
  const colorLabel = document.createElement("label");
  colorLabel.style.cssText = "font-size:12px;color:#a1a1aa;display:block;margin-bottom:6px;";
  colorLabel.textContent = "Background";
  left.appendChild(colorLabel);

  const colorRow = document.createElement("div");
  colorRow.style.cssText = "display:flex;gap:8px;align-items:center;margin-bottom:14px;";

  const colorPicker = document.createElement("input");
  colorPicker.type = "color";
  colorPicker.value = "#2a3a5c";
  colorPicker.style.cssText = "width:40px;height:32px;border:1px solid #3f3f46;border-radius:4px;background:#18181b;cursor:pointer;padding:2px;";
  colorRow.appendChild(colorPicker);

  const colorHex = document.createElement("input");
  colorHex.type = "text";
  colorHex.value = "2a3a5c";
  colorHex.maxLength = 6;
  colorHex.style.cssText = "flex:1;padding:8px 10px;background:#18181b;border:1px solid #3f3f46;border-radius:4px;color:#d4d4d8;font-family:inherit;font-size:13px;outline:none;";
  colorRow.appendChild(colorHex);

  left.appendChild(colorRow);

  // Preview path
  const pathPreview = document.createElement("div");
  pathPreview.style.cssText = "font-size:10px;color:#52525b;margin-bottom:18px;min-height:14px;";
  left.appendChild(pathPreview);

  function updatePathPreview() {
    const fm = formSelect.value;
    if (fm) {
      pathPreview.textContent = "src/three/models/" + fm + ".glb";
      pathPreview.style.color = "#71717a";
    } else {
      pathPreview.textContent = "";
    }
  }
  formSelect.addEventListener("change", updatePathPreview);

  // Error
  const errorEl = document.createElement("div");
  errorEl.style.cssText = "font-size:11px;color:#ef4444;margin-bottom:12px;display:none;";
  left.appendChild(errorEl);

  // Buttons
  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;gap:8px;justify-content:flex-end;";

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "Cancel";
  cancelBtn.style.cssText = "background:#27272a;color:#a1a1aa;border:1px solid #3f3f46;border-radius:4px;padding:8px 16px;font-family:inherit;font-size:12px;cursor:pointer;";
  cancelBtn.addEventListener("click", closeModal);

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "Save to Game";
  saveBtn.style.cssText = "background:#fafafa;color:#18181b;border:none;border-radius:4px;padding:8px 16px;font-family:inherit;font-size:12px;font-weight:600;cursor:pointer;";

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(saveBtn);
  left.appendChild(btnRow);

  modal.appendChild(left);

  // ── Right panel: live 3D preview ──
  const right = document.createElement("div");
  right.style.cssText = "flex:1;display:flex;flex-direction:column;background:#09090b;";

  const previewCanvas = document.createElement("canvas");
  const pw = 460;
  const ph = 460;
  previewCanvas.width = pw * window.devicePixelRatio;
  previewCanvas.height = ph * window.devicePixelRatio;
  previewCanvas.style.cssText = "width:100%;height:100%;display:block;";
  right.appendChild(previewCanvas);

  modal.appendChild(right);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // ── Set up preview Three.js scene ──
  const pRenderer = new THREE.WebGLRenderer({ canvas: previewCanvas, antialias: true });
  pRenderer.setPixelRatio(window.devicePixelRatio);
  pRenderer.setSize(pw, ph, false);
  pRenderer.setClearColor(0x2a3a5c);
  pRenderer.outputColorSpace = THREE.SRGBColorSpace;

  const pScene = new THREE.Scene();
  pScene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const pDir = new THREE.DirectionalLight(0xffffff, 1.0);
  pDir.position.set(3, 5, 4);
  pScene.add(pDir);

  const pCamera = new THREE.PerspectiveCamera(45, pw / ph, 0.01, 100);
  pCamera.position.set(0, 1, 3);

  const pControls = new OrbitControls(pCamera, previewCanvas);
  pControls.enableDamping = true;
  pControls.dampingFactor = 0.08;
  pControls.autoRotate = true;
  pControls.autoRotateSpeed = 2.0;

  // Gradient background — matches the game's loadGlbTestScene
  const bgGeo = new THREE.PlaneGeometry(2, 2);
  const bgTopColor = new THREE.Color(0x374d78);
  const bgBottomColor = new THREE.Color(0x151e2e);
  const bgShaderMat = new THREE.ShaderMaterial({
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uTopColor: { value: bgTopColor },
      uBottomColor: { value: bgBottomColor },
    },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }",
    fragmentShader: "uniform vec3 uTopColor; uniform vec3 uBottomColor; varying vec2 vUv; void main() { gl_FragColor = vec4(mix(uBottomColor, uTopColor, vUv.y), 1.0); }",
  });
  const bgMesh = new THREE.Mesh(bgGeo, bgShaderMat);
  bgMesh.renderOrder = -1;
  bgMesh.frustumCulled = false;
  pScene.add(bgMesh);

  // Ground disc with soft radial fade — matches the game
  const groundRadius = 4;
  const groundGeo = new THREE.CircleGeometry(groundRadius, 48);
  const groundColorObj = new THREE.Color(0x223049);
  const groundShaderMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uColor: { value: groundColorObj },
      uRadius: { value: groundRadius },
    },
    vertexShader: "varying vec2 vPos; void main() { vPos = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform vec3 uColor; uniform float uRadius; varying vec2 vPos; void main() { float dist = length(vPos) / uRadius; float alpha = smoothstep(1.0, 0.3, dist) * 0.6; gl_FragColor = vec4(uColor, alpha); }",
  });
  const ground = new THREE.Mesh(groundGeo, groundShaderMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  pScene.add(ground);

  // Load the selected model into the preview
  const previewUrl = vp.loadUrl || ("/" + vp.sourceFile);
  loader.load(previewUrl, (gltf) => {
    pScene.add(gltf.scene);
    // Fit camera like the game does
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = maxDim / (2 * Math.tan((pCamera.fov * Math.PI) / 360));
    pCamera.position.set(center.x, center.y + maxDim * 0.3, center.z + dist * 1.4);
    pControls.target.copy(center);
    pCamera.near = dist * 0.01;
    pCamera.far = dist * 20;
    pCamera.updateProjectionMatrix();
    pControls.update();
  });

  // Preview render loop
  let previewRunning = true;
  function previewAnimate() {
    if (!previewRunning) return;
    requestAnimationFrame(previewAnimate);
    pControls.update();
    pRenderer.render(pScene, pCamera);
  }
  previewAnimate();

  // ── Live color updates — derive gradient + ground from one color ──
  function applyColor(hex) {
    const base = new THREE.Color(parseInt(hex, 16));
    const hsl = { h: 0, s: 0, l: 0 };
    base.getHSL(hsl);

    // Gradient: top = lighter, bottom = darker
    bgTopColor.setHSL(hsl.h, hsl.s, Math.min(1, hsl.l * 1.3));
    bgBottomColor.setHSL(hsl.h, hsl.s * 0.9, hsl.l * 0.5);
    pRenderer.setClearColor(base); // fallback

    // Ground: slightly darker
    groundColorObj.setHSL(hsl.h, hsl.s * 0.8, hsl.l * 0.6);
  }

  colorPicker.addEventListener("input", () => {
    const hex = colorPicker.value.replace("#", "");
    colorHex.value = hex;
    applyColor(hex);
  });

  colorHex.addEventListener("input", () => {
    const hex = colorHex.value.replace("#", "");
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      colorPicker.value = "#" + hex;
      applyColor(hex);
    }
  });

  // ── Cleanup ──
  function closeModal() {
    previewRunning = false;
    pRenderer.dispose();
    previewCleanup = null;
    overlay.remove();
  }

  previewCleanup = closeModal;

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });

  cancelBtn.addEventListener("click", closeModal);

  // ── Save handler ──
  saveBtn.addEventListener("click", async () => {
    const formName = formSelect.value;
    const bgHex = colorHex.value.replace("#", "");

    if (!formName) {
      errorEl.textContent = "Please select a form.";
      errorEl.style.display = "block";
      return;
    }

    saveBtn.textContent = "Saving...";
    saveBtn.style.opacity = "0.6";
    saveBtn.disabled = true;
    errorEl.style.display = "none";

    try {
      const resp = await fetch("/api/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceFile: vp.sourceFile,
          formName,
          background: bgHex,
        }),
      });

      const result = await resp.json();

      if (!resp.ok || !result.ok) {
        errorEl.textContent = result.error || "Something went wrong.";
        errorEl.style.display = "block";
        saveBtn.textContent = "Save to Game";
        saveBtn.style.opacity = "1";
        saveBtn.disabled = false;
        return;
      }

      // Success — replace left panel content
      left.innerHTML = "";
      left.style.cssText += "display:flex;flex-direction:column;align-items:center;justify-content:center;";

      const check = document.createElement("div");
      check.style.cssText = "font-size:28px;margin-bottom:8px;color:#d4d4d8;";
      check.textContent = "\u2713";
      left.appendChild(check);

      const msg = document.createElement("div");
      msg.style.cssText = "font-size:13px;color:#d4d4d8;margin-bottom:4px;font-weight:600;";
      msg.textContent = formName + ".glb saved";
      left.appendChild(msg);

      const pathEl = document.createElement("div");
      pathEl.style.cssText = "font-size:11px;color:#52525b;margin-bottom:4px;text-align:center;word-break:break-all;";
      pathEl.textContent = result.relPath;
      left.appendChild(pathEl);

      const configNote = document.createElement("div");
      configNote.style.cssText = "font-size:11px;color:#52525b;margin-bottom:16px;";
      configNote.textContent = "config.json: bg #" + bgHex;
      left.appendChild(configNote);

      const doneBtn = document.createElement("button");
      doneBtn.textContent = "Done";
      doneBtn.style.cssText = "background:#27272a;color:#a1a1aa;border:1px solid #3f3f46;border-radius:4px;padding:8px 24px;font-family:inherit;font-size:12px;cursor:pointer;";
      doneBtn.addEventListener("click", closeModal);
      left.appendChild(doneBtn);
    } catch (err) {
      errorEl.textContent = "Network error: " + String(err);
      errorEl.style.display = "block";
      saveBtn.textContent = "Save to Game";
      saveBtn.style.opacity = "1";
      saveBtn.disabled = false;
    }
  });
}

// ---------------------------------------------------------------------------
// Model loading
// ---------------------------------------------------------------------------

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

function loadModel(vp, url, fileSize) {
  vp.fileSize = fileSize;
  vp.loadUrl = url;
  loader.load(
    url,
    (gltf) => {
      vp.scene.add(gltf.scene);
      fitCamera(vp.camera, vp.controls, gltf.scene);

      const { vertices, triangles } = countGeometry(gltf.scene);
      let html = "<span>" + formatNumber(vertices) + " verts</span>";
      html += "<span>" + formatNumber(triangles) + " tris</span>";
      if (fileSize) html += "<span>" + formatBytes(fileSize) + "</span>";
      vp.statsEl.innerHTML = html;
    },
    undefined,
    () => {
      vp.statsEl.innerHTML = "<span style='color:#3f3f46'>not found</span>";
      vp.el.style.opacity = "0.3";
      vp.el.style.pointerEvents = "none";
    }
  );
}

// ---------------------------------------------------------------------------
// Build grid
// ---------------------------------------------------------------------------

async function buildGrid() {
  const headerRow = document.createElement("div");
  headerRow.className = "tier-headers";
  for (const tier of TIERS) {
    const h = document.createElement("div");
    h.className = "tier-header";
    h.textContent = tier.label;
    headerRow.appendChild(h);
  }
  content.appendChild(headerRow);

  for (const splitIdx of SPLITS) {
    const row = document.createElement("div");
    row.className = "split-row";

    const label = document.createElement("div");
    label.className = "row-label";
    label.textContent = "Split " + splitIdx;
    row.appendChild(label);

    for (const tier of TIERS) {
      const filename = "bytepup_" + splitIdx + tier.suffix + ".glb";
      const url = "/" + filename;
      const displayLabel = "split " + splitIdx + " / " + tier.key;

      const vp = createViewport(displayLabel, filename, row);

      try {
        const resp = await fetch(url, { method: "HEAD" });
        if (resp.ok) {
          const size = parseInt(resp.headers.get("content-length") || "0", 10) || null;
          loadModel(vp, url, size);
        } else {
          vp.statsEl.innerHTML = "<span style='color:#3f3f46'>not found</span>";
          vp.el.style.opacity = "0.3";
          vp.el.style.pointerEvents = "none";
        }
      } catch {
        vp.statsEl.innerHTML = "<span style='color:#3f3f46'>error</span>";
        vp.el.style.opacity = "0.3";
      }
    }

    content.appendChild(row);
  }
}

// ---------------------------------------------------------------------------
// Drag and drop
// ---------------------------------------------------------------------------

function setupDragDrop() {
  const overlay = document.getElementById("drop-overlay");
  let dragCounter = 0;

  window.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragCounter++;
    overlay.classList.add("active");
  });

  window.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      overlay.classList.remove("active");
    }
  });

  window.addEventListener("dragover", (e) => e.preventDefault());

  window.addEventListener("drop", (e) => {
    e.preventDefault();
    dragCounter = 0;
    overlay.classList.remove("active");

    const files = [...e.dataTransfer.files].filter((f) =>
      f.name.toLowerCase().endsWith(".glb")
    );
    if (files.length === 0) return;

    content.innerHTML = "";
    viewports.length = 0;
    selectedVp = null;
    selBar.classList.remove("visible");

    const row = document.createElement("div");
    row.className = "split-row";
    row.style.justifyContent = "center";

    files.slice(0, 6).forEach((file) => {
      const label = file.name.replace(/\.glb$/i, "");
      const vp = createViewport(label, file.name, row);
      const url = URL.createObjectURL(file);
      vp.fileSize = file.size;
      loader.load(url, (gltf) => {
        URL.revokeObjectURL(url);
        vp.scene.add(gltf.scene);
        fitCamera(vp.camera, vp.controls, gltf.scene);
        const { vertices, triangles } = countGeometry(gltf.scene);
        let html = "<span>" + formatNumber(vertices) + " verts</span>";
        html += "<span>" + formatNumber(triangles) + " tris</span>";
        html += "<span>" + formatBytes(file.size) + "</span>";
        vp.statsEl.innerHTML = html;
      });
    });

    content.appendChild(row);
  });
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------

function animate() {
  requestAnimationFrame(animate);
  for (const vp of viewports) {
    vp.controls.update();
    vp.renderer.render(vp.scene, vp.camera);
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

buildGrid();
setupDragDrop();
animate();
