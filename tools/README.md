# Token Monsters — Model Pipeline Tools

Dev-only tooling for processing 3D models (GLB) into game-ready assets.

## Workflow

```
concept art → image-to-3d service → raw.glb (often multi-instance)
  → bun run tools/inspect.ts raw.glb          # inspect structure
  → bun run tools/split.ts raw.glb             # split into individual monsters
  → bun run tools/optimize.ts single.glb       # terminal-optimize
  → bun run tools/dump-textures.ts final.glb   # visual QC on textures
  → copy to src/three/models/                  # register in game
```

Or use the all-in-one pipeline:
```
bun run tools/pipeline.ts models/bytepup.glb --species byteclaw --out src/three/models/
```

## Scripts

| Script | Purpose |
|--------|---------|
| `inspect.ts` | Dump GLB metadata: meshes, materials, textures, spatial layout |
| `split.ts` | Split multi-instance GLB into individual monsters |
| `optimize.ts` | Terminal-optimize a GLB: simplify materials, boost textures, merge meshes |
| `dump-textures.ts` | Extract all textures from a GLB to PNGs for visual QC |
| `pipeline.ts` | Full pipeline: split → optimize → copy to game assets |
