/**
 * Pixel editor — zoom, brush, eyedropper, undo/redo, pan.
 *
 * Exports a single createEditor(canvasWrapEl, canvasEl) function
 * that returns an API for loading textures and getting pixel data.
 */

const MAX_UNDO = 50;

export function createEditor(wrapEl, canvasEl, { onColorPick, onDirty } = {}) {
  const ctx = canvasEl.getContext("2d", { willReadFrequently: true });

  // State
  let imgData = null;       // current ImageData (source of truth)
  let texWidth = 0;
  let texHeight = 0;
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let brushSize = 1;
  let brushColor = { r: 255, g: 0, b: 0, a: 255 };
  let painting = false;
  let panning = false;
  let panStartX = 0;
  let panStartY = 0;
  let panStartPanX = 0;
  let panStartPanY = 0;
  let spaceHeld = false;
  let altHeld = false;
  let dirty = false;

  // Undo/redo
  const undoStack = [];
  let undoIndex = -1;

  // ── Public API ──

  function loadTexture(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        texWidth = img.width;
        texHeight = img.height;

        // Draw to offscreen canvas to get ImageData
        const tmp = document.createElement("canvas");
        tmp.width = texWidth;
        tmp.height = texHeight;
        const tmpCtx = tmp.getContext("2d");
        tmpCtx.drawImage(img, 0, 0);
        imgData = tmpCtx.getImageData(0, 0, texWidth, texHeight);

        // Reset view
        zoom = 1;
        panX = 0;
        panY = 0;
        dirty = false;
        undoStack.length = 0;
        undoIndex = -1;
        pushUndo();

        // Auto-fit zoom
        const wrapW = wrapEl.clientWidth;
        const wrapH = wrapEl.clientHeight;
        const fitZoom = Math.max(1, Math.floor(Math.min(wrapW / texWidth, wrapH / texHeight)));
        zoom = fitZoom;
        // Center
        panX = Math.floor((wrapW - texWidth * zoom) / 2);
        panY = Math.floor((wrapH - texHeight * zoom) / 2);

        render();
        resolve({ width: texWidth, height: texHeight });
      };
      img.src = dataUrl;
    });
  }

  function getImageDataUrl() {
    if (!imgData) return null;
    const tmp = document.createElement("canvas");
    tmp.width = texWidth;
    tmp.height = texHeight;
    const tmpCtx = tmp.getContext("2d");
    tmpCtx.putImageData(imgData, 0, 0);
    return tmp.toDataURL("image/png");
  }

  function getOriginalDataUrl() {
    if (undoStack.length === 0) return null;
    const tmp = document.createElement("canvas");
    tmp.width = texWidth;
    tmp.height = texHeight;
    const tmpCtx = tmp.getContext("2d");
    tmpCtx.putImageData(undoStack[0], 0, 0);
    return tmp.toDataURL("image/png");
  }

  function setBrushSize(size) { brushSize = size; }
  function getBrushSize() { return brushSize; }
  function setBrushColor(r, g, b) { brushColor = { r, g, b, a: 255 }; }
  function getBrushColor() { return { ...brushColor }; }
  function isDirty() { return dirty; }
  function getTexSize() { return { w: texWidth, h: texHeight }; }
  function getImageData() { return imgData; }

  // ── Undo/Redo ──

  function pushUndo() {
    // Trim any redo states
    undoStack.length = undoIndex + 1;
    // Clone current imageData
    const clone = new ImageData(new Uint8ClampedArray(imgData.data), texWidth, texHeight);
    undoStack.push(clone);
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    undoIndex = undoStack.length - 1;
  }

  function undo() {
    if (undoIndex <= 0) return;
    undoIndex--;
    imgData = new ImageData(new Uint8ClampedArray(undoStack[undoIndex].data), texWidth, texHeight);
    dirty = undoIndex > 0;
    render();
    if (onDirty) onDirty();
  }

  function redo() {
    if (undoIndex >= undoStack.length - 1) return;
    undoIndex++;
    imgData = new ImageData(new Uint8ClampedArray(undoStack[undoIndex].data), texWidth, texHeight);
    dirty = true;
    render();
    if (onDirty) onDirty();
  }

  // ── Rendering ──

  function render() {
    if (!imgData) return;

    const wrapW = wrapEl.clientWidth;
    const wrapH = wrapEl.clientHeight;
    canvasEl.width = wrapW;
    canvasEl.height = wrapH;
    canvasEl.style.width = wrapW + "px";
    canvasEl.style.height = wrapH + "px";

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#09090b";
    ctx.fillRect(0, 0, wrapW, wrapH);

    // Draw checkerboard for transparency
    const checkSize = Math.max(4, zoom);
    for (let y = 0; y < texHeight; y++) {
      for (let x = 0; x < texWidth; x++) {
        const px = panX + x * zoom;
        const py = panY + y * zoom;
        if (px + zoom < 0 || py + zoom < 0 || px > wrapW || py > wrapH) continue;
        const isLight = (x + y) % 2 === 0;
        ctx.fillStyle = isLight ? "#1a1a1e" : "#141416";
        ctx.fillRect(px, py, zoom, zoom);
      }
    }

    // Draw texture pixels
    const d = imgData.data;
    for (let y = 0; y < texHeight; y++) {
      for (let x = 0; x < texWidth; x++) {
        const px = panX + x * zoom;
        const py = panY + y * zoom;
        if (px + zoom < 0 || py + zoom < 0 || px > wrapW || py > wrapH) continue;
        const i = (y * texWidth + x) * 4;
        const a = d[i + 3] / 255;
        if (a > 0) {
          ctx.fillStyle = "rgba(" + d[i] + "," + d[i + 1] + "," + d[i + 2] + "," + a + ")";
          ctx.fillRect(px, py, zoom, zoom);
        }
      }
    }

    // Grid lines at 8x+
    if (zoom >= 8) {
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= texWidth; x++) {
        const px = panX + x * zoom;
        ctx.moveTo(px + 0.5, panY);
        ctx.lineTo(px + 0.5, panY + texHeight * zoom);
      }
      for (let y = 0; y <= texHeight; y++) {
        const py = panY + y * zoom;
        ctx.moveTo(panX, py + 0.5);
        ctx.lineTo(panX + texWidth * zoom, py + 0.5);
      }
      ctx.stroke();
    }

    updateZoomLabel();
  }

  function updateZoomLabel() {
    const label = wrapEl.querySelector("#zoom-label");
    if (label) label.textContent = zoom + "x";
  }

  // ── Pixel manipulation ──

  function screenToTex(clientX, clientY) {
    const rect = canvasEl.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const tx = Math.floor((sx - panX) / zoom);
    const ty = Math.floor((sy - panY) / zoom);
    return { tx, ty };
  }

  function paintPixel(tx, ty) {
    if (!imgData) return;
    const half = Math.floor(brushSize / 2);
    for (let dy = -half; dy < brushSize - half; dy++) {
      for (let dx = -half; dx < brushSize - half; dx++) {
        const px = tx + dx;
        const py = ty + dy;
        if (px < 0 || py < 0 || px >= texWidth || py >= texHeight) continue;
        const i = (py * texWidth + px) * 4;
        imgData.data[i] = brushColor.r;
        imgData.data[i + 1] = brushColor.g;
        imgData.data[i + 2] = brushColor.b;
        imgData.data[i + 3] = brushColor.a;
      }
    }
  }

  function sampleColor(tx, ty) {
    if (!imgData || tx < 0 || ty < 0 || tx >= texWidth || ty >= texHeight) return;
    const i = (ty * texWidth + tx) * 4;
    brushColor = {
      r: imgData.data[i],
      g: imgData.data[i + 1],
      b: imgData.data[i + 2],
      a: imgData.data[i + 3],
    };
    if (onColorPick) {
      const hex = "#" +
        ((1 << 24) + (brushColor.r << 16) + (brushColor.g << 8) + brushColor.b)
          .toString(16).slice(1);
      onColorPick(hex);
    }
  }

  // ── UV-based painting (for 3D model painting) ──

  function paintAtUV(u, v) {
    if (!imgData) return;
    // glTF UVs use top-left origin — no Y flip needed
    const tx = Math.floor(u * texWidth);
    const ty = Math.floor(v * texHeight);
    paintPixel(tx, ty);
    dirty = true;
    render();
    if (onDirty) onDirty();
  }

  function sampleAtUV(u, v) {
    if (!imgData) return;
    const tx = Math.floor(u * texWidth);
    const ty = Math.floor(v * texHeight);
    sampleColor(tx, ty);
  }

  function beginStroke() {
    // Called at start of a paint stroke (mousedown) — nothing to do yet
  }

  function endStroke() {
    // Called at end of a paint stroke (mouseup) — push undo
    if (imgData && dirty) {
      pushUndo();
      if (onDirty) onDirty();
    }
  }

  // ── Event handlers ──

  wrapEl.addEventListener("wheel", (e) => {
    e.preventDefault();
    const oldZoom = zoom;
    if (e.deltaY < 0) {
      zoom = Math.min(32, zoom * 2);
    } else {
      zoom = Math.max(1, zoom / 2);
    }
    if (zoom !== oldZoom) {
      // Zoom towards cursor
      const rect = canvasEl.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      panX = mx - (mx - panX) * (zoom / oldZoom);
      panY = my - (my - panY) * (zoom / oldZoom);
      render();
    }
  }, { passive: false });

  wrapEl.addEventListener("mousedown", (e) => {
    if (!imgData) return;

    // Middle click or space+click = pan
    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      panning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      panStartPanX = panX;
      panStartPanY = panY;
      wrapEl.style.cursor = "grabbing";
      e.preventDefault();
      return;
    }

    // Right click or alt+click = eyedropper
    if (e.button === 2 || (e.button === 0 && altHeld)) {
      const { tx, ty } = screenToTex(e.clientX, e.clientY);
      sampleColor(tx, ty);
      e.preventDefault();
      return;
    }

    // Left click = paint
    if (e.button === 0) {
      painting = true;
      const { tx, ty } = screenToTex(e.clientX, e.clientY);
      paintPixel(tx, ty);
      dirty = true;
      render();
      if (onDirty) onDirty();
    }
  });

  window.addEventListener("mousemove", (e) => {
    if (panning) {
      panX = panStartPanX + (e.clientX - panStartX);
      panY = panStartPanY + (e.clientY - panStartY);
      render();
      return;
    }
    if (painting) {
      const { tx, ty } = screenToTex(e.clientX, e.clientY);
      paintPixel(tx, ty);
      render();
    }
  });

  window.addEventListener("mouseup", (e) => {
    if (panning) {
      panning = false;
      wrapEl.style.cursor = spaceHeld ? "grab" : "crosshair";
    }
    if (painting) {
      painting = false;
      pushUndo();
      if (onDirty) onDirty();
    }
  });

  wrapEl.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const { tx, ty } = screenToTex(e.clientX, e.clientY);
    sampleColor(tx, ty);
  });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") { spaceHeld = true; wrapEl.style.cursor = "grab"; e.preventDefault(); }
    if (e.code === "AltLeft" || e.code === "AltRight") { altHeld = true; }
    if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ" && !e.shiftKey) { e.preventDefault(); undo(); }
    if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ" && e.shiftKey) { e.preventDefault(); redo(); }
  });

  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") { spaceHeld = false; wrapEl.style.cursor = "crosshair"; }
    if (e.code === "AltLeft" || e.code === "AltRight") { altHeld = false; }
  });

  // Resize handling
  const resizeObs = new ResizeObserver(() => { render(); });
  resizeObs.observe(wrapEl);

  return {
    loadTexture,
    getImageDataUrl,
    getOriginalDataUrl,
    setBrushSize,
    getBrushSize,
    setBrushColor,
    getBrushColor,
    isDirty,
    getTexSize,
    getImageData,
    paintAtUV,
    sampleAtUV,
    beginStroke,
    endStroke,
    undo,
    redo,
    render,
  };
}
