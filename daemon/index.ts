import { TokenWatcher } from "../src/tracking/watcher";
import { unlinkSync, existsSync } from "fs";

const SOCKET_PATH = process.env.TOKENMON_SOCKET ?? "/tmp/tokenmon.sock";

// Clean up stale socket
if (existsSync(SOCKET_PATH)) {
  try {
    unlinkSync(SOCKET_PATH);
  } catch {
    // ignore
  }
}

const watcher = new TokenWatcher();
watcher.start();

console.log("[daemon] Token Monsters daemon starting...");
console.log("[daemon] Sources:", watcher.getSourceStatus());

const server = Bun.serve({
  unix: SOCKET_PATH,

  async fetch(req) {
    const url = new URL(req.url, "http://localhost");
    const path = url.pathname;

    if (path === "/tokens/latest") {
      const events = watcher.drain();
      return Response.json({ events });
    }

    if (path === "/tokens/total") {
      const totals = watcher.getTotals();
      return Response.json({ totals });
    }

    if (path === "/health") {
      return Response.json({
        status: "ok",
        uptime: watcher.getUptime(),
        sources: watcher.getSourceStatus(),
      });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`[daemon] Listening on ${SOCKET_PATH}`);

// Cleanup on exit
function cleanup() {
  console.log("[daemon] Shutting down...");
  watcher.stop();
  server.stop();
  if (existsSync(SOCKET_PATH)) {
    try {
      unlinkSync(SOCKET_PATH);
    } catch {
      // ignore
    }
  }
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
