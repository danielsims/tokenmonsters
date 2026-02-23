/** Centralised theme system with multiple palettes.
 *  Import `t` and use tokens — values update when theme switches.
 *  Switch themes with setTheme(). */

export interface ThemeColors {
  name: string;
  bg: { base: string; surface: string; overlay: string; scene: string };
  border: { muted: string };
  text: { primary: string; secondary: string; muted: string; dim: string; hidden: string };
  accent: { primary: string; warm: string; green: string; blue: string };
  status: { ok: string; error: string; warning: string };
  stat: { evolve: string };
  source: { claude: string; codex: string; opencode: string };
  rarity: { common: string; uncommon: string; rare: string; legendary: string };
}

const THEMES: Record<string, ThemeColors> = {
  midnight: {
    name: "midnight",
    bg: { base: "#111111", surface: "#181818", overlay: "#1e1e1e", scene: "#9a8a60" },
    border: { muted: "#2a2a2a" },
    text: { primary: "#d4d4d4", secondary: "#a0a0a0", muted: "#6b6b6b", dim: "#484848", hidden: "#333333" },
    accent: { primary: "#d4a843", warm: "#c47a3a", green: "#7aba5c", blue: "#6b9fd4" },
    status: { ok: "#5c8a50", error: "#b85454", warning: "#c49040" },
    stat: { evolve: "#b87aad" },
    source: { claude: "#c47a3a", codex: "#6b9fd4", opencode: "#6aab70" },
    rarity: { common: "#8a8a8a", uncommon: "#5a9a73", rare: "#b08040", legendary: "#9a6aaa" },
  },

  catppuccin: {
    name: "catppuccin",
    bg: { base: "#1e1e2e", surface: "#181825", overlay: "#313244", scene: "#8a7098" },
    border: { muted: "#45475a" },
    text: { primary: "#cdd6f4", secondary: "#bac2de", muted: "#6c7086", dim: "#45475a", hidden: "#313244" },
    accent: { primary: "#f5c2e7", warm: "#fab387", green: "#a6e3a1", blue: "#89b4fa" },
    status: { ok: "#a6e3a1", error: "#f38ba8", warning: "#f9e2af" },
    stat: { evolve: "#cba6f7" },
    source: { claude: "#fab387", codex: "#89b4fa", opencode: "#a6e3a1" },
    rarity: { common: "#6c7086", uncommon: "#a6e3a1", rare: "#f9e2af", legendary: "#cba6f7" },
  },

  phosphor: {
    name: "phosphor",
    bg: { base: "#0a0a0a", surface: "#101010", overlay: "#1a1a1a", scene: "#508050" },
    border: { muted: "#1a2a1a" },
    text: { primary: "#b0d0b0", secondary: "#80a080", muted: "#507050", dim: "#304030", hidden: "#203020" },
    accent: { primary: "#40c040", warm: "#60a040", green: "#40c040", blue: "#40a0c0" },
    status: { ok: "#40c040", error: "#c04040", warning: "#c0a040" },
    stat: { evolve: "#40c0a0" },
    source: { claude: "#60a040", codex: "#40a0c0", opencode: "#40c040" },
    rarity: { common: "#507050", uncommon: "#40a060", rare: "#a0c040", legendary: "#40c0a0" },
  },

  dracula: {
    name: "dracula",
    bg: { base: "#282a36", surface: "#21222c", overlay: "#44475a", scene: "#7a68a0" },
    border: { muted: "#44475a" },
    text: { primary: "#f8f8f2", secondary: "#c0c0c0", muted: "#6272a4", dim: "#44475a", hidden: "#383a59" },
    accent: { primary: "#bd93f9", warm: "#ffb86c", green: "#50fa7b", blue: "#8be9fd" },
    status: { ok: "#50fa7b", error: "#ff5555", warning: "#f1fa8c" },
    stat: { evolve: "#ff79c6" },
    source: { claude: "#ffb86c", codex: "#8be9fd", opencode: "#50fa7b" },
    rarity: { common: "#6272a4", uncommon: "#50fa7b", rare: "#f1fa8c", legendary: "#bd93f9" },
  },

  flexoki: {
    name: "flexoki",
    bg: { base: "#100f0f", surface: "#1c1b1a", overlay: "#282726", scene: "#9a7050" },
    border: { muted: "#343331" },
    text: { primary: "#cecdc3", secondary: "#b7b5ac", muted: "#878580", dim: "#575653", hidden: "#343331" },
    accent: { primary: "#da702c", warm: "#d14d41", green: "#879a39", blue: "#4385be" },
    status: { ok: "#879a39", error: "#d14d41", warning: "#d0a215" },
    stat: { evolve: "#ce5d97" },
    source: { claude: "#da702c", codex: "#4385be", opencode: "#879a39" },
    rarity: { common: "#878580", uncommon: "#879a39", rare: "#da702c", legendary: "#ce5d97" },
  },
};

/** The default theme */
const DEFAULT_THEME = "midnight";

/** Active theme — mutated in place so imports stay valid */
export const t: ThemeColors = deepCopy(THEMES[DEFAULT_THEME]);

let _currentName = DEFAULT_THEME;

function deepCopy(src: ThemeColors): ThemeColors {
  return JSON.parse(JSON.stringify(src));
}

/** Switch to a named theme. Mutates `t` in place. */
export function setTheme(name: string): void {
  const theme = THEMES[name];
  if (!theme) return;
  _currentName = name;
  for (const key of Object.keys(theme) as (keyof ThemeColors)[]) {
    if (typeof theme[key] === "object") {
      Object.assign(t[key] as any, theme[key]);
    } else {
      (t as any)[key] = theme[key];
    }
  }
}

/** Get current theme name */
export function getThemeName(): string {
  return _currentName;
}

/** Get list of available theme names */
export function availableThemes(): string[] {
  return Object.keys(THEMES);
}

/** Cycle to the next theme, returns the new name */
export function cycleTheme(): string {
  const names = availableThemes();
  const idx = names.indexOf(_currentName);
  const next = names[(idx + 1) % names.length];
  setTheme(next);
  return next;
}

/** Parse the scene background hex to a number for Three.js */
export function getSceneBg(): number {
  return parseInt(t.bg.scene.replace("#", ""), 16);
}
