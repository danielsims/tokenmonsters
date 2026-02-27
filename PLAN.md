# Token Monsters — Implementation Plan

## Context

Token Monsters is a TUI virtual pet game where AI token consumption (from Claude Code, Codex, OpenCode, etc.) feeds and evolves digital monsters. Think CryptoKitties genetics + Tamagotchi care loop + Pokemon evolution — rendered as 3D creatures in the terminal via OpenTUI's built-in Three.js WebGPU support.

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
│                  │                                    │
│  ┌────────────┐  │  ┌──────────────┐                │
│  │  Website   │  │  │  Solana      │                │
│  │  (Next.js) │──┼──│  Blockchain  │                │
│  │  Minting   │  │  │  (devnet)    │                │
│  └────────────┘  │  └──────────────┘                │
└──────────────────┴──────────────────────────────────┘
```

**Three components:**
1. **Daemon** — background service that watches AI tool log files, parses token usage, writes to shared SQLite database. Runs via macOS `launchd` / Linux `systemd`.
2. **TUI App** — OpenTUI React app that reads from SQLite, runs game logic, renders 3D monster + UI. Claims minted NFTs from blockchain.
3. **Website** — Next.js app on Vercel for minting egg NFTs on Solana. Links to game via localhost OAuth-style callback.

Communication: daemon ↔ TUI via **shared SQLite**, website ↔ TUI via **localhost HTTP callback + on-chain data**.

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
| Blockchain | Solana (devnet → mainnet-beta) | NFT minting and ownership verification |
| NFT Standard | Metaplex Token Metadata | On-chain metadata, digital assets |
| Website | Next.js + Tailwind | Minting UI, wallet linking |
| Wallet | Phantom (browser extension) | Solana wallet for signing + ownership |
| Crypto | `@noble/curves/ed25519` | Wallet signature verification (transitive dep) |

---

## Project Structure

```
token-monsters/
├── package.json
├── tsconfig.json
├── bin/tokenmon                    # CLI entry point
├── src/
│   ├── index.tsx                   # TUI entry point
│   ├── ui/
│   │   ├── App.tsx                 # Root component, screen routing
│   │   ├── components/
│   │   │   ├── RegistryPreview.tsx # Three.js 3D monster/egg renderer
│   │   │   ├── StatsPanel.tsx     # Hunger/happiness/energy/XP bars
│   │   │   ├── TokenTicker.tsx    # Live token consumption feed
│   │   │   ├── Header.tsx         # Title bar with monster name
│   │   │   └── StatusBar.tsx      # Bottom bar (controls, stage info)
│   │   ├── screens/
│   │   │   ├── HomeScreen.tsx     # Main view: 3D monster + stats + ticker
│   │   │   ├── PartyScreen.tsx    # Party management + claim flow
│   │   │   ├── RegistryScreen.tsx # Species registry (on-chain discovered)
│   │   │   └── InfoScreen.tsx     # Genome traits, history, details
│   │   ├── hooks/
│   │   │   ├── useGameLoop.ts     # Tick-based game updates
│   │   │   ├── useTokenFeed.ts    # Poll DB for new token feeds
│   │   │   └── useMonster.ts      # Monster state from DB
│   │   └── theme.ts               # Multi-theme system (5 themes)
│   │
│   ├── chain/                      # Blockchain integration
│   │   ├── claim.ts               # Claim minted NFTs into game
│   │   ├── verify.ts              # On-chain ownership + metadata verification
│   │   ├── link.ts                # OAuth-style wallet linking via browser
│   │   ├── wallet.ts              # WalletConnect session + QR generation
│   │   ├── mint.ts                # NFT minting (from TUI)
│   │   ├── metadata.ts            # Metaplex metadata builder
│   │   └── config.ts              # Network config (devnet/mainnet-beta)
│   │
│   ├── daemon/                     # Background token tracking service
│   │   ├── index.ts               # Daemon entry point
│   │   ├── watcher.ts             # File watcher coordinator
│   │   └── parsers/
│   │       ├── claude.ts          # Claude Code log parser
│   │       ├── codex.ts           # Codex CLI log parser
│   │       └── opencode.ts        # OpenCode log parser
│   │
│   ├── db/
│   │   ├── schema.ts              # SQLite DDL + migrations
│   │   ├── database.ts            # Connection singleton
│   │   └── queries.ts             # Typed CRUD operations
│   │
│   ├── models/
│   │   ├── types.ts               # Core type definitions
│   │   ├── genome.ts              # 256-bit genome encode/decode
│   │   ├── evolution.ts           # Stage transitions, threshold logic
│   │   ├── level.ts               # XP → level calculation
│   │   └── integrity.ts           # HMAC-SHA256 signing & verification
│   │
│   ├── game/
│   │   └── context.tsx            # React context for active monster
│   │
│   └── three/                      # Three.js 3D assets
│       ├── models/*.glb           # GLB model files per form
│       └── config.ts              # Per-model brightness/tint/scale
│
├── web/                            # Minting website (Next.js)
│   ├── src/app/
│   │   ├── page.tsx               # Mint page (egg viewer + wallet connect)
│   │   ├── link/page.tsx          # Wallet linking page (OAuth callback)
│   │   └── layout.tsx             # Root layout with WalletProvider
│   ├── src/components/
│   │   ├── EggViewer.tsx          # Three.js egg 3D viewer
│   │   └── WalletButton.tsx       # Wallet connect/disconnect
│   ├── src/lib/
│   │   ├── species.ts             # Species definitions for web
│   │   └── mint.ts                # Client-side minting logic
│   └── src/providers/
│       └── WalletProvider.tsx     # Solana wallet adapter setup
│
├── daemon/                         # Daemon process files
│   └── index.ts
│
├── tests/
│   ├── integrity.test.ts
│   ├── evolution.test.ts
│   ├── feeding.test.ts
│   └── chain.test.ts
│
└── data/ (~/.tokenmon/)            # Runtime data
    ├── monsters.db                 # SQLite database
    ├── hmac.key                    # Per-install HMAC signing key
    └── wallet-session.json         # WalletConnect session
```

---

## Database Schema

```sql
CREATE TABLE species (
  id TEXT PRIMARY KEY,
  description TEXT,
  rarity TEXT NOT NULL CHECK(rarity IN ('common','uncommon','rare','legendary')),
  base_hunger_rate REAL NOT NULL,
  base_happiness_rate REAL NOT NULL,
  forms TEXT NOT NULL              -- JSON array of EvolutionForm
);

CREATE TABLE monsters (
  id TEXT PRIMARY KEY,
  name TEXT,
  species_id INTEGER NOT NULL,
  genome BLOB NOT NULL,            -- 32 bytes (256-bit)
  stage TEXT NOT NULL DEFAULT 'egg' CHECK(stage IN ('egg','hatchling','prime','apex')),
  hunger INTEGER NOT NULL DEFAULT 100 CHECK(hunger BETWEEN 0 AND 100),
  happiness INTEGER NOT NULL DEFAULT 100 CHECK(happiness BETWEEN 0 AND 100),
  energy INTEGER NOT NULL DEFAULT 100 CHECK(energy BETWEEN 0 AND 100),
  experience INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  hatched_at INTEGER,
  last_fed_at INTEGER,
  last_interaction_at INTEGER,
  evolved_at INTEGER,
  checksum TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'generated' CHECK(origin IN ('generated','gifted','minted')),
  origin_from TEXT,
  mint_address TEXT,               -- Solana NFT mint address (if on-chain)
  mint_network TEXT,               -- 'devnet' or 'mainnet-beta'
  claimed_by TEXT,                 -- Wallet address that claimed this monster
  FOREIGN KEY (species_id) REFERENCES species(id)
);

CREATE TABLE token_feeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monster_id TEXT NOT NULL,
  source TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_tokens INTEGER NOT NULL DEFAULT 0,
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

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
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

## Token Log File Locations

| Tool | Path | Format |
|------|------|--------|
| Claude Code | `~/.claude/stats-cache.json` | JSON with `dailyModelTokens` |
| Claude Code | `~/.claude/projects/<path>/*.jsonl` | Per-session JSONL |
| Codex CLI | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | Session JSONL |
| OpenCode | `~/.opencode/storage/session/` | JSON per session |
| OpenCode | `~/.opencode/storage/message/<id>/` | JSON per message |

---

## Blockchain Integration

### Minting Flow (Website → Chain)
1. User visits website, connects Phantom wallet
2. Browses egg species (3D viewer), picks one to mint
3. Website builds Metaplex NFT with: name, TMON symbol, genome, species, rarity
4. User approves transaction in Phantom
5. NFT minted on Solana (devnet for now)
6. User gets mint address + claim command

### Claim Flow (Chain → Game)
1. In party screen, user presses Enter on "Claim Egg"
2. Game opens browser for wallet linking (OAuth-style localhost callback)
3. User connects Phantom, wallet address verified via Ed25519 signature
4. Game scans wallet for TMON NFTs via `fetchAllDigitalAssetByOwner`
5. User picks unclaimed NFT from list
6. `verifyOwnership()` confirms wallet owns the NFT on-chain
7. Monster created locally with `origin: "minted"`, genome derived from mint address

### Push-to-Chain Flow (Game → Chain) [FUTURE]
1. Monster evolves locally (egg → hatchling → prime → apex)
2. Player wants to publish evolution on-chain
3. Game verifies local integrity + on-chain metadata match
4. New NFT minted with evolved form metadata
5. Player pays minting fee

---

# Security Architecture

## Threat Model

The game is single-player and offline, but will have social features (trading, battling, leaderboards) and a "push to chain" flow for evolved monsters. The security boundary:

- **Local game state is inherently editable** — it's a file on the user's computer. No amount of local checksumming stops a determined attacker. But it raises the bar and detects casual tampering.
- **The blockchain is the source of truth** — on-chain data (genome, species, rarity) can't be faked. Any chain interaction MUST verify against on-chain state.
- **Wallet ownership must be proven cryptographically** — not just "what address did the browser send back."

---

## Four Security Layers

### Layer 1: Wallet Signature Authentication

**Problem:** The link flow sends back a wallet address via localhost redirect. Anyone can craft a URL with any address — no proof they control the wallet.

**Fix:** Challenge-response signature verification.

1. Game generates a random nonce: `tokenmon-link:{timestamp}:{random}`
2. Opens browser: `/link?port=X&nonce=NONCE`
3. Website prompts user to sign the nonce with Phantom (`wallet.signMessage()`)
4. Redirect: `localhost:PORT/wallet?address=X&signature=SIG&message=MSG`
5. Game verifies Ed25519 signature using `@noble/curves/ed25519` (already a transitive dep)
6. Now we KNOW the user controls this wallet

**Files:**
- `src/chain/link.ts` — nonce generation, accept signature in callback, verify Ed25519
- `web/src/app/link/page.tsx` — `signMessage()` after wallet connect, encode sig in redirect

---

### Layer 2: Ownership Verification on Claim

**Problem:** `claimEgg(mintAddress)` never calls `verifyOwnership()`. Anyone who knows a mint address can claim it. The function exists in verify.ts but is never used.

**Fix:** Require verified wallet + check on-chain ownership before creating monster.

- `claimEgg(mintAddress)` → `claimEgg(mintAddress, walletAddress)`
- Call `verifyOwnership(mintAddress, walletAddress)` — already exists, never called
- New error: `"not_owner"` — "You don't own this NFT"
- Store `claimedBy: walletAddress` on monster (new field)
- PartyScreen passes saved wallet address through

**Files:**
- `src/chain/claim.ts` — add wallet param, call verifyOwnership, set claimedBy
- `src/ui/screens/PartyScreen.tsx` — pass wallet to claimEgg
- `src/models/types.ts` — add `claimedBy: string | null`
- `src/db/schema.ts` — add `claimed_by TEXT` column migration
- `src/db/queries.ts` — update createMonster INSERT and rowToMonster

---

### Layer 3: Improved HMAC Signing

**Problem:** `serializeForSigning()` doesn't include `mintAddress`, `mintNetwork`, or `claimedBy`. DB edits to add fake mint addresses pass checksum. `verifyMonster()` is never called on load.

**3a. Expand signed fields:**
Add to `serializeForSigning()`: `mintAddress`, `mintNetwork`, `claimedBy`

**3b. Verify on load:**
Call `verifyMonster()` in `rowToMonster()`. Add transient `tampered: boolean` to Monster (computed at load, not stored). Tampered monsters:
- Still appear in party (don't destroy progress over a bug)
- Show warning in UI
- Cannot push to chain or participate in social features (future)

**3c. Re-sign migration:**
Schema migration loads all monsters, recomputes checksums with new fields, updates DB.

**Files:**
- `src/models/integrity.ts` — add mint fields to serializeForSigning
- `src/models/types.ts` — add `tampered: boolean`
- `src/db/queries.ts` — verify in rowToMonster, set tampered flag
- `src/db/schema.ts` — migration: add claimed_by column + re-sign all monsters

---

### Layer 4: On-Chain Verification Gate

**Problem:** Even with all local checks, local data can be forged. Before any chain interaction, verify against blockchain.

**Fix:** `verifyMonsterOnChain(monster)`:
1. Check local HMAC (fast, offline)
2. Fetch on-chain metadata for mintAddress
3. Compare genome (on-chain Genome attribute vs local genome hex)
4. Compare species (on-chain egg name vs local species)
5. Compare rarity (on-chain vs local)
6. Optionally verify wallet still owns it

This gates ALL future chain interactions. Even if every local check is bypassed, this catches it.

**Files:**
- `src/chain/verify.ts` — add `verifyMonsterOnChain()`

---

## Implementation Order

1. **Schema + types** — `claimed_by` column, Monster interface updates, `tampered` field
2. **HMAC signing** — expand signed fields, verify-on-load, re-sign migration
3. **Ownership verification** — update claimEgg to require wallet + verify on-chain
4. **Wallet signature auth** — challenge-response in link flow (game + website)
5. **On-chain verification gate** — verifyMonsterOnChain function
6. **Update tests** — add claimedBy to all mock monster factories

## NOT Building Now

- **Founder rarity** — noted for later (new CHECK value + TypeScript type)
- **Push-to-chain flow** — on-chain verification gate is the foundation
- **Trading/battling** — will use verifyMonsterOnChain as prerequisite
- **Server-side verification** — for leaderboards etc., same on-chain checks
