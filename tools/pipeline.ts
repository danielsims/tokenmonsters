/**
 * Full model pipeline — split + optimize in one command.
 *
 * Usage:
 *   bun run tools/pipeline.ts <input.glb> [options]
 *
 * Options:
 *   --species <name>     Species name for output files (default: derived from filename)
 *   --out <dir>          Output directory (default: src/three/models/)
 *   --clusters <n>       Number of instances to split into (default: auto-detect)
 *   --tex-size <n>       Max texture dimension (default: 1024)
 *   --quality <n>        JPEG quality 1-100 (default: 85)
 *   --skip-split         Skip split step (input is already a single instance)
 *   --viewer             Copy results to viewer for inspection
 *
 * Examples:
 *   bun run tools/pipeline.ts models/bytepup.glb --species byteclaw --viewer
 *   bun run tools/pipeline.ts models/single.glb --skip-split --species glimmer
 */
import { existsSync, mkdirSync, cpSync } from "fs";
import { resolve, basename, extname } from "path";
import { $ } from "bun";

const args = process.argv.slice(2);
let inputPath = "";
let species = "";
let outDir = "";
let clusters = 0; // 0 = auto-detect
let clustersExplicit = false;
let texSize = 1024;
let quality = 85;
let skipSplit = false;
let copyToViewer = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--species" && args[i + 1]) { species = args[++i]; }
  else if (args[i] === "--out" && args[i + 1]) { outDir = args[++i]; }
  else if (args[i] === "--clusters" && args[i + 1]) { clusters = parseInt(args[++i], 10); clustersExplicit = true; }
  else if (args[i] === "--tex-size" && args[i + 1]) { texSize = parseInt(args[++i], 10); }
  else if (args[i] === "--quality" && args[i + 1]) { quality = parseInt(args[++i], 10); }
  else if (args[i] === "--skip-split") { skipSplit = true; }
  else if (args[i] === "--viewer") { copyToViewer = true; }
  else if (!args[i].startsWith("--")) { inputPath = args[i]; }
}

if (!inputPath) {
  console.log("Usage: bun run tools/pipeline.ts <input.glb> [--species <name>] [--viewer]");
  console.log("");
  console.log("Options:");
  console.log("  --species <name>   Species name for output files");
  console.log("  --out <dir>        Output directory (default: src/three/models/)");
  console.log("  --clusters <n>     Number of instances to split (default: auto-detect)");
  console.log("  --tex-size <n>     Max texture dimension (default: 1024)");
  console.log("  --quality <n>      JPEG quality (default: 85)");
  console.log("  --skip-split       Input is already a single instance");
  console.log("  --viewer           Copy results to viewer for inspection");
  process.exit(1);
}

const glbPath = resolve(process.cwd(), inputPath);
if (!species) species = basename(glbPath, extname(glbPath));
if (!outDir) outDir = resolve(process.cwd(), "src/three/models");

const tempDir = resolve(process.cwd(), "tools/out");
const toolsDir = resolve(process.cwd(), "tools");
const viewerPublic = resolve(toolsDir, "viewer/public");

if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });

console.log("========================================");
console.log("  Token Monsters Model Pipeline");
console.log("========================================");
console.log("");
console.log("Input:    " + glbPath);
console.log("Species:  " + species);
console.log("Output:   " + outDir);
console.log("");

// ─── Step 1: Split ──────────────────────────────────────────────────────────

let splitFiles: string[] = [];

if (skipSplit) {
  console.log("[1/3] Split: SKIPPED (--skip-split)");
  splitFiles = [glbPath];
} else {
  console.log("[1/3] Splitting" + (clustersExplicit ? " into " + clusters + " instances" : " (auto-detect)") + "...");
  console.log("");

  const splitCmd = ["bun", "run", resolve(toolsDir, "split.ts"), glbPath, "--out", tempDir];
  if (clustersExplicit) splitCmd.push("--clusters", String(clusters));

  const splitResult = Bun.spawnSync({
    cmd: splitCmd,
    cwd: process.cwd(),
    stdout: "inherit",
    stderr: "inherit",
  });

  if (splitResult.exitCode !== 0) {
    console.log("ERROR: Split failed");
    process.exit(1);
  }

  // Find the split output files (scan for all that exist rather than assuming count)
  const inputName = basename(glbPath, extname(glbPath));
  for (let i = 0; ; i++) {
    const splitPath = resolve(tempDir, inputName + "_" + i + ".glb");
    if (!existsSync(splitPath)) break;
    splitFiles.push(splitPath);
  }
  console.log("");
  console.log("Split produced " + splitFiles.length + " files");
}

// ─── Step 2: Optimize each split ────────────────────────────────────────────

console.log("");
console.log("[2/3] Optimizing " + splitFiles.length + " file(s)...");
console.log("");

const optimizedFiles: string[] = [];

for (let i = 0; i < splitFiles.length; i++) {
  const input = splitFiles[i];
  const outName = splitFiles.length === 1
    ? species + ".glb"
    : species + "_" + i + ".glb";
  const optPath = resolve(tempDir, outName);

  console.log("--- Optimizing: " + basename(input) + " -> " + outName + " ---");

  const optResult = Bun.spawnSync({
    cmd: [
      "bun", "run", resolve(toolsDir, "optimize.ts"),
      input,
      "--out", optPath,
      "--tex-size", String(texSize),
      "--quality", String(quality),
    ],
    cwd: process.cwd(),
    stdout: "inherit",
    stderr: "inherit",
  });

  if (optResult.exitCode !== 0) {
    console.log("WARNING: Optimize failed for " + basename(input));
    continue;
  }

  optimizedFiles.push(optPath);
  console.log("");
}

// ─── Step 3: Copy to viewer / final output ──────────────────────────────────

console.log("[3/3] Copying to output...");

if (copyToViewer) {
  if (!existsSync(viewerPublic)) mkdirSync(viewerPublic, { recursive: true });
  for (let i = 0; i < optimizedFiles.length; i++) {
    const dest = resolve(viewerPublic, "split_" + i + ".glb");
    cpSync(optimizedFiles[i], dest);
    console.log("  -> " + dest);
  }
  console.log("");
  console.log("View results: cd tools/viewer && npx vite --port 5555");
}

console.log("");
console.log("Optimized files in: " + tempDir);
for (const f of optimizedFiles) {
  console.log("  " + basename(f));
}

console.log("");
console.log("Next steps:");
console.log("  1. Open the viewer to pick the best split");
console.log("  2. Copy the chosen file to: " + outDir + "/" + species + ".glb");
console.log("  3. Update MonsterScene.tsx to map the species to the new model");
console.log("");
console.log("Done!");
