import { useState, useCallback, useMemo } from "react";
import { execSync } from "child_process";
import { useKeyboard } from "@opentui/react";
import { useMonster } from "../hooks/useMonster";
import { getSpeciesById, getSetting, setSetting, isAlreadyClaimed } from "../../db/queries";
import { linkWallet } from "../../chain/link";
import { fetchWalletTmonNfts, type WalletNft } from "../../chain/verify";
import { claimEgg } from "../../chain/claim";
import { RegistryPreview } from "../components/RegistryPreview";
import { t } from "../theme";

const WELCOME_ART = [
  "  _____ ___  _  _____ _  _   __  __  ___  _  _ ___ _____ ___ ___  ___",
  " |_   _/ _ \\| |/ / __| \\| | |  \\/  |/ _ \\| \\| / __|_   _| __| _ \\/ __|",
  "   | || (_) | ' <| _|| .` | | |\\/| | (_) | .` \\__ \\ | | | _||   /\\__ \\",
  "   |_| \\___/|_|\\_\\___|_|\\_| |_|  |_|\\___/|_|\\_|___/ |_| |___|_|_\\|___/",
].join("\n");

const MINTABLE_EGGS = [
  { speciesId: 1, priceLamports: 0 },
  { speciesId: 2, priceLamports: 0 },
  { speciesId: 6, priceLamports: 1_000_000_000 },
  { speciesId: 7, priceLamports: 1_000_000_000 },
];

type Phase = "browse" | "naming" | "minting" | "linking" | "scanning" | "pick" | "claiming" | "error";

const WEBSITE_URL = process.env.TOKENMON_WEBSITE_URL || "https://tokenmonsters.sh";

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

export function OnboardingScreen({ onComplete }: { onComplete: (name: string) => void }) {
  const { generateSpecificEgg, nameMonster, refresh } = useMonster();
  const [phase, setPhase] = useState<Phase>("browse");
  const [eggIndex, setEggIndex] = useState(0);
  const [name, setName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [claimableNfts, setClaimableNfts] = useState<WalletNft[]>([]);
  const [pickIndex, setPickIndex] = useState(0);

  const egg = MINTABLE_EGGS[eggIndex];
  const species = useMemo(() => getSpeciesById(egg.speciesId), [egg.speciesId]);

  const speciesName = species?.forms[0]?.name ?? "Unknown";
  const rarity = species?.rarity ?? "common";
  const description = species?.description ?? "";

  const handleLinkAndScan = useCallback(async () => {
    const saved = getSetting("claim_wallet");
    if (saved) {
      setPhase("scanning");
      try {
        const nfts = await fetchWalletTmonNfts(saved);
        const unclaimed = nfts.filter((n) => !isAlreadyClaimed(n.mintAddress));
        if (unclaimed.length === 0) {
          setErrorMessage("No unclaimed eggs found. Mint at tokenmonsters.sh first.");
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
          setPhase("naming");
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
        setErrorMessage("No unclaimed eggs found. Mint at tokenmonsters.sh first.");
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
        setPhase("naming");
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
        setPhase("naming");
      } catch {
        setErrorMessage("Network error during claim.");
        setPhase("error");
      }
    },
    [refresh],
  );

  useKeyboard((key) => {
    if (phase === "browse") {
      if (key.name === "left") {
        setEggIndex((i) => (i - 1 + MINTABLE_EGGS.length) % MINTABLE_EGGS.length);
      } else if (key.name === "right") {
        setEggIndex((i) => (i + 1) % MINTABLE_EGGS.length);
      } else if (key.name === "return") {
        if (egg.priceLamports === 0) {
          generateSpecificEgg(egg.speciesId);
          setPhase("naming");
        } else {
          openUrl(WEBSITE_URL);
          setPhase("minting");
        }
      }
    } else if (phase === "naming") {
      if (key.name === "return" && name.length > 0) {
        nameMonster(name);
        onComplete(name);
      } else if (key.name === "backspace" || key.name === "delete") {
        setName((n) => n.slice(0, -1));
      } else if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        setName((n) => n + key.sequence);
      }
    } else if (phase === "minting") {
      if (key.name === "return") {
        handleLinkAndScan();
      } else if (key.name === "escape") {
        setPhase("browse");
      }
    } else if (phase === "pick") {
      if (key.name === "up") {
        setPickIndex((i) => Math.max(0, i - 1));
      } else if (key.name === "down") {
        setPickIndex((i) => Math.min(claimableNfts.length - 1, i + 1));
      } else if (key.name === "return" && claimableNfts[pickIndex]) {
        handleClaimNft(claimableNfts[pickIndex].mintAddress);
      } else if (key.name === "escape") {
        setPhase("browse");
      }
    } else if (phase === "error") {
      if (key.name === "return") {
        setPhase("browse");
      }
    }
  });

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
        <RegistryPreview key={egg.speciesId} species={species} formIndex={0} />
      </box>

      {/* Info Panel */}
      <box
        flexDirection="column"
        alignItems="center"
        width="100%"
        paddingX={4}
        paddingY={1}
        height={10}
      >
        {phase === "browse" && (
          <>
            <box flexDirection="row" justifyContent="center" width="100%">
              <text fg={t.text.dim}>{"<  "}</text>
              <text>
                <strong fg={t.text.primary}>{speciesName}</strong>
              </text>
              <text fg={getRarityColor(rarity)}>{"  " + rarity}</text>
              <text fg={t.text.dim}>{"  >"}</text>
            </box>
            <text fg={t.text.muted}>{description}</text>
            <box height={1} />
            <text fg={t.text.primary}>
              <strong>
                {egg.priceLamports === 0
                  ? "ENTER  Get Egg — FREE"
                  : `ENTER  Mint — ${formatPrice(egg.priceLamports)}`}
              </strong>
            </text>
            <box height={1} />
            <text fg={t.text.dim}>{"<- -> browse   ENTER select"}</text>
          </>
        )}

        {phase === "naming" && (
          <>
            <text fg={t.accent.green}>A mysterious egg appears before you...</text>
            <box height={1} />
            <text fg={t.text.primary}>
              <strong>Name your creature:</strong>
            </text>
            <box height={1} />
            <box
              border
              borderStyle="rounded"
              borderColor={t.border.muted}
              paddingX={2}
              width={40}
            >
              <text fg={name.length > 0 ? t.text.primary : t.text.dim}>
                {name.length > 0 ? name : "Type a name..."}
                <span fg={t.accent.primary}>_</span>
              </text>
            </box>
            <box height={1} />
            <text fg={t.text.dim}>Press ENTER to confirm</text>
          </>
        )}

        {phase === "minting" && (
          <>
            <text fg={t.text.primary}>
              Mint your egg at <strong>tokenmonsters.sh</strong>
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

        {phase === "pick" && (
          <>
            <text fg={t.text.primary}>
              Found {claimableNfts.length} unclaimed egg
              {claimableNfts.length !== 1 ? "s" : ""}
            </text>
            <box height={1} />
            {claimableNfts.map((nft, i) => (
              <box key={nft.mintAddress} height={1}>
                <text fg={i === pickIndex ? t.accent.primary : t.text.muted}>
                  {i === pickIndex ? "> " : "  "}
                  {nft.name}
                </text>
              </box>
            ))}
            <box height={1} />
            <text fg={t.text.dim}>ENTER  claim   ESC  back</text>
          </>
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
