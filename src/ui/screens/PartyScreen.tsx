import { useState, useMemo, useCallback } from "react";
import { execSync } from "child_process";
import { useKeyboard } from "@opentui/react";
import { getAllMonsters, getSpeciesById, isAlreadyClaimed, getSetting, setSetting, resolveSpeciesByEggName } from "../../db/queries";
import { useGame } from "../../game/context";
import { getCurrentForm } from "../../models/evolution";
import { getLevel } from "../../models/level";
import { RegistryPreview } from "../components/RegistryPreview";
import { StatusBar } from "../components/StatusBar";
import { PARTY_MAX } from "../../db/queries";
import { claimEgg } from "../../chain/claim";
import { linkWallet } from "../../chain/link";
import { fetchWalletTmonNfts, type WalletNft } from "../../chain/verify";
import type { Monster, Species, Stage } from "../../models/types";
import { t } from "../theme";

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

const LIST_WIDTH = 34;
const PICK_COL_SIZE = 5;

/** Extract egg name from NFT name (e.g. "Molting Egg #a3f8" → "Molting Egg") */
function extractEggName(nftName: string): string {
  const hashIdx = nftName.lastIndexOf("#");
  return hashIdx > 0 ? nftName.slice(0, hashIdx).trim() : nftName;
}

function getRarityColor(rarity: string): string {
  switch (rarity) {
    case "common": return "#a1a1aa";
    case "uncommon": return "#4ade80";
    case "rare": return "#c084fc";
    default: return "#a1a1aa";
  }
}

const STAGE_LABELS: Record<Stage, string> = {
  egg: "Egg",
  hatchling: "Hatchling",
  prime: "Prime",
  apex: "Apex",
};

type Mode = "list" | "linking" | "wallet_input" | "scanning" | "pick" | "claiming" | "result";

interface PartyEntry {
  monster: Monster;
  species: Species;
  formName: string;
  level: number;
  formIndex: number;
}

interface ClaimableNft {
  nft: WalletNft;
  alreadyClaimed: boolean;
}

