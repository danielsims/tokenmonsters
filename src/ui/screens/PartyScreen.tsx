import { useState, useMemo, useCallback, useEffect } from "react";
import { execSync } from "child_process";
import { useKeyboard } from "@opentui/react";
import { getAllMonsters, getSpeciesById, isAlreadyClaimed, getSetting, setSetting } from "../../db/queries";
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
import { generateQrString } from "../../chain/wallet";
import { t } from "../theme";

const LIST_WIDTH = 34;

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
  const [qrCode, setQrCode] = useState<string | null>(null);

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

  // Generate QR code for minted monsters (links to Solana Explorer)
  useEffect(() => {
    if (!selected?.monster.mintAddress) {
      setQrCode(null);
      return;
    }
    const cluster = selected.monster.mintNetwork === "mainnet-beta" ? "" : "?cluster=devnet";
    const url = `https://explorer.solana.com/address/${selected.monster.mintAddress}${cluster}`;
    generateQrString(url).then(setQrCode);
  }, [selected?.monster.mintAddress, selected?.monster.mintNetwork]);

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
      const unclaimed = claimableNfts.filter((c) => !c.alreadyClaimed);
      if (key.name === "escape") {
        setMode("list");
      } else if (key.name === "up") {
        setPickIndex((i) => Math.max(0, i - 1));
      } else if (key.name === "down") {
        setPickIndex((i) => Math.min(unclaimed.length - 1, i + 1));
      } else if (key.name === "return" && unclaimed[pickIndex]) {
        handleClaimNft(unclaimed[pickIndex].nft.mintAddress);
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
            {selected ? (
              <RegistryPreview
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
            height={24}
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
              <MonsterDetail entry={selected} isActive={selected.monster.id === activeMonster?.id} qrCode={qrCode} />
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

  return (
    <box flexDirection="column">
      <text fg={t.text.primary}>
        Found {nfts.length} NFT{nfts.length !== 1 ? "s" : ""}
        {claimedCount > 0 && <span fg={t.text.dim}> ({claimedCount} already claimed)</span>}
      </text>
      <box height={1} />
      {unclaimed.length === 0 ? (
        <text fg={t.text.dim}>All NFTs already claimed. [Esc] to go back</text>
      ) : (
        <>
          {unclaimed.map((c, i) => (
            <box key={c.nft.mintAddress} paddingX={0} height={1}>
              <text fg={i === pickIndex ? t.accent.primary : t.text.muted}>
                {i === pickIndex ? "> " : "  "}{c.nft.name}
              </text>
            </box>
          ))}
          <box height={1} />
          <text fg={t.text.dim}>[Enter] claim  [Esc] cancel</text>
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

function MonsterDetail({ entry, isActive, qrCode }: { entry: PartyEntry; isActive: boolean; qrCode: string | null }) {
  const form = getCurrentForm(entry.species, entry.monster.stage);
  const created = new Date(entry.monster.createdAt);
  const dateStr = created.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <box flexDirection="row">
      {/* Left: text info */}
      <box flexDirection="column" flexGrow={1}>
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
        {!isActive && (
          <text fg={t.text.dim}>[Enter] to make active</text>
        )}
      </box>
      {/* Right: QR code for minted monsters */}
      {qrCode && (
        <box flexDirection="column" alignItems="flex-end" justifyContent="center" width={41}>
          <text fg={t.accent.primary} backgroundColor="#ffffff">{" " + qrCode.split("\n").join(" \n ") + " "}</text>
        </box>
      )}
    </box>
  );
}
