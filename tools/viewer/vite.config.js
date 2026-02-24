import { defineConfig } from "vite";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname, basename } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "../..");
const modelsDir = resolve(projectRoot, "src/three/models");
const outDir = resolve(projectRoot, "tools/out");
const publicDir = resolve(__dirname, "public");

export default defineConfig({
  plugins: [
    {
      name: "pipeline-api",
      configureServer(server) {
        // Serve tools/out/ files at /out/<filename>
        server.middlewares.use("/out", (req, res, next) => {
          const filePath = resolve(outDir, req.url.replace(/^\//, ""));
          if (existsSync(filePath)) {
            res.setHeader("Content-Type", "application/octet-stream");
            res.setHeader("Content-Length", readFileSync(filePath).length);
            res.end(readFileSync(filePath));
          } else {
            next();
          }
        });

        // GET /api/config — return config.json for all forms
        server.middlewares.use("/api/config", (req, res, next) => {
          if (req.method !== "GET") { next(); return; }
          const configPath = resolve(modelsDir, "config.json");
          if (existsSync(configPath)) {
            res.setHeader("Content-Type", "application/json");
            res.end(readFileSync(configPath, "utf-8"));
          } else {
            res.setHeader("Content-Type", "application/json");
            res.end("{}");
          }
        });

        // POST /api/process — upload GLB, run split + optimize, return file list
        server.middlewares.use("/api/process", (req, res) => {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.end("Method not allowed");
            return;
          }

          const chunks = [];
          req.on("data", (chunk) => chunks.push(chunk));
          req.on("end", () => {
            try {
              const body = Buffer.concat(chunks);
              const filename = (req.headers["x-filename"] || "model.glb").replace(/[^a-zA-Z0-9._-]/g, "_");
              const inputPath = resolve(outDir, "_input_" + filename);

              if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
              writeFileSync(inputPath, body);

              const stem = filename.replace(/\.glb$/i, "");
              console.log("[process] Running split on " + filename + " (" + (body.length / 1024 / 1024).toFixed(1) + " MB)");

              // Run split
              execSync("bun run tools/split.ts " + JSON.stringify(inputPath) + " --out " + JSON.stringify(outDir), {
                cwd: projectRoot,
                stdio: "pipe",
                timeout: 120000,
              });

              // Find split outputs
              const splitFiles = readdirSync(outDir)
                .filter((f) => f.startsWith("_input_" + stem + "_") && f.endsWith(".glb") && !f.includes("_med") && !f.includes("_low") && !f.includes("_high"))
                .sort();

              console.log("[process] Split into " + splitFiles.length + " files: " + splitFiles.join(", "));

              // Optimize each split at three quality tiers
              const tiers = [
                { suffix: "_high", texSize: 2048, quality: 90 },
                { suffix: "_med", texSize: 1024, quality: 85 },
                { suffix: "_low", texSize: 512, quality: 80 },
              ];
              const results = [];
              for (const sf of splitFiles) {
                const sfPath = resolve(outDir, sf);
                const tierFiles = [];
                for (const tier of tiers) {
                  const outName = sf.replace(".glb", tier.suffix + ".glb");
                  const tierOutPath = resolve(outDir, outName);
                  try {
                    execSync(
                      "bun run tools/optimize.ts " + JSON.stringify(sfPath) +
                      " --out " + JSON.stringify(tierOutPath) +
                      " --tex-size " + tier.texSize + " --format jpeg --quality " + tier.quality,
                      { cwd: projectRoot, stdio: "pipe", timeout: 120000 }
                    );
                    tierFiles.push(outName);
                    console.log("[process] Optimized: " + outName);
                  } catch (optErr) {
                    console.error("[process] Optimize failed for " + outName + ": " + optErr.message);
                  }
                }
                results.push({ raw: sf, tiers: tierFiles });
              }

              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: true, results }));
            } catch (err) {
              console.error("[process] Error:", err.message || err);
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: String(err.message || err) }));
            }
          });
        });
        // POST /api/finalize
        // Body: { sourceFile, formName, background? }
        // Copies GLB to: src/three/models/<formName>.glb
        // Writes/merges: src/three/models/config.json
        server.middlewares.use("/api/finalize", (req, res) => {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.end("Method not allowed");
            return;
          }

          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", () => {
            try {
              const { sourceFile, formName, background } = JSON.parse(body);

              if (!sourceFile || !formName) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: "Missing sourceFile or formName" }));
                return;
              }

              const namePattern = /^[a-z0-9_-]+$/;
              if (!namePattern.test(formName)) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: "Form name must be lowercase alphanumeric (a-z, 0-9, -, _)" }));
                return;
              }

              // Find source file
              const srcFromOut = resolve(outDir, sourceFile);
              const srcFromPub = resolve(__dirname, "public", sourceFile);
              const actualSrc = existsSync(srcFromOut) ? srcFromOut
                : existsSync(srcFromPub) ? srcFromPub
                : null;

              if (!actualSrc) {
                res.statusCode = 404;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: "Source file not found: " + sourceFile }));
                return;
              }

              // Copy GLB to flat models directory
              const destPath = resolve(modelsDir, formName + ".glb");
              copyFileSync(actualSrc, destPath);

              // Write/merge config.json with form config
              const configPath = resolve(modelsDir, "config.json");
              let config = {};
              if (existsSync(configPath)) {
                try { config = JSON.parse(readFileSync(configPath, "utf-8")); } catch {}
              }
              if (background) {
                if (!config[formName]) config[formName] = {};
                config[formName].background = background;
              }
              writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");

              const relPath = "src/three/models/" + formName + ".glb";
              console.log("[finalize] " + sourceFile + " -> " + relPath);
              if (background) console.log("[finalize] config.json background=" + background);

              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({
                ok: true,
                formName,
                destPath,
                relPath,
              }));
            } catch (err) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: String(err) }));
            }
          });
        });
      },
    },
  ],
});
