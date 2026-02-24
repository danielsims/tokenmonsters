const { execFileSync } = require("child_process");
const { existsSync } = require("fs");
const { join } = require("path");
const { homedir } = require("os");

// Already have bun in PATH?
try {
  execFileSync("bun", ["--version"], { stdio: "ignore" });
  process.exit(0);
} catch {}

// Installed at ~/.bun/bin/bun?
if (existsSync(join(homedir(), ".bun", "bin", "bun"))) {
  process.exit(0);
}

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
