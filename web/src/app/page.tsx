"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import dynamic from "next/dynamic";
import { SPECIES, formatPrice, getRarityColor } from "@/lib/species";
import { mintEggNft, generateGenomeHex } from "@/lib/mint";

const EggViewer = dynamic(() => import("@/components/EggViewer"), { ssr: false });

type MintState = "idle" | "minting" | "confirming" | "success" | "error";

export default function Home() {
  const { connected, publicKey, wallet, connect } = useWallet();
  const { connection } = useConnection();
  const { setVisible: openWalletModal } = useWalletModal();
  const [speciesIdx, setSpeciesIdx] = useState(0);
  const [mintState, setMintState] = useState<MintState>("idle");
  const [mintAddress, setMintAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [airdropping, setAirdropping] = useState(false);
  const [copied, setCopied] = useState(false);

  const species = SPECIES[speciesIdx];
  const touchStart = useRef<number | null>(null);

  const installCommand = "npx tokenmonsters";

  function copyInstallCommand() {
    navigator.clipboard.writeText(installCommand).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const prevSpecies = useCallback(() => {
    setSpeciesIdx((i) => (i - 1 + SPECIES.length) % SPECIES.length);
    setMintState("idle");
    setError(null);
    setCopied(false);
  }, []);

  const nextSpecies = useCallback(() => {
    setSpeciesIdx((i) => (i + 1) % SPECIES.length);
    setMintState("idle");
    setError(null);
    setCopied(false);
  }, []);

  // Touch swipe navigation
  const touchStartY = useRef<number | null>(null);
  const swiping = useRef(false);

  useEffect(() => {
    function handleTouchStart(e: TouchEvent) {
      touchStart.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      swiping.current = false;
    }
    function handleTouchMove(e: TouchEvent) {
      if (touchStart.current === null) return;
      const dx = Math.abs(e.touches[0].clientX - touchStart.current);
      const dy = Math.abs(e.touches[0].clientY - (touchStartY.current ?? 0));
      // If horizontal movement dominates, it's a swipe — prevent scroll
      if (dx > 10 && dx > dy) {
        swiping.current = true;
        e.preventDefault();
      }
    }
    function handleTouchEnd(e: TouchEvent) {
      if (touchStart.current === null) return;
      const dx = e.changedTouches[0].clientX - touchStart.current;
      touchStart.current = null;
      touchStartY.current = null;
      if (!swiping.current) return;
      swiping.current = false;
      if (Math.abs(dx) < 50) return;
      if (dx < 0) nextSpecies();
      else prevSpecies();
    }
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [nextSpecies, prevSpecies]);

  const refreshBalance = useCallback(async () => {
    if (!publicKey) { setBalance(null); return; }
    try {
      const bal = await connection.getBalance(publicKey);
      setBalance(bal / LAMPORTS_PER_SOL);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey?.toBase58()]);

  useEffect(() => { refreshBalance(); }, [refreshBalance]);

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (mintState === "minting" || mintState === "confirming") return;

      if (e.key === "ArrowLeft" || e.key === "h") {
        prevSpecies();
      } else if (e.key === "ArrowRight" || e.key === "l") {
        nextSpecies();
      } else if (e.key === "Enter") {
        if (!connected) {
          openWalletModal(true);
        } else if (mintState === "idle") {
          handleMint();
        }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  async function handleAirdrop() {
    if (!publicKey) return;
    setAirdropping(true);
    try {
      const sig = await connection.requestAirdrop(publicKey, 2 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, "confirmed");
      await refreshBalance();
    } catch (err: any) {
      setError("Faucet rate-limited. Try again in a minute.");
    }
    setAirdropping(false);
  }

  async function handleMint() {
    if (!connected || !wallet?.adapter) return;

    setMintState("minting");
    setError(null);

    try {
      const genomeHex = generateGenomeHex();
      const shortGenome = genomeHex.slice(0, 4);
      const nftName = `${species.eggName} #${shortGenome}`;

      setMintState("confirming");

      const result = await mintEggNft({
        wallet: wallet.adapter,
        rpcEndpoint: connection.rpcEndpoint,
        name: nftName,
        speciesName: species.name,
        rarity: species.rarity,
        genomeHex,
        priceLamports: species.priceLamports,
      });

      setMintAddress(result.mintAddress);
      setMintState("success");
      refreshBalance();
    } catch (err: any) {
      setError(err.message || "Mint failed");
      setMintState("error");
    }
  }

  const canAfford = balance !== null && balance * LAMPORTS_PER_SOL >= species.priceLamports;
  const needsAirdrop = connected && balance !== null && balance < 0.05;

  return (
    <div className="h-dvh flex items-center justify-center p-4 overflow-hidden">
      <div className="w-full max-w-xl max-h-dvh">
        {/* Terminal chrome */}
        <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-700 border-b-0 rounded-t-lg">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
          </div>
          <span className="text-zinc-500 text-xs ml-2 font-mono">Token Monsters</span>
        </div>

        {/* Terminal body */}
        <div className="bg-[#0c0c0c] border border-zinc-700 border-t-0 rounded-b-lg p-4 sm:p-6 space-y-4 sm:space-y-6 font-mono">
          {/* Egg viewer */}
          <div className="relative">
            <EggViewer model={species.model} />
            {/* Scanline overlay */}
            <div
              className="absolute inset-0 pointer-events-none opacity-[0.03]"
              style={{
                backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, #000 2px, #000 4px)",
              }}
            />
          </div>

          {/* Species info */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={prevSpecies}
                  className="text-zinc-600 hover:text-zinc-300 transition-colors"
                >
                  ◄
                </button>
                <span className="text-lg font-bold font-mono">{species.eggName}</span>
                <button
                  onClick={nextSpecies}
                  className="text-zinc-600 hover:text-zinc-300 transition-colors"
                >
                  ►
                </button>
              </div>
              <span className="text-sm font-medium" style={{ color: getRarityColor(species.rarity) }}>
                {species.rarity}
              </span>
            </div>
            <p className="text-zinc-500 text-sm leading-relaxed">
              {species.description}
            </p>
          </div>

          {/* Divider */}
          <div className="border-t border-zinc-800" />

          {/* Mint area */}
          {!connected ? (
            <button
              onClick={() => {
                if (wallet) {
                  // Wallet previously selected — connect directly (handles mobile deep linking)
                  connect().catch(() => openWalletModal(true));
                } else {
                  openWalletModal(true);
                }
              }}
              className="w-full py-2.5 bg-zinc-800 border border-zinc-600 text-zinc-200 rounded hover:bg-zinc-700 hover:border-zinc-500 transition-colors text-sm font-mono"
            >
              ⏎ Mint — {formatPrice(species.priceLamports)}
            </button>
          ) : mintState === "success" && mintAddress ? (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <p className="text-green-400 text-base font-medium font-sans">
                  Egg minted
                </p>
                <p className="text-zinc-500 text-sm font-sans">
                  Claim it in-game to start hatching.
                </p>
              </div>
              <button
                onClick={copyInstallCommand}
                className="w-full bg-zinc-900/80 border border-zinc-700 rounded p-3 hover:border-zinc-500 transition-colors group cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <code className="text-amber-400 text-sm font-mono">{installCommand}</code>
                  <span className="text-zinc-600 text-xs group-hover:text-zinc-400 transition-colors font-sans">
                    {copied ? "copied" : "copy"}
                  </span>
                </div>
              </button>
              <div className="flex items-center justify-between text-xs font-sans">
                <a
                  href={`https://explorer.solana.com/address/${mintAddress}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  View on Explorer
                </a>
                <button
                  onClick={() => { setMintState("idle"); setMintAddress(null); setCopied(false); }}
                  className="text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  Mint another
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {(mintState === "minting" || mintState === "confirming") ? (
                <div className="space-y-2">
                  <div className="w-full py-2.5 bg-zinc-800 border border-zinc-600 text-zinc-400 rounded text-sm font-mono text-center">
                    {mintState === "minting" ? "building tx..." : "approve in wallet..."}
                  </div>
                  <button
                    onClick={() => { setMintState("idle"); setError(null); }}
                    className="w-full py-1.5 text-xs text-zinc-600 hover:text-zinc-300 transition-colors"
                  >
                    cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleMint}
                  disabled={!canAfford && species.priceLamports > 0}
                  className="w-full py-2.5 bg-zinc-800 border border-zinc-600 text-zinc-200 rounded hover:bg-zinc-700 hover:border-zinc-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-sm font-mono"
                >
                  ⏎ Mint — {formatPrice(species.priceLamports)}
                </button>
              )}

              {mintState === "error" && error && (
                <p className="text-red-400 text-xs font-sans">{error}</p>
              )}

              {needsAirdrop && (
                <button
                  onClick={handleAirdrop}
                  disabled={airdropping}
                  className="w-full py-2 text-xs text-zinc-500 border border-zinc-800 rounded hover:text-zinc-300 hover:border-zinc-600 transition-colors disabled:opacity-50"
                >
                  {airdropping ? "requesting..." : "airdrop 2 SOL (devnet)"}
                </button>
              )}
            </div>
          )}

          {/* Status bar */}
          <div className="flex items-center justify-between text-xs text-zinc-600 pt-2 border-t border-zinc-800 font-mono">
            <span className="hidden sm:inline">← → browse  ⏎ {connected ? "Mint" : "connect"}</span>
            <span className="sm:hidden">swipe to browse</span>
            <span>
              {connected
                ? `${publicKey?.toBase58().slice(0, 4)}...${publicKey?.toBase58().slice(-4)}  ${balance !== null ? `${balance.toFixed(2)} SOL` : "..."}`
                : "no wallet"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