export function PartyScreen({ onSwitch }: { onSwitch?: () => void }) {
  const { monster: activeMonster, switchMonster, refresh } = useGame();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState<Mode>("list");
  const [walletInput, setWalletInput] = useState(() => getSetting("claim_wallet") ?? "");
  const [claimableNfts, setClaimableNfts] = useState<ClaimableNft[]>([]);
  const [pickIndex, setPickIndex] = useState(0);
  const [claimResult, setClaimResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const entries = useMemo(() => {
    const monsters = getAllMonsters();
    const list: PartyEntry[] = [];
    for (const m of monsters) {
      const sp = getSpeciesById(m.speciesId);
      if (!sp) continue;
      const form = getCurrentForm(sp, m.stage);
      const formName = form?.name ?? m.stage;
      const level = getLevel(m.experience);
      const formIndex = sp.forms.findIndex((f) => f.stage === m.stage);
      list.push({ monster: m, species: sp, formName, level, formIndex: Math.max(0, formIndex) });
    }
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMonster?.id, refreshKey]);

  const emptySlots = PARTY_MAX - entries.length;
  // Selectable indices: 0..entries.length-1 are monsters, entries.length is the claim row
  // Empty slots are visual only, not selectable
  const claimRowIndex = entries.length;
  const maxIndex = claimRowIndex;
  const isClaimSelected = selectedIndex === claimRowIndex;
  const selected = isClaimSelected ? null : (entries[selectedIndex] ?? null);

  // Resolve species for the currently selected NFT in pick mode
  const unclaimedNfts = useMemo(
    () => claimableNfts.filter((c) => !c.alreadyClaimed),
    [claimableNfts],
  );
  const selectedNft = mode === "pick" ? unclaimedNfts[pickIndex]?.nft ?? null : null;
  const selectedNftSpecies = useMemo<Species | null>(() => {
    if (!selectedNft) return null;
    const eggName = extractEggName(selectedNft.name);
    return resolveSpeciesByEggName(eggName);
  }, [selectedNft?.mintAddress]);

  const handleScanWallet = useCallback(async (address: string) => {
    setMode("scanning");
    setScanError(null);
    const trimmed = address.trim();
    try {
      setSetting("claim_wallet", trimmed);
      const nfts = await fetchWalletTmonNfts(trimmed);
      if (nfts.length === 0) {
        setScanError("No Token Monsters NFTs found in this wallet.");
        setMode("result");
        setClaimResult({ ok: false, message: "No Token Monsters NFTs found in this wallet." });
        return;
      }
      const claimable = nfts.map((nft) => ({
        nft,
        alreadyClaimed: isAlreadyClaimed(nft.mintAddress),
      }));
      setClaimableNfts(claimable);
      setPickIndex(0);
      setMode("pick");
    } catch {
      setScanError("Could not reach Solana. Check your connection.");
      setMode("result");
      setClaimResult({ ok: false, message: "Could not reach Solana. Check your connection." });
    }
  }, []);

  const handleClaimNft = useCallback(async (mintAddress: string) => {
    setMode("claiming");
    try {
      const result = await claimEgg(mintAddress, walletInput);
      if (result.ok) {
        const sp = getSpeciesById(result.monster.speciesId);
        const eggName = sp?.forms[0]?.name ?? "Egg";
        setClaimResult({ ok: true, message: `${eggName} claimed!` });
        setRefreshKey((k) => k + 1);
        refresh();
      } else {
        setClaimResult({ ok: false, message: result.message });
      }
    } catch {
      setClaimResult({ ok: false, message: "Network error." });
    }
    setMode("result");
  }, [refresh]);

  const handleLinkWallet = useCallback(async (opts?: { fresh?: boolean }) => {
    setMode("linking");
    try {
      const result = await linkWallet(opts);
      if (!result.verified) {
        setClaimResult({ ok: false, message: "Wallet signature verification failed. Try again." });
        setMode("result");
        return;
      }
      setWalletInput(result.address);
      setSetting("claim_wallet", result.address);
      // Immediately scan after linking
      handleScanWallet(result.address);
    } catch (err: any) {
      setClaimResult({ ok: false, message: err.message || "Wallet linking failed." });
      setMode("result");
    }
  }, [handleScanWallet]);

  useKeyboard((key) => {
    if (mode === "list") {
      if (key.name === "up") setSelectedIndex((i) => Math.max(0, i - 1));
      if (key.name === "down") setSelectedIndex((i) => Math.min(maxIndex, i + 1));
      if (key.name === "return") {
        if (isClaimSelected) {
          setClaimResult(null);
          setScanError(null);
          setClaimableNfts([]);
          if (walletInput.trim().length > 0) {
            // Have a saved wallet — scan directly
            handleScanWallet(walletInput);
          } else {
            // No wallet saved — open browser to link
            handleLinkWallet();
          }
        } else if (selected) {
          switchMonster(selected.monster.id);
          onSwitch?.();
        }
      }
      // Open explorer for minted monster
      if ((key.sequence === "e" || key.sequence === "E") && selected?.monster.mintAddress) {
        const cluster = selected.monster.mintNetwork === "mainnet-beta" ? "" : "?cluster=devnet";
        const url = `https://explorer.solana.com/address/${selected.monster.mintAddress}${cluster}`;
        openUrl(url);
      }
      // Allow changing wallet address with 'w' when on the claim row
      if (isClaimSelected && key.sequence === "w") {
        setClaimResult(null);
        setScanError(null);
        setWalletInput("");
        // Open browser to link a different wallet
        handleLinkWallet({ fresh: true });
      }
    } else if (mode === "wallet_input") {
      if (key.name === "escape") {
        setMode("list");
      } else if (key.name === "return" && walletInput.trim().length > 0) {
        handleScanWallet(walletInput);
      } else if (key.name === "backspace" || key.name === "delete") {
        setWalletInput((v) => v.slice(0, -1));
      } else if (key.ctrl && key.name === "v") {
        // Ctrl+V — read clipboard directly (Cmd+V doesn't reach TUI apps)
        try {
          const clip = execSync(
            process.platform === "darwin" ? "pbpaste" : "xclip -selection clipboard -o",
            { encoding: "utf-8", timeout: 1000 },
          ).trim();
          if (clip) setWalletInput((v) => v + clip);
        } catch {}
      } else if (key.sequence && !key.ctrl && !key.meta) {
        setWalletInput((v) => v + key.sequence);
      }
    } else if (mode === "pick") {
      if (key.name === "escape") {
        setMode("list");
      } else if (key.name === "up") {
        setPickIndex((i) => Math.max(0, i - 1));
      } else if (key.name === "down") {
        setPickIndex((i) => Math.min(unclaimedNfts.length - 1, i + 1));
      } else if (key.name === "left") {
        setPickIndex((i) => Math.max(0, i - PICK_COL_SIZE));
      } else if (key.name === "right") {
        setPickIndex((i) => Math.min(unclaimedNfts.length - 1, i + PICK_COL_SIZE));
      } else if (key.name === "return" && unclaimedNfts[pickIndex]) {
        handleClaimNft(unclaimedNfts[pickIndex].nft.mintAddress);
      } else if ((key.sequence === "e" || key.sequence === "E") && unclaimedNfts[pickIndex]) {
        const url = `https://explorer.solana.com/address/${unclaimedNfts[pickIndex].nft.mintAddress}?cluster=devnet`;
        openUrl(url);
      }
    } else if (mode === "result") {
      if (key.name === "return" || key.name === "escape") {
        setMode("list");
      }
    }
  });

  return (
    <box flexDirection="column" width="100%" height="100%">
      {/* Header */}
      <box
        flexDirection="row"
        justifyContent="space-between"
        paddingX={2}
        height={3}
        borderStyle="rounded"
        border
        borderColor={t.border.muted}
        backgroundColor={t.bg.base}
      >
        <text>
          <strong fg={t.text.primary}>Party</strong>
          <span fg={t.text.dim}>  {entries.length}/{PARTY_MAX}</span>
        </text>
      </box>

      {/* Main content */}
      <box flexDirection="row" flexGrow={1}>
        {/* Left: Monster list */}
        <box
          width={LIST_WIDTH}
          flexDirection="column"
          borderStyle="rounded"
          border
          borderColor={t.border.muted}
          backgroundColor={t.bg.surface}
          overflow="hidden"
        >
          {entries.map((entry, i) => {
            const isSel = i === selectedIndex && mode === "list";
            const isActive = entry.monster.id === activeMonster?.id;
            const cursor = isSel ? "> " : "  ";
            const activeTag = isActive ? " *" : "";

            return (
              <box
                key={entry.monster.id}
                flexDirection="row"
                justifyContent="space-between"
                paddingX={1}
                height={1}
                backgroundColor={isSel ? t.bg.overlay : undefined}
              >
                <text fg={isActive ? t.accent.primary : (isSel ? t.text.primary : t.text.muted)}>
                  {cursor}{entry.formName}{activeTag}
                </text>
                <text fg={t.text.dim}>Lv.{entry.level}</text>
              </box>
            );
          })}
          {/* Empty slots */}
          {Array.from({ length: emptySlots }).map((_, i) => (
            <box key={`empty-${i}`} paddingX={1} height={1}>
              <text fg={t.text.hidden}>  ---</text>
            </box>
          ))}
          {/* Claim Egg row */}
          <box height={1} />
          <box
            paddingX={1}
            height={1}
            backgroundColor={isClaimSelected && mode === "list" ? t.bg.overlay : undefined}
          >
            <text fg={isClaimSelected && mode === "list" ? t.accent.primary : t.text.dim}>
              {isClaimSelected && mode === "list" ? "> " : "  "}Claim Egg
            </text>
          </box>
        </box>

        {/* Right: Preview + Details */}
        <box flexGrow={1} flexDirection="column">
          {/* 3D Preview */}
          <box flexGrow={1}>
            {mode === "pick" && selectedNftSpecies ? (
              <RegistryPreview
                key={selectedNft?.mintAddress ?? "pick"}
                species={selectedNftSpecies}
                formIndex={0}
              />
            ) : selected ? (
              <RegistryPreview
                key={selected.monster.id}
                species={selected.species}
                formIndex={selected.formIndex}
                locked={false}
              />
            ) : (
              <box
                justifyContent="center"
                alignItems="center"
                flexGrow={1}
                backgroundColor={t.bg.surface}
              >
                <text fg={t.text.hidden}>{isClaimSelected ? "" : "No monsters"}</text>
              </box>
            )}
          </box>

          {/* Detail panel */}
          <box
            height={12}
            flexDirection="column"
            borderStyle="rounded"
            border
            borderColor={t.border.muted}
            backgroundColor={t.bg.surface}
            paddingX={2}
            paddingY={1}
          >
            {mode === "linking" ? (
              <box flexDirection="column">
                <text fg={t.text.primary}>Linking wallet...</text>
                <box height={1} />
                <text fg={t.text.muted}>A browser window has opened.</text>
                <text fg={t.text.dim}>Connect your Phantom wallet there.</text>
              </box>
            ) : mode === "wallet_input" ? (
              <WalletInputPanel input={walletInput} />
            ) : mode === "scanning" ? (
              <box flexDirection="column">
                <text fg={t.text.muted}>Scanning wallet for Token Monsters...</text>
              </box>
            ) : mode === "pick" ? (
              <NftPickPanel nfts={claimableNfts} pickIndex={pickIndex} />
            ) : mode === "claiming" ? (
              <box flexDirection="column">
                <text fg={t.text.muted}>Claiming egg...</text>
              </box>
            ) : mode === "result" && claimResult ? (
              <ClaimResultPanel result={claimResult} />
            ) : selected ? (
              <MonsterDetail entry={selected} isActive={selected.monster.id === activeMonster?.id} />
            ) : isClaimSelected ? (
              <box flexDirection="column">
                <text fg={t.text.primary}>Claim Egg</text>
                <box height={1} />
                <text fg={t.text.muted}>Import eggs minted on the Token Monsters website.</text>
                <text fg={t.text.dim}>
                  {walletInput
                    ? `Wallet: ${walletInput.slice(0, 4)}...${walletInput.slice(-4)}`
                    : "Connect your wallet to scan for unclaimed eggs."}
                </text>
                <box height={1} />
                <text fg={t.text.dim}>[Enter] {walletInput ? "scan" : "connect"}{walletInput ? "  [w] change wallet" : ""}</text>
              </box>
            ) : (
              <text fg={t.text.hidden}>No monster selected.</text>
            )}
          </box>
        </box>
      </box>

      <StatusBar />
    </box>
  );
}

function WalletInputPanel({ input }: { input: string }) {
  return (
    <box flexDirection="column">
      <text fg={t.text.primary}>Wallet address</text>
      <box height={1} />
      <text fg={input.length > 0 ? t.accent.primary : t.text.dim}>
        {input.length > 0 ? input : "Paste wallet address..."}
        <span fg={t.accent.primary}>_</span>
      </text>
      <box height={1} />
      <text fg={t.text.dim}>[Ctrl+V] paste  [Enter] scan  [Esc] cancel</text>
    </box>
  );
}

function NftPickPanel({ nfts, pickIndex }: { nfts: ClaimableNft[]; pickIndex: number }) {
  const unclaimed = nfts.filter((c) => !c.alreadyClaimed);
  const claimedCount = nfts.length - unclaimed.length;

  // Arrange NFTs in columns
  const columns: ClaimableNft[][] = [];
  for (let i = 0; i < unclaimed.length; i += PICK_COL_SIZE) {
    columns.push(unclaimed.slice(i, i + PICK_COL_SIZE));
  }

  const selectedNft = unclaimed[pickIndex]?.nft ?? null;

  return (
    <box flexDirection="column">
      <box flexDirection="row" justifyContent="space-between">
        <text fg={t.text.primary}>
          <strong>Claim an egg</strong>
          <span fg={t.text.dim}>  {unclaimed.length} unclaimed</span>
          {claimedCount > 0 && <span fg={t.text.dim}> ({claimedCount} already claimed)</span>}
        </text>
        {selectedNft && (
          <text fg={t.text.dim}>
            {selectedNft.mintAddress.slice(0, 4)}...{selectedNft.mintAddress.slice(-4)}
          </text>
        )}
      </box>
      <box height={1} />
      {unclaimed.length === 0 ? (
        <text fg={t.text.dim}>All NFTs already claimed. [Esc] to go back</text>
      ) : (
        <>
          <box flexDirection="row">
            {columns.map((col, ci) => (
              <box key={ci} flexDirection="column" width={30}>
                {col.map((c, ri) => {
                  const globalIdx = ci * PICK_COL_SIZE + ri;
                  const isSel = globalIdx === pickIndex;
                  const eggName = extractEggName(c.nft.name);
                  const sp = resolveSpeciesByEggName(eggName);
                  return (
                    <box key={c.nft.mintAddress} height={1}>
                      <text fg={isSel ? t.accent.primary : t.text.muted}>
                        {isSel ? "> " : "  "}
                        {c.nft.name}
                        {sp && <span fg={getRarityColor(sp.rarity)}> {sp.rarity}</span>}
                      </text>
                    </box>
                  );
                })}
              </box>
            ))}
          </box>
          <box flexGrow={1} />
          <text fg={t.text.dim}>[Enter] claim  [E] explorer  [Esc] cancel</text>
        </>
      )}
    </box>
  );
}

function ClaimResultPanel({ result }: { result: { ok: boolean; message: string } }) {
  return (
    <box flexDirection="column">
      <text fg={result.ok ? "#4ade80" : "#f87171"}>
        {result.ok ? "✓ " : "✗ "}{result.message}
      </text>
      <box height={1} />
      <text fg={t.text.dim}>[Enter] to continue</text>
    </box>
  );
}

function MonsterDetail({ entry, isActive }: { entry: PartyEntry; isActive: boolean }) {
  const form = getCurrentForm(entry.species, entry.monster.stage);
  const created = new Date(entry.monster.createdAt);
  const dateStr = created.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <box flexDirection="column">
      <text>
        <strong fg={t.text.primary}>{entry.formName}</strong>
        {"  "}
        <span fg={t.accent.primary}>Lv.{entry.level}</span>
        {isActive && <span fg={t.accent.primary}> [Active]</span>}
      </text>
      <text fg={t.text.muted}>
        {form?.description ?? ""}
      </text>
      <box height={1} />
      <text fg={t.text.dim}>
        {STAGE_LABELS[entry.monster.stage]} stage  |  Origin: {entry.monster.origin}  |  {dateStr}
      </text>
      {entry.monster.name && (
        <text fg={t.text.dim}>Name: {entry.monster.name}</text>
      )}
      {entry.monster.mintAddress && (
        <text fg={t.text.dim}>Mint: {entry.monster.mintAddress.slice(0, 8)}...{entry.monster.mintAddress.slice(-4)}</text>
      )}
      <box flexGrow={1} />
      <text fg={t.text.dim}>
        {!isActive ? "[Enter] make active" : ""}
        {entry.monster.mintAddress ? "  [E] explorer" : ""}
      </text>
    </box>
  );
}
