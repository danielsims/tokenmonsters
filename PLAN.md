# Token Monsters - Implementation Plan

## Context

Token Monsters is a TUI virtual pet game where AI token consumption (from Claude Code, Codex, OpenCode, etc.) feeds and evolves digital monsters. Think CryptoKitties genetics + Tamagotchi care loop + Pokemon evolution — rendered as 3D creatures in the terminal via OpenTUI's built-in Three.js WebGPU support.

The goal is a technically excellent foundation: clean data model ready for web UI and social features, pluggable token tracking across AI tools, HMAC-signed monster state for integrity, and gorgeous 3D egg/creature rendering right in the terminal.

**MVP**: Single monster journey — one egg, hatch it, grow it, evolve it. A beautiful terminal companion that grows as you code with AI.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Token Monsters                     │
├──────────────────┬──────────────────────────────────┤
│   TUI App        │   Daemon (background service)    │
│   (OpenTUI React)│   (Bun process)                  │
│                  │                                    │
│  ┌────────────┐  │  ┌──────────────┐                │
│  │ 3D Monster │  │  │ File Watchers│                │
│  │ (ThreeJS)  │  │  │              │                │
│  ├────────────┤  │  │ ~/.claude/   │                │
│  │ Stats UI   │  │  │ ~/.codex/    │                │
│  │ Token Feed │  │  │ ~/.opencode/ │                │
│  ├────────────┤  │  └──────┬───────┘                │
│  │ Game State │  │         │                         │
│  └─────┬──────┘  │  ┌──────▼───────┐                │
│        │         │  │ Token Parser │                │
│        │         │  └──────┬───────┘                │
│  ┌─────▼──────┐  │         │                         │
│  │  SQLite    │◄─┼─────────┘                         │
│  │  Database  │  │  (writes token_feeds rows)        │
│  └────────────┘  │                                    │
└──────────────────┴──────────────────────────────────┘
```

**Two processes:**
1. **Daemon** — background service that watches AI tool log files, parses token usage, writes to shared SQLite database. Runs via macOS `launchd` / Linux `systemd`.
2. **TUI App** — OpenTUI React app that reads from SQLite, runs game logic, renders 3D monster + UI.

Communication is via **shared SQLite database** (simplest, most reliable, naturally persistent).

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Runtime | Bun | Required by OpenTUI, fast, built-in SQLite |
| TUI Framework | OpenTUI React (`@opentui/react`) | Flexbox layout, React hooks, component model |
| 3D Rendering | OpenTUI ThreeRenderable (`@opentui/core/3d`) | Built-in Three.js WebGPU → terminal via Dawn |
| 3D Engine | Three.js | Scene graph, materials, animations |
| Database | bun:sqlite | Zero-dep, single file, great schema support |
| IPC | Shared SQLite | Daemon writes, TUI reads — simple and persistent |
| Integrity | HMAC-SHA256 (node:crypto) | Anti-tamper monster state signing |

---

## Project Structure

```
token-monsters/
├── package.json
├── tsconfig.json
├── src/
│   ├── tui/                        # TUI application
│   │   ├── index.tsx               # Entry point — renderer + React root
│   │   ├── App.tsx                 # Root component, screen routing
│   │   ├── components/
│   │   │   ├── MonsterScene.tsx    # Three.js 3D monster/egg renderer
│   │   │   ├── StatsPanel.tsx     # Hunger/happiness/energy/XP bars
│   │   │   ├── TokenTicker.tsx    # Live token consumption feed
│   │   │   ├── Header.tsx         # Title bar with monster name
│   │   │   └── StatusBar.tsx      # Bottom bar (controls, stage info)
│   │   ├── screens/
│   │   │   ├── HomeScreen.tsx     # Main view: 3D monster + stats + ticker
│   │   │   ├── HatchScreen.tsx    # Egg hatching cinematic
│   │   │   └── InfoScreen.tsx     # Genome traits, history, details
│   │   └── hooks/
│   │       ├── useGameLoop.ts     # Tick-based game updates
│   │       ├── useTokenFeed.ts    # Poll DB for new token feeds
│   │       └── useMonster.ts      # Monster state from DB
│   │
│   ├── daemon/                     # Background token tracking service
│   │   ├── index.ts               # Daemon entry point
│   │   ├── watcher.ts             # File watcher coordinator
│   │   ├── parsers/
│   │   │   ├── claude.ts          # Claude Code log parser
│   │   │   ├── codex.ts           # Codex CLI log parser
│   │   │   ├── opencode.ts        # OpenCode log parser
│   │   │   └── types.ts           # Common token event types
│   │   └── feeder.ts              # Writes parsed tokens to DB
│   │
│   ├── shared/                     # Shared between TUI + daemon
│   │   ├── db/
│   │   │   ├── schema.ts          # SQLite table definitions + migrations
│   │   │   ├── database.ts        # Connection singleton
│   │   │   └── queries.ts         # Typed CRUD operations
│   │   ├── models/
│   │   │   ├── types.ts           # Core type definitions
│   │   │   ├── genome.ts          # 256-bit genome encode/decode
│   │   │   ├── evolution.ts       # Stage transitions, threshold logic
│   │   │   ├── species.ts         # Starter species definitions
│   │   │   └── integrity.ts       # HMAC-SHA256 signing & verification
│   │   └── constants.ts           # Shared constants
│   │
│   └── three/                      # Three.js scene definitions
│       ├── scenes/
│       │   ├── egg.ts             # Egg 3D scene (oval, glow, wobble)
│       │   ├── hatchling.ts       # Baby creature scene
│       │   ├── juvenile.ts        # Growing creature scene
│       │   └── adult.ts           # Full creature scene
│       ├── materials.ts           # Genome-driven materials/colors
│       ├── animations.ts          # Idle, eat, sleep, evolve animations
│       └── utils.ts               # Scene setup helpers, lighting
│
├── install/                        # Daemon installation helpers
│   ├── launchd.plist              # macOS auto-start config
│   └── systemd.service            # Linux auto-start config
│
├── data/                           # Created at runtime
│   └── monsters.db
│
└── tests/
    ├── genome.test.ts
    ├── evolution.test.ts
    ├── integrity.test.ts
    └── parsers/
        ├── claude.test.ts
        ├── codex.test.ts
        └── opencode.test.ts
