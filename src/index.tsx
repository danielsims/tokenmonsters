import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./App";
import { getDatabase, closeDatabase } from "./db/database";

// Initialize database on startup
getDatabase();

const renderer = await createCliRenderer({
  exitOnCtrlC: false, // We handle Ctrl+C ourselves for clean shutdown
  targetFps: 30,
  onDestroy: () => {
    closeDatabase();
  },
});

createRoot(renderer).render(<App />);
