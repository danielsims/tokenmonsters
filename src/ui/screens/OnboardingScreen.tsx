import { useState, useCallback, useMemo, useEffect } from "react";
import { execSync } from "child_process";
import { useKeyboard } from "@opentui/react";
import { useMonster } from "../hooks/useMonster";
import {
  getSpeciesById,
  getSetting,
  setSetting,
  isAlreadyClaimed,
  resolveSpeciesByEggName,
} from "../../db/queries";
import { linkWallet } from "../../chain/link";
import { fetchWalletTmonNfts, type WalletNft } from "../../chain/verify";
import { claimEgg } from "../../chain/claim";
import { RegistryPreview } from "../components/RegistryPreview";
import type { Species } from "../../models/types";
import { t, setTheme } from "../theme";

const WELCOME_ART = [
  "  _____ ___  _  _____ _  _   __  __  ___  _  _ ___ _____ ___ ___  ___",
  " |_   _/ _ \\| |/ / __| \\| | |  \\/  |/ _ \\| \\| / __|_   _| __| _ \\/ __|",
  "   | || (_) | ' <| _|| .` | | |\\/| | (_) | .` \\__ \\ | | | _||   /\\__ \\",
  "   |_| \\___/|_|\\_\\___|_|\\_| |_|  |_|\\___/|_|\\_|___/ |_| |___|_|_\\|___/",
].join("\n");

const MINTABLE_SPECIES = [1, 2, 6, 7];

interface RarityTier {
  name: string;
  color: string;
  priceLamports: number;
  supply: number | null; // null = unlimited
}

const RARITY_TIERS: RarityTier[] = [
  { name: "common", color: "#a1a1aa", priceLamports: 200_000_000, supply: null },
  { name: "rare", color: "#c084fc", priceLamports: 1_000_000_000, supply: 1000 },
  { name: "legendary", color: "#4ade80", priceLamports: 5_000_000_000, supply: 500 },
  { name: "founder", color: "#60a5fa", priceLamports: 20_000_000_000, supply: 100 },
];

type Phase = "browse" | "minting" | "linking" | "scanning" | "pick" | "claiming" | "error";

const WEBSITE_URL = process.env.TOKENMONSTERS_WEBSITE_URL || "https://tokenmonsters.vercel.app";

const PINCHY_SPECIES_ID = 1;

function getPrice(tier: RarityTier, speciesId: number): number {
  if (tier.name === "common" && speciesId === PINCHY_SPECIES_ID) return 0;
  return tier.priceLamports;
}

function formatPrice(lamports: number): string {
  if (lamports === 0) return "FREE";
  return `${(lamports / 1_000_000_000).toFixed(2)} SOL`;
}

function getRarityColor(rarity: string): string {
  switch (rarity) {
    case "common": return "#a1a1aa";
    case "uncommon": return "#4ade80";
    case "rare": return "#c084fc";
    default: return "#a1a1aa";
  }
}

function openUrl(url: string): void {
  try {
    if (process.platform === "darwin") {
      execSync(`open "${url}"`);
    } else if (process.platform === "linux") {
      execSync(`xdg-open "${url}"`);
    } else {
      execSync(`start "" "${url}"`);
    }
  } catch {}
}

/** Extract egg name from NFT name (e.g. "Molting Egg #a3f8" → "Molting Egg") */
function extractEggName(nftName: string): string {
  const hashIdx = nftName.lastIndexOf("#");
  return hashIdx > 0 ? nftName.slice(0, hashIdx).trim() : nftName;
}

interface OnboardingProps {
  onComplete: (name: string) => void;
  mode?: "onboarding" | "mint";
}

