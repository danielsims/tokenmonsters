/**
 * Main orchestration — model picker, API calls, save flow.
 */
import { createEditor } from "./editor.js";
import { createHdPreview, createPixelPreview } from "./preview.js";

// ── DOM refs ──
const formSelect = document.getElementById("form-select");
const textureSelect = document.getElementById("texture-select");
const saveBtn = document.getElementById("save-btn");
const loadingEl = document.getElementById("loading");
const colorPicker = document.getElementById("color-picker");
const swatchesEl = document.getElementById("swatches");
const undoBtn = document.getElementById("undo-btn");
const redoBtn = document.getElementById("redo-btn");

// ── State ──
let currentForm = "";
let currentTextureIndex = 0;
let texturesData = [];
let recentColors = [];
let liveUpdateTimer = null;

// ── Init editor ──
const editor = createEditor(
  document.getElementById("canvas-wrap"),
  document.getElementById("editor-canvas"),
  {
    onColorPick(hex) {
      colorPicker.value = hex;
      addRecentColor(hex);
    },
    onDirty() {
      saveBtn.disabled = !editor.isDirty();
      scheduleLiveUpdate();
    },
  }
);

// ── Init previews ──
const hdPreview = createHdPreview(document.getElementById("hd-canvas"));
const pixelPreview = createPixelPreview(document.getElementById("pixel-canvas"));

// Resize on window resize
window.addEventListener("resize", () => {
  hdPreview.resize();
  pixelPreview.resize();
  editor.render();
});

// ── Brush size buttons ──
document.querySelectorAll("[data-brush]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-brush]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    editor.setBrushSize(parseInt(btn.dataset.brush, 10));
  });
});

// ── Color picker ──
colorPicker.addEventListener("input", () => {
  const hex = colorPicker.value;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  editor.setBrushColor(r, g, b);
  addRecentColor(hex);
});

function addRecentColor(hex) {
  recentColors = recentColors.filter((c) => c !== hex);
  recentColors.unshift(hex);
  if (recentColors.length > 8) recentColors.length = 8;
  renderSwatches();
}

function renderSwatches() {
  swatchesEl.innerHTML = "";
  for (const hex of recentColors) {
    const el = document.createElement("div");
    el.className = "swatch";
    el.style.backgroundColor = hex;
    el.title = hex;
    el.addEventListener("click", () => {
      colorPicker.value = hex;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      editor.setBrushColor(r, g, b);
    });
    swatchesEl.appendChild(el);
  }
}

// ── Undo/Redo buttons ──
undoBtn.addEventListener("click", () => editor.undo());
redoBtn.addEventListener("click", () => editor.redo());

// ── Live texture update ──
function syncTextureUpdate() {
  const imgData = editor.getImageData();
  if (imgData) {
    hdPreview.updateTextureData(currentTextureIndex, imgData);
  }
}

function scheduleLiveUpdate() {
  // Sync update for HD preview (instant feedback)
  syncTextureUpdate();
  // Debounced update for terminal preview (heavier, less urgent)
  if (liveUpdateTimer) clearTimeout(liveUpdateTimer);
  liveUpdateTimer = setTimeout(() => {
    const dataUrl = editor.getImageDataUrl();
    if (dataUrl) {
      pixelPreview.updateTexture(currentTextureIndex, dataUrl);
    }
  }, 150);
}

// ── Paint lock toggle ──
const paintLockBtn = document.getElementById("paint-lock-btn");
let paintLocked = false;

paintLockBtn.addEventListener("click", () => {
  paintLocked = !paintLocked;
  hdPreview.setPaintLocked(paintLocked);
  paintLockBtn.textContent = paintLocked ? "Paint: On" : "Paint: Off";
  paintLockBtn.classList.toggle("active", paintLocked);
});

// ── 3D model painting via raycasting ──
hdPreview.enablePainting((u, v, action) => {
  if (action === "sample") {
    editor.sampleAtUV(u, v);
  } else if (action === "paint-start") {
    editor.beginStroke();
    editor.paintAtUV(u, v);
  } else if (action === "paint") {
    editor.paintAtUV(u, v);
  } else if (action === "paint-end") {
    editor.endStroke();
  }
});

// ── Model loading ──

