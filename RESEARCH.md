# Token Monsters — Research & References

## Project Vision

A TUI virtual pet game where AI token consumption (Claude Code, Codex, OpenCode, etc.) feeds and evolves digital monsters. CryptoKitties genetics + Tamagotchi care loop + Pokemon evolution — rendered as 3D creatures in the terminal via OpenTUI's built-in Three.js WebGPU support.

---

## OpenTUI

- [OpenTUI Docs](https://opentui.com/)
- [OpenTUI GitHub](https://github.com/anomalyco/opentui)
- [@opentui/core npm](https://www.npmjs.com/package/@opentui/core)
- [@opentui/react npm](https://www.npmjs.com/package/@opentui/react)
- [v0.1.76 — ThreeRenderable introduced (PR #595)](https://github.com/anomalyco/opentui/releases/tag/v0.1.76)
- [v0.1.78 — bun-webgpu upgrade](https://github.com/anomalyco/opentui/releases/tag/v0.1.78)
- [DeepWiki OpenTUI docs](https://deepwiki.com/sst/opentui)

### Key Architecture Notes

- **Three bindings**: `@opentui/core/3d` exports `ThreeRenderable` — renders Three.js scenes to terminal via Dawn WebGPU using partial block characters. Only requires 24-bit terminal color.
- **React binding**: `@opentui/react` provides `<box>`, `<text>`, `<input>`, `<select>`, `<scrollbox>`, `<ascii-font>` etc.
- **Hooks**: `useKeyboard`, `useRenderer`, `useTimeline`, `useTerminalDimensions`, `useOnResize`
- **Layout**: Full CSS Flexbox via Yoga engine
- **Animations**: Timeline-based with easing functions (easeInOutQuad, easeOutElastic, easeOutBounce, etc.)
- **Testing**: `testRender` from `@opentui/react/test-utils` for snapshot + interaction tests
- **Runtime**: Bun only (not Node.js)
- **Critical**: Never call `process.exit()` directly — always `renderer.destroy()` first

### OpenTUI Skill (local reference)

Installed at `~/.agents/skills/opentui/references/` with full API docs for core, react, solid, components, layout, keyboard, animation, and testing.

---

## Three.js Terminal Rendering

- [@kmdrfx tweet — OpenTUI Three.js WebGPU (Feb 18, 2026)](https://x.com/kmdrfx)
- [Three.js WebGPU Renderer Tutorial](https://sbcode.net/threejs/webgpu-renderer/)
- [Zero — terminal 3D renderer](https://github.com/sinclairzx81/zero)
- [threejs-term — Three.js to terminal](https://github.com/zz85/threejs-term)
- [three-software-renderer npm](https://www.npmjs.com/package/three-software-renderer)
- [terminal-canvas npm](https://www.npmjs.com/package/terminal-canvas)
- [Kitty Graphics Protocol](https://sw.kovidgoyal.net/kitty/graphics-protocol/)
- [iTerm2 Inline Images](https://iterm2.com/documentation-images.html)
- [Are We Sixel Yet?](https://arewesixelyet.com)
- [bun-webgpu (Dawn bindings for Bun)](https://www.npmjs.com/package/bun-webgpu)

### How It Works

OpenTUI's `ThreeRenderable` uses Dawn (Google's C++ WebGPU implementation) through `bun-webgpu`. The pipeline:

1. Three.js scene → WebGPU rasterization (GPU-accelerated via Dawn)
2. Frame buffer → partial Unicode block characters (▀▄█)
3. ANSI 24-bit color codes → terminal stdout
4. Delta rendering — only changed cells are written per frame

Built-in examples include: Golden Star with particles, Shader Cube, Fractal Shader, Phong Lighting.

---

## Game Design References

### CryptoKitties

- [Genes Guide](https://guide.cryptokitties.co/guide/cat-features/genes)
- [Cattributes](https://guide.cryptokitties.co/guide/cat-features/cattributes)
- [Hacking the CryptoKitties Genome (HackerNoon)](https://hackernoon.com/hacking-the-cryptokitties-genome-1cb3e7dddab3)
- [CryptoKitties Genome Project (Medium)](https://kaigani.medium.com/the-cryptokitties-genome-project-68582016f687)

**Key Mechanics:**
- 256-bit genome encoding 12 trait categories
- Each trait: 4 genes (1 primary/visible + 3 hidden/inheritable)
- Inheritance: Primary gene 37.5% chance, H1 9.4%, H2 2.3%, H3 0.8%
- Mutation system: Base → M1 → M2 → M3 → M4 progression
- Breeding creates child genome from crossover of two parents
- Rare traits drove speculative market value

### Tamagotchi

- [Care Mechanics](https://tamagotchi.fandom.com/wiki/Care)
- [Evolution](https://tamagotchi.fandom.com/wiki/Evolution)
- [P1 Care Guide](https://thaao.net/tama/p1/)
- [Wikipedia](https://en.wikipedia.org/wiki/Tamagotchi)

**Key Mechanics:**
- Hunger (4 hearts) — fed with meals/snacks, care mistake if empty 15+ min
- Happiness (4 hearts) — increased by snacks, play, interaction
- Discipline meter — 25% per successful response, affects evolution outcome
- Evolution stages: Baby (65 min) → Child (age 3) → Teen (age 6) → Adult → Secret (age 8-12, perfect care)
- Death from negligence (untreated illness/starvation) or old age
- Care quality determines which adult form you get

### Pokemon Evolution

- [Friendship Evolution (Bulbapedia)](https://bulbapedia.bulbagarden.net/wiki/Friendship_Evolution)
- [Friendship Mechanics](https://bulbapedia.bulbagarden.net/wiki/Friendship)
- [Methods of Evolution](https://bulbapedia.bulbagarden.net/wiki/Methods_of_Evolution)
- [Evolution Database](https://pokemondb.net/evolution)

**Key Mechanics:**
- Level-based (most common): reach XP threshold
- Happiness-based: friendship value 0-255, threshold at 220 (or 160 in Gen VIII+)
- Item-based: evolution stones trigger transformation
- Special conditions: time of day, location, move knowledge, trading
- Multiple evolution paths from single base (Eevee → 8 forms)

---

## ASCII Art & Terminal Pets

- [ASCII-Pet (Python/C++/x86 ASM)](https://github.com/YKesX/ascii-pet)
- [ASCII Art Archive — Animals](https://www.asciiart.eu/animals/)
- [ASCII Art Archive — Cats](https://www.asciiart.eu/animals/cats)
- [ASCII Art Archive — Creatures](https://www.asciiart.eu/video-games/creatures)
- [Rust Virtual Pet Prototypes](https://www.moonbench.xyz/projects/rust-virtual-pet-prototypes/)
- [TerminalImageViewer](https://github.com/stefanhaustein/TerminalImageViewer)
- [Cat ASCII Art Tool](https://github.com/ShoreNexx/Cat-ASCII-Art)

### ASCII-Pet Gameplay Reference

- 7 emotional states: idle, happy, angry, sleepy, sleeping, hungry, attention-seeking
- Hunger decays every 26+ hours, affection every 6+ hours
- Sleep required after 1 hour awake
- Persistent saves between sessions

---

## Token Tracking

### Documentation & Tools

- [Claude Code Cost Management](https://code.claude.com/docs/en/costs)
- [Claude API Cost Tracking (Agent SDK)](https://platform.claude.com/docs/en/agent-sdk/cost-tracking)
- [ccusage — Claude Code usage CLI](https://shipyard.build/blog/claude-code-track-usage/)
- [Claude-Code-Usage-Monitor](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor)
- [Claude Code + OpenTelemetry + Grafana](https://quesma.com/blog/track-claude-code-usage-and-limits-with-grafana-cloud/)
- [OpenAI Token Usage](https://help.openai.com/en/articles/6614209-how-do-i-check-my-token-usage)
- [Codex CLI Config Reference](https://developers.openai.com/codex/config-reference/)

### Log File Locations (macOS)

| Tool | Path | Format |
|------|------|--------|
| Claude Code | `~/.claude/stats-cache.json` | JSON — `dailyModelTokens` with per-model `inputTokens`, `outputTokens`, `cacheReadInputTokens`, `cacheCreationInputTokens` |
| Claude Code | `~/.claude/history.jsonl` | JSONL — all messages with `display`, `timestamp`, `sessionId`, `project` |
| Claude Code | `~/.claude/projects/<path>/*.jsonl` | JSONL — per-project session conversations |
| Codex CLI | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | JSONL — `timestamp`, `type`, `payload` |
| OpenCode | `~/.opencode/storage/session/` | JSON — session metadata |
| OpenCode | `~/.opencode/storage/message/<session_id>/` | JSON — message data per session |

### Claude Code stats-cache.json Structure

```json
{
  "dailyActivity": { "2026-02-20": { "messages": 45, "sessions": 3, "toolCalls": 120 } },
  "dailyModelTokens": {
    "2026-02-20": {
      "claude-opus-4-6": {
        "inputTokens": 50000,
        "outputTokens": 15000,
        "cacheReadInputTokens": 30000,
        "cacheCreationInputTokens": 5000
      }
    }
  },
  "totalSessions": 233,
  "totalMessages": 111000
}
```

### Cost Benchmarks

- Average Claude Code usage: ~$6 per developer per day
- 90% of users under $12/day
- Cache tokens significantly cheaper than regular tokens

---

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Runtime | Bun | Required by OpenTUI |
| TUI Framework | OpenTUI React | Familiar component model, hooks, JSX |
| 3D Rendering | ThreeRenderable (`@opentui/core/3d`) | Native WebGPU via Dawn, no extra pipeline |
| Database | bun:sqlite | Zero-dep, single file, schema-ready for web UI |
| IPC | Unix domain sockets | Daemon ↔ TUI, low latency, local only |
| Anti-tamper | HMAC-SHA256 | Device-specific key, prevents local file editing |
| Genome | 256-bit (32 bytes) | CryptoKitties-inspired, deterministic trait expression |

---

## Future Ideas

- Web UI companion (share/view monsters in browser)
- Gifting system (send eggs to other developers)
- Breeding (combine two monster genomes)
- Server-side authority for true anti-cheat
- Sixel rendering support (when OpenTUI adds it)
- Multiple monsters / monster collection
- Leaderboards based on token consumption
- Species discovery (new species unlock at milestones)
- Battle system between monsters
- Seasonal/limited-edition eggs
