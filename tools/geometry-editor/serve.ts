import { file } from "bun";
import { resolve } from "path";

const MODEL_PATH = "/Users/danielsims/Documents/token-monsters/src/three/models/pinchy.glb";
const HTML_PATH = resolve(import.meta.dir, "index.html");

const PORT = 3456;

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/pinchy.glb") {
      return new Response(file(MODEL_PATH), {
        headers: { "Content-Type": "model/gltf-binary" },
      });
    }

    if (url.pathname === "/pinchy-nudged.glb") {
      return new Response(file(resolve(import.meta.dir, "pinchy-nudged.glb")), {
        headers: { "Content-Type": "model/gltf-binary" },
      });
    }

    return new Response(file(HTML_PATH), {
      headers: { "Content-Type": "text/html" },
    });
  },
});

console.log(`Geometry editor: http://localhost:${PORT}`);