async function loadFormList() {
  const resp = await fetch("/api/models");
  const forms = await resp.json();
  let config = {};
  try {
    const configResp = await fetch("/api/config");
    config = await configResp.json();
  } catch {}

  formSelect.innerHTML = '<option value="">Form...</option>';
  for (const f of forms) {
    const opt = document.createElement("option");
    opt.value = f.name;
    opt.textContent = f.name;
    formSelect.appendChild(opt);
  }

  formSelect.addEventListener("change", async () => {
    currentForm = formSelect.value;
    if (!currentForm) return;

    textureSelect.innerHTML = '<option value="">Loading...</option>';
    textureSelect.disabled = true;
    saveBtn.disabled = true;
    loadingEl.classList.remove("hidden");
    loadingEl.textContent = "Loading textures...";

    try {
      const bg = config[currentForm]?.background || "27272a";

      // Init previews with background
      hdPreview.init(bg);
      pixelPreview.init(bg);

      // Load model into both previews
      const glbUrl = "/models/" + currentForm + ".glb";
      await hdPreview.loadModel(glbUrl);
      await pixelPreview.loadModel(glbUrl);

      // Resize after load
      hdPreview.resize();
      pixelPreview.resize();

      // Extract textures
      const resp = await fetch("/api/textures/" + currentForm);
      texturesData = await resp.json();

      textureSelect.innerHTML = "";
      textureSelect.disabled = false;
      for (const tex of texturesData) {
        const opt = document.createElement("option");
        opt.value = tex.index;
        opt.textContent = "Texture " + tex.index + " (" + tex.width + "x" + tex.height + ")";
        textureSelect.appendChild(opt);
      }

      // Auto-load first texture
      if (texturesData.length > 0) {
        currentTextureIndex = 0;
        await loadTextureIntoEditor(texturesData[0]);
      }
    } catch (err) {
      loadingEl.textContent = "Error: " + err.message;
    }
  });

  textureSelect.addEventListener("change", async () => {
    const idx = parseInt(textureSelect.value, 10);
    const tex = texturesData.find((t) => t.index === idx);
    if (tex) {
      currentTextureIndex = idx;
      await loadTextureIntoEditor(tex);
    }
  });
}

async function loadTextureIntoEditor(tex) {
  loadingEl.classList.remove("hidden");
  loadingEl.textContent = "Loading texture " + tex.index + "...";
  await editor.loadTexture(tex.dataUrl);
  loadingEl.classList.add("hidden");
  saveBtn.disabled = true; // fresh load, not dirty yet
}

// ── Save flow ──

saveBtn.addEventListener("click", () => showSaveModal());

function showSaveModal() {
  const modal = document.getElementById("save-modal");
  const originalUrl = editor.getOriginalDataUrl();
  const editedUrl = editor.getImageDataUrl();

  if (!originalUrl || !editedUrl) return;

  modal.classList.remove("hidden");
  modal.innerHTML = "";

  const box = document.createElement("div");
  box.className = "modal";

  box.innerHTML = '<h2>Save Texture</h2>';

  // Compare
  const compare = document.createElement("div");
  compare.className = "modal-compare";

  // Original
  const origDiv = document.createElement("div");
  origDiv.innerHTML = "<label>Original</label>";
  const origCanvas = document.createElement("canvas");
  drawPreviewThumb(origCanvas, originalUrl);
  origDiv.appendChild(origCanvas);
  compare.appendChild(origDiv);

  // Edited
  const editDiv = document.createElement("div");
  editDiv.innerHTML = "<label>Edited</label>";
  const editCanvas = document.createElement("canvas");
  drawPreviewThumb(editCanvas, editedUrl);
  editDiv.appendChild(editCanvas);
  compare.appendChild(editDiv);

  box.appendChild(compare);

  const info = document.createElement("div");
  info.style.cssText = "font-size:11px;color:#71717a;margin-bottom:16px;";
  info.textContent = currentForm + ".glb — texture " + currentTextureIndex;
  box.appendChild(info);

  // Buttons
  const btns = document.createElement("div");
  btns.className = "modal-buttons";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "toolbar-btn";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", () => modal.classList.add("hidden"));

  const confirmBtn = document.createElement("button");
  confirmBtn.className = "toolbar-btn primary";
  confirmBtn.textContent = "Save & Backup";
  confirmBtn.addEventListener("click", () => doSave(confirmBtn));

  btns.appendChild(cancelBtn);
  btns.appendChild(confirmBtn);
  box.appendChild(btns);

  modal.appendChild(box);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });
}

function drawPreviewThumb(canvas, dataUrl) {
  const img = new Image();
  img.onload = () => {
    const scale = Math.min(240 / img.width, 240 / img.height, 4);
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    canvas.style.width = canvas.width + "px";
    canvas.style.height = canvas.height + "px";
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  };
  img.src = dataUrl;
}

async function doSave(btn) {
  btn.textContent = "Saving...";
  btn.disabled = true;

  try {
    const imageData = editor.getImageDataUrl();
    const resp = await fetch("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        form: currentForm,
        textureIndex: currentTextureIndex,
        imageData,
      }),
    });

    const result = await resp.json();
    document.getElementById("save-modal").classList.add("hidden");

    if (result.ok) {
      showToast("Saved. Backup at " + result.backup);

      // Reload model in previews to confirm
      const glbUrl = "/models/" + currentForm + ".glb?t=" + Date.now();
      await hdPreview.loadModel(glbUrl);
      await pixelPreview.loadModel(glbUrl);
      saveBtn.disabled = true;
    } else {
      showToast("Error: " + (result.error || "Save failed"));
    }
  } catch (err) {
    document.getElementById("save-modal").classList.add("hidden");
    showToast("Error: " + err.message);
  }
}

function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 4000);
}

// ── Init ──
loadFormList();
