const { execFileSync, execSync } = require("child_process");
const { existsSync, mkdirSync } = require("fs");
const { join } = require("path");
const { homedir } = require("os");

// --- Ensure Bun is installed ---

try {
  execFileSync("bun", ["--version"], { stdio: "ignore" });
} catch {
  if (existsSync(join(homedir(), ".bun", "bin", "bun"))) {
    // bun exists but not in PATH
  } else {
    console.log("Installing Bun runtime...");
    try {
      execFileSync("bash", ["-c", "curl -fsSL https://bun.sh/install | bash"], {
        stdio: "inherit",
      });
    } catch (err) {
      console.error("Failed to install Bun automatically.");
      console.error("Install it manually: curl -fsSL https://bun.sh/install | bash");
      process.exit(1);
    }
  }
}

// --- Download 3D models if missing ---

const modelsDir = join(homedir(), ".tokenmonsters", "models");

if (existsSync(join(modelsDir, "pinchy.glb"))) {
  process.exit(0);
}

const CHUNKS = [
  "https://github.com/user-attachments/files/25823675/models-eggs.tar.gz",
  "https://github.com/user-attachments/files/25823678/models-set1.tar.gz",
  "https://github.com/user-attachments/files/25823679/models-set2.tar.gz",
  "https://github.com/user-attachments/files/25823680/models-set3.tar.gz",
];

console.log("Downloading 3D models...");
mkdirSync(modelsDir, { recursive: true });

let failed = false;
for (const url of CHUNKS) {
  try {
    execSync(
      `curl -fsSL -L "${url}" | tar xz -C "${modelsDir}"`,
      { stdio: "inherit", timeout: 300000 }
    );
  } catch {
    console.error(`Failed to download models.`);
    failed = true;
    break;
  }
}

if (failed) {
  console.error("Model download incomplete. The game will run without some 3D previews.");
} else {
  console.log("Models downloaded.");
}
