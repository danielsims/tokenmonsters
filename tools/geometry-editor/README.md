# Geometry Editor

Browser-based tool for nudging disconnected geometry islands in GLB models. Built for AI-generated models that are a single mesh shattered into thousands of tiny islands with no naming.

## Quick Start

```bash
cd tools/geometry-editor
bun run serve.ts    # http://localhost:3456
```

Update `MODEL_PATH` in `serve.ts` to point at the GLB you want to edit.

## Workflow

### 1. Identify the problem island

Open http://localhost:3456 in a browser. The viewer supports:

- **Click** — select a single island (highlights cyan, shows island ID)
- **Alt+Drag** — box select multiple islands by screen-space rect
- **Shift+Click / Shift+Alt+Drag** — add to current selection
- **C** — copy selected island IDs to clipboard (comma-separated)
- **R** — clear selection

### 2. Analyze the cluster

```bash
# Find island N and all nearby islands within a radius
bun run analyze-leg.ts
```

Edit the script to change the target island ID and `CLUSTER_RADIUS`. It prints:
- Island center coordinates and bounds
- All islands in the spatial cluster
- Nearby large islands (potential body attachment points)

### 3. Nudge programmatically

```bash
# Args: X_OFFSET Y_OFFSET Z_OFFSET
# EXTRA env var: comma-separated island IDs to include beyond the auto-cluster
EXTRA=1093,1104 bun run nudge-leg.ts 0.1 0 0.05
```

This reads the original GLB, builds islands via flood fill, selects the cluster around island 1099 (within 0.15 radius) plus any EXTRA islands, translates all their vertices, and writes `pinchy-nudged.glb`.

To target a different island, edit `nudge-leg.ts` and change the reference island from 1099.

### 4. Preview the result

- **Original:** http://localhost:3456
- **Nudged:** http://localhost:3456?nudged

Hard refresh (Cmd+Shift+R) after re-running the nudge script.

### 5. Find stragglers

If some fragments were missed:

```bash
bun run find-stragglers.ts
```

Edit `LEG_REGION` bounds and the `movedIslands` set in the script. It finds islands in the region that weren't already moved. Add their IDs to `EXTRA` and re-run the nudge.

### 6. Export

Click "Export GLB" in the browser viewer to download the modified model, or use the nudged file directly from the tool output.

## Key Concepts

- AI-generated GLBs are often one mesh with thousands of disconnected "islands" (groups of connected vertices)
- Island detection works via flood fill on shared vertices through face adjacency
- Nudging modifies vertex positions in-place in the GLB binary buffer
- The browser viewer projects island centers to screen space for box selection
- Scripts modify the raw GLB buffer directly (no three.js dependency server-side)

## Files

- `serve.ts` — Bun HTTP server, serves the viewer + model files
- `index.html` — Browser viewer with click/box select and island highlighting
- `analyze-leg.ts` — Analyze a target island and find its spatial cluster
- `nudge-leg.ts` — Translate a cluster of islands by an offset
- `find-stragglers.ts` — Find islands in a region that weren't included in a nudge
