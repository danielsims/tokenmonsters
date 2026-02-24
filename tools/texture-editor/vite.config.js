import { defineConfig } from "vite";
import { existsSync, mkdirSync, readdirSync, readFileSync, copyFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "../..");
const modelsDir = resolve(projectRoot, "src/three/models");

export default defineConfig({
  plugins: [
    {
      name: "texture-editor-api",
      configureServer(server) {
        // GET /api/models — list all species + forms
        server.middlewares.use("/api/models", (req, res, next) => {
          if (req.method !== "GET") { next(); return; }
          try {
            const species = readdirSync(modelsDir, { withFileTypes: true })
              .filter((d) => d.isDirectory())
              .map((d) => {
                const speciesDir = resolve(modelsDir, d.name);
                const forms = readdirSync(speciesDir)
                  .filter((f) => f.endsWith(".glb"))
                  .map((f) => ({
                    name: f.replace(/\.glb$/, ""),
                    glbPath: "src/three/models/" + d.name + "/" + f,
                  }));
                return { species: d.name, forms };
              })
              .filter((s) => s.forms.length > 0);

            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(species));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: String(err) }));
          }
        });

        // GET /api/textures/:species/:form — extract textures from GLB
        server.middlewares.use("/api/textures", (req, res, next) => {
          if (req.method !== "GET") { next(); return; }
          const parts = req.url.replace(/^\//, "").split("/");
          if (parts.length < 2) { next(); return; }
          const [species, form] = parts;
          const glbPath = resolve(modelsDir, species, form + ".glb");

          if (!existsSync(glbPath)) {
            res.statusCode = 404;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "GLB not found: " + species + "/" + form }));
            return;
          }

          try {
            const result = execSync(
              "bun " + JSON.stringify(resolve(projectRoot, "tools/texture-embed.ts")) +
              " extract " + JSON.stringify(glbPath),
              { cwd: projectRoot, timeout: 30000, maxBuffer: 50 * 1024 * 1024 }
            );
            res.setHeader("Content-Type", "application/json");
            res.end(result);
          } catch (err) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: String(err.stderr || err.message || err) }));
          }
        });

        // POST /api/save — save edited texture back into GLB
        server.middlewares.use("/api/save", (req, res, next) => {
          if (req.method !== "POST") { next(); return; }

          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", () => {
            try {
              const { species, form, textureIndex, imageData } = JSON.parse(body);

              if (!species || !form || textureIndex === undefined || !imageData) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: "Missing species, form, textureIndex, or imageData" }));
                return;
              }

              const glbPath = resolve(modelsDir, species, form + ".glb");
              if (!existsSync(glbPath)) {
                res.statusCode = 404;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: "GLB not found" }));
                return;
              }

              // Backup
              const backupDir = resolve(projectRoot, "tools/out/texture-backups", species);
              if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
              const ts = new Date().toISOString().replace(/[-:T]/g, (m) => m === "T" ? "_" : "").slice(0, 15);
              const backupPath = resolve(backupDir, form + "_" + ts + ".glb");
              copyFileSync(glbPath, backupPath);

              // Write temp PNG from base64 data URL
              const tmpDir = resolve(projectRoot, "tools/out");
              if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
              const tmpPng = resolve(tmpDir, "_texture_tmp.png");
              const base64 = imageData.replace(/^data:image\/\w+;base64,/, "");
              writeFileSync(tmpPng, Buffer.from(base64, "base64"));

              // Embed
              execSync(
                "bun " + JSON.stringify(resolve(projectRoot, "tools/texture-embed.ts")) +
                " embed " + JSON.stringify(glbPath) + " " + textureIndex + " " + JSON.stringify(tmpPng),
                { cwd: projectRoot, timeout: 30000 }
              );

              const relBackup = "tools/out/texture-backups/" + species + "/" + form + "_" + ts + ".glb";
              console.log("[save] Backed up to " + relBackup);
              console.log("[save] Embedded texture " + textureIndex + " into " + species + "/" + form + ".glb");

              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: true, backup: relBackup }));
            } catch (err) {
              console.error("[save] Error:", err.message || err);
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: String(err.message || err) }));
            }
          });
        });

        // Serve GLB files from models dir: /models/:species/:form.glb
        server.middlewares.use("/models", (req, res, next) => {
          const filePath = resolve(modelsDir, req.url.replace(/^\//, ""));
          if (existsSync(filePath) && filePath.endsWith(".glb")) {
            const data = readFileSync(filePath);
            res.setHeader("Content-Type", "model/gltf-binary");
            res.setHeader("Content-Length", data.length);
            res.end(data);
          } else {
            next();
          }
        });

        // Serve config.json for species
        server.middlewares.use("/api/config", (req, res, next) => {
          const species = req.url.replace(/^\//, "").replace(/\/$/, "");
          if (!species) { next(); return; }
          const configPath = resolve(modelsDir, species, "config.json");
          if (existsSync(configPath)) {
            res.setHeader("Content-Type", "application/json");
            res.end(readFileSync(configPath, "utf-8"));
          } else {
            res.setHeader("Content-Type", "application/json");
            res.end("{}");
          }
        });
      },
    },
  ],
});