export function OnboardingScreen({ onComplete, mode = "onboarding" }: OnboardingProps) {
  const { refresh } = useMonster();
  const [phase, setPhase] = useState<Phase>("browse");
  const [eggIndex, setEggIndex] = useState(0);
  const [tierIndex, setTierIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");

  // Force catppuccin theme for onboarding (shop uses current theme)
  useEffect(() => {
    if (mode === "onboarding") {
      setTheme("catppuccin");
      setSetting("theme", "catppuccin");
    }
  }, [mode]);
  const [claimableNfts, setClaimableNfts] = useState<WalletNft[]>([]);
  const [pickIndex, setPickIndex] = useState(0);
  const speciesId = MINTABLE_SPECIES[eggIndex];
  const tier = RARITY_TIERS[tierIndex];
  const species = useMemo(() => getSpeciesById(speciesId), [speciesId]);

  const speciesName = species?.forms[0]?.name ?? "Unknown";
  const description = species?.description ?? "";

  // Resolve species for the currently selected NFT in pick phase
  const selectedNft = phase === "pick" ? claimableNfts[pickIndex] ?? null : null;
  const selectedNftSpecies = useMemo<Species | null>(() => {
    if (!selectedNft) return null;
    const eggName = extractEggName(selectedNft.name);
    return resolveSpeciesByEggName(eggName);
  }, [selectedNft?.mintAddress]);

  const handleLinkAndScan = useCallback(async () => {
    const saved = getSetting("claim_wallet");
    if (saved) {
      setPhase("scanning");
      try {
        const nfts = await fetchWalletTmonNfts(saved);
        const unclaimed = nfts.filter((n) => !isAlreadyClaimed(n.mintAddress));
        if (unclaimed.length === 0) {
          setErrorMessage("No unclaimed eggs found. Mint at tokenmonsters.vercel.app first.");
          setPhase("error");
          return;
        }
        if (unclaimed.length === 1) {
          setPhase("claiming");
          const result = await claimEgg(unclaimed[0].mintAddress, saved);
          if (!result.ok) {
            setErrorMessage(result.message);
            setPhase("error");
            return;
          }
          refresh();
          onComplete("");
          return;
        }
        setClaimableNfts(unclaimed);
        setPickIndex(0);
        setPhase("pick");
      } catch {
        setErrorMessage("Could not reach Solana. Check your connection.");
        setPhase("error");
      }
      return;
    }

    setPhase("linking");
    try {
      const result = await linkWallet();
      if (!result.verified) {
        setErrorMessage("Wallet verification failed. Try again.");
        setPhase("error");
        return;
      }
      setSetting("claim_wallet", result.address);

      setPhase("scanning");
      const nfts = await fetchWalletTmonNfts(result.address);
      const unclaimed = nfts.filter((n) => !isAlreadyClaimed(n.mintAddress));
      if (unclaimed.length === 0) {
        setErrorMessage("No unclaimed eggs found. Mint at tokenmonsters.vercel.app first.");
        setPhase("error");
        return;
      }
      if (unclaimed.length === 1) {
        setPhase("claiming");
        const claimResult = await claimEgg(unclaimed[0].mintAddress, result.address);
        if (!claimResult.ok) {
          setErrorMessage(claimResult.message);
          setPhase("error");
          return;
        }
        refresh();
        onComplete("");
        return;
      }
      setClaimableNfts(unclaimed);
      setPickIndex(0);
      setPhase("pick");
    } catch (err: any) {
      setErrorMessage(err.message || "Wallet linking failed.");
      setPhase("error");
    }
  }, [refresh]);

  const handleClaimNft = useCallback(
    async (mintAddress: string) => {
      setPhase("claiming");
      const wallet = getSetting("claim_wallet");
      if (!wallet) {
        setErrorMessage("No wallet connected.");
        setPhase("error");
        return;
      }
      try {
        const result = await claimEgg(mintAddress, wallet);
        if (!result.ok) {
          setErrorMessage(result.message);
          setPhase("error");
          return;
        }
        refresh();
        onComplete("");
      } catch {
        setErrorMessage("Network error during claim.");
        setPhase("error");
      }
    },
    [refresh],
  );

  useKeyboard((key) => {
    if (phase === "browse") {
      if (key.name === "escape" && mode === "mint") {
        onComplete("");
        return;
      }
      if (key.name === "left") {
        setEggIndex((i) => (i - 1 + MINTABLE_SPECIES.length) % MINTABLE_SPECIES.length);
      } else if (key.name === "right") {
        setEggIndex((i) => (i + 1) % MINTABLE_SPECIES.length);
      } else if (key.name === "up") {
        setTierIndex((i) => Math.min(RARITY_TIERS.length - 1, i + 1));
      } else if (key.name === "down") {
        setTierIndex((i) => Math.max(0, i - 1));
      } else if (key.name === "return") {
        openUrl(`${WEBSITE_URL}?species=${speciesId}&rarity=${tier.name}`);
        setPhase("minting");
      } else if (key.sequence === "c" || key.sequence === "C") {
        handleLinkAndScan();
      }
    } else if (phase === "minting") {
      if (key.name === "return") {
        handleLinkAndScan();
      } else if (key.name === "escape") {
        setPhase("browse");
      }
    } else if (phase === "pick") {
      if (key.name === "up" || key.name === "left") {
        setPickIndex((i) => Math.max(0, i - 1));
      } else if (key.name === "down" || key.name === "right") {
        setPickIndex((i) => Math.min(claimableNfts.length - 1, i + 1));
      } else if (key.name === "return" && claimableNfts[pickIndex]) {
        handleClaimNft(claimableNfts[pickIndex].mintAddress);
      } else if ((key.sequence === "e" || key.sequence === "E") && claimableNfts[pickIndex]) {
        const url = `https://explorer.solana.com/address/${claimableNfts[pickIndex].mintAddress}?cluster=devnet`;
        openUrl(url);
      } else if (key.name === "escape") {
        setPhase("browse");
      }
    } else if (phase === "error") {
      if (key.name === "return") {
        setPhase("browse");
      }
    }
  });

  // Pick phase uses a different layout — 3D preview + egg list side by side
  if (phase === "pick") {
    // Arrange NFTs in columns (max 5 per column)
    const COL_SIZE = 5;
    const columns: WalletNft[][] = [];
    for (let i = 0; i < claimableNfts.length; i += COL_SIZE) {
      columns.push(claimableNfts.slice(i, i + COL_SIZE));
    }

    return (
      <box
        flexDirection="column"
        width="100%"
        height="100%"
        backgroundColor={t.bg.base}
      >
        {/* Header */}
        <box paddingY={1} alignItems="center" justifyContent="center">
          <text fg={t.accent.warm}>{WELCOME_ART}</text>
        </box>

        {/* Main area: 3D preview */}
        <box flexGrow={1} width="100%">
          <RegistryPreview
            key={selectedNft?.mintAddress ?? "none"}
            species={selectedNftSpecies}
            formIndex={0}
          />
        </box>

        {/* Pick panel */}
        <box
          flexDirection="column"
          width="100%"
          paddingX={2}
          paddingY={1}
          height={10}
        >
          <box flexDirection="row" justifyContent="space-between" width="100%">
            <text fg={t.text.primary}>
              <strong>Claim an egg</strong>
              <span fg={t.text.dim}>  {claimableNfts.length} unclaimed</span>
            </text>
            {selectedNft && (
              <text fg={t.text.dim}>
                {selectedNft.mintAddress.slice(0, 4)}...{selectedNft.mintAddress.slice(-4)}
              </text>
            )}
          </box>
          <box height={1} />
          {/* Multi-column egg list */}
          <box flexDirection="row" width="100%">
            {columns.map((col, ci) => (
              <box key={ci} flexDirection="column" width={30}>
                {col.map((nft, ri) => {
                  const globalIdx = ci * COL_SIZE + ri;
                  const isSel = globalIdx === pickIndex;
                  const eggName = extractEggName(nft.name);
                  const sp = resolveSpeciesByEggName(eggName);
                  return (
                    <box key={nft.mintAddress} height={1}>
                      <text fg={isSel ? t.accent.primary : t.text.muted}>
                        {isSel ? "> " : "  "}
                        {nft.name}
                        {sp && <span fg={getRarityColor(sp.rarity)}> {sp.rarity}</span>}
                      </text>
                    </box>
                  );
                })}
              </box>
            ))}
          </box>
          <box height={1} />
          <text fg={t.text.dim}>ENTER  claim   E  explorer   ESC  back</text>
        </box>
      </box>
    );
  }

  // Default layout for all other phases
  return (
    <box
      flexDirection="column"
      alignItems="center"
      width="100%"
      height="100%"
      backgroundColor={t.bg.base}
    >
      {/* ASCII Art Header */}
      <box paddingY={1}>
        <text fg={t.accent.warm}>{WELCOME_ART}</text>
      </box>

      {/* 3D Egg Preview */}
      <box flexGrow={1} width="100%">
        <RegistryPreview key={speciesId} species={species} formIndex={0} />
      </box>

      {/* Info Panel */}
      <box
        flexDirection="column"
        alignItems="center"
        width="100%"
        paddingX={4}
        paddingY={1}
        height={9}
      >
        {phase === "browse" && (
          <>
            <box flexDirection="row" justifyContent="center" width="100%">
              <text fg={t.text.dim}>{"<  "}</text>
              <text><strong fg={t.text.primary}>{speciesName}</strong></text>
              <text fg={t.text.dim}>{"  >"}</text>
            </box>
            <box flexDirection="row" justifyContent="center" width="100%">
              <text fg={tier.color}>
                {tierIndex < RARITY_TIERS.length - 1 ? "^  " : "   "}
                {tier.name}
                {"  "}
                {formatPrice(getPrice(tier, speciesId))}
                {tier.supply ? `  (${tier.supply} per species)` : ""}
                {tierIndex > 0 ? "  v" : ""}
              </text>
            </box>
            <box height={1} />
            <text fg={t.text.muted}>{description}</text>
            <box flexGrow={1} />
            <text fg={t.text.dim}>
              {mode === "mint"
                ? "ENTER mint    C claim    <- -> species    ^ v rarity    ESC back"
                : "ENTER mint    C claim    <- -> species    ^ v rarity"}
            </text>
          </>
        )}

        {phase === "minting" && (
          <>
            <text fg={t.text.primary}>
              Mint your egg at <strong>tokenmonsters.vercel.app</strong>
            </text>
            <box height={1} />
            <text fg={t.text.muted}>A browser window has opened.</text>
            <text fg={t.text.muted}>Complete your mint, then come back here.</text>
            <box height={1} />
            <text fg={t.text.dim}>ENTER  I've minted, claim now   ESC  back</text>
          </>
        )}

        {phase === "linking" && (
          <>
            <text fg={t.text.primary}>Connecting wallet...</text>
            <box height={1} />
            <text fg={t.text.muted}>Sign the message in your browser to verify ownership.</text>
          </>
        )}

        {phase === "scanning" && (
          <text fg={t.text.primary}>Scanning blockchain for your eggs...</text>
        )}

        {phase === "claiming" && <text fg={t.text.primary}>Claiming egg...</text>}

        {phase === "error" && (
          <>
            <text fg="#f87171">{errorMessage}</text>
            <box height={1} />
            <text fg={t.text.dim}>ENTER  try again</text>
          </>
        )}
      </box>
    </box>
  );
}