```

---

## Database Schema

```sql
CREATE TABLE species (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  rarity TEXT NOT NULL CHECK(rarity IN ('common','uncommon','rare','legendary')),
  base_hunger_rate REAL NOT NULL,
  base_happiness_rate REAL NOT NULL,
  evolution_thresholds TEXT NOT NULL   -- JSON
);

CREATE TABLE monsters (
  id TEXT PRIMARY KEY,
  name TEXT,
  species_id TEXT NOT NULL,
  genome BLOB NOT NULL,               -- 32 bytes
  stage TEXT NOT NULL DEFAULT 'egg',
  hunger INTEGER NOT NULL DEFAULT 100,
  happiness INTEGER NOT NULL DEFAULT 100,
  energy INTEGER NOT NULL DEFAULT 100,
  experience INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  hatched_at INTEGER,
  last_fed_at INTEGER,
  last_interaction_at INTEGER,
  evolved_at INTEGER,
  checksum TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'generated',
  origin_from TEXT,
  FOREIGN KEY (species_id) REFERENCES species(id)
);

CREATE TABLE token_feeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monster_id TEXT NOT NULL,
  source TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_tokens INTEGER NOT NULL DEFAULT 0,
  session_id TEXT,
  fed_at INTEGER NOT NULL,
  FOREIGN KEY (monster_id) REFERENCES monsters(id)
);

CREATE TABLE evolution_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monster_id TEXT NOT NULL,
  from_stage TEXT NOT NULL,
  to_stage TEXT NOT NULL,
  evolved_at INTEGER NOT NULL,
  trigger_reason TEXT NOT NULL,
  tokens_at_evolution INTEGER NOT NULL,
  FOREIGN KEY (monster_id) REFERENCES monsters(id)
);

CREATE INDEX idx_token_feeds_monster ON token_feeds(monster_id);
CREATE INDEX idx_token_feeds_fed_at ON token_feeds(fed_at);
CREATE INDEX idx_evolution_history_monster ON evolution_history(monster_id);
```

---

## Genome System (256-bit)

32 bytes, 8 trait categories, 4 bytes each:

| Bytes | Trait | Controls |
|-------|-------|----------|
| 0-3 | Body Shape | Base mesh geometry, proportions |
| 4-7 | Pattern | Surface pattern type/density |
| 8-11 | Primary Color | Main body color (HSL mapped) |
| 12-15 | Secondary Color | Accent/pattern color |
| 16-19 | Eye Style | Shape, size, glow |
| 20-23 | Expression | Mood default, animation style |
| 24-27 | Features | Horns, wings, tail, spikes |
| 28-31 | Special | Particle effects, aura, rarity |

Each 4-byte block = 4 genes x 8 bits. First gene is primary (expressed), rest are hidden (inheritable for future breeding). Gene values 0-255 mapped to trait variants per category.

---

## Evolution Thresholds

| Transition | Token Threshold | Conditions |
|------------|-----------------|------------|
| Egg → Hatchling | ~1,000 tokens | None |
| Hatchling → Juvenile | ~10,000 tokens | Happiness > 50 |
| Juvenile → Adult | ~100,000 tokens | Happiness > 60 |
| Adult → Elder | ~1,000,000 tokens | Happiness > 80 sustained |

---

## Token Log File Locations (confirmed)

| Tool | Path | Format |
|------|------|--------|
| Claude Code | `~/.claude/stats-cache.json` | JSON with `dailyModelTokens` |
| Claude Code | `~/.claude/projects/<path>/*.jsonl` | Per-session JSONL |
| Codex CLI | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | Session JSONL |
| OpenCode | `~/.opencode/storage/session/` | JSON per session |
| OpenCode | `~/.opencode/storage/message/<id>/` | JSON per message |

---

## Implementation Phases

### Phase 1: Foundation
1. Scaffold project with `bunx create-tui@latest -t react`
2. Add deps: `three`, `bun-webgpu`
3. Database schema + connection + typed queries
4. Genome encode/decode module
5. Species definitions (starter set)
6. Monster model + CRUD
7. HMAC integrity module

### Phase 2: Game Engine
8. Game state React Context
9. Game tick loop (stat decay)
10. Feeding system (tokens → XP + hunger)
11. Evolution system (threshold checks + transitions)

### Phase 3: Token Daemon
12. Claude Code parser
13. Codex parser
14. OpenCode parser
15. File watcher coordinator
16. Daemon entry point + SQLite writes
17. launchd/systemd configs

### Phase 4: 3D Rendering
18. Egg Three.js scene (geometry, materials, lighting)
19. Egg idle animation (float/bob)
20. Egg wobble (intensifies near hatch)
21. ThreeRenderable integration in React component

### Phase 5: UI Shell
22. App layout (header + main + status bar)
23. StatsPanel, TokenTicker, Header, StatusBar components
24. HomeScreen assembly
25. Keyboard navigation

### Phase 6: First Run + Hatching
26. First-run detection + egg generation
27. Name prompt
28. Hatch cinematic
29. Post-hatch monster display

### Phase 7: Polish
30. Graceful shutdown
31. Error handling
32. Terminal resize
33. Tests
