import { createCliRenderer } from "@opentui/core";
import { ThreeRenderable } from "@opentui/core/3d";
import { createRoot, extend } from "@opentui/react";
import { App } from "./App";
import { getDatabase, closeDatabase } from "./db/database";

// Register ThreeRenderable as a JSX element
extend({ threeScene: ThreeRenderable });

// TypeScript module augmentation for the custom element
declare module "@opentui/react" {
  interface OpenTUIComponents {
    threeScene: typeof ThreeRenderable;
  }
}

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
