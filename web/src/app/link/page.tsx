"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useSearchParams } from "next/navigation";

function LinkContent() {
  const { connected, publicKey, disconnect, signMessage } = useWallet();
  const { setVisible: openWalletModal } = useWalletModal();
  const searchParams = useSearchParams();
  const port = searchParams.get("port");
  const nonce = searchParams.get("nonce");
  const fresh = searchParams.get("fresh") === "1";
  const [redirected, setRedirected] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // If fresh=1, disconnect any existing wallet so user picks a new one
  useEffect(() => {
    if (fresh && connected && !disconnecting) {
      setDisconnecting(true);
      disconnect().finally(() => setDisconnecting(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh]);

  // Sign the nonce and redirect with signature
  const signAndRedirect = useCallback(async () => {
    if (!publicKey || !port || !signMessage || signing || redirected) return;

    const address = publicKey.toBase58();

    // If no nonce provided (old game version), redirect without signature
    if (!nonce) {
      setRedirected(true);
      window.location.href = `http://localhost:${port}/wallet?address=${address}`;
      return;
    }

    setSigning(true);
    setSignError(null);

    try {
      const messageBytes = new TextEncoder().encode(nonce);
      const signatureBytes = await signMessage(messageBytes);
      const signatureBase64 = btoa(String.fromCharCode(...signatureBytes));
      const params = new URLSearchParams({
        address,
        signature: signatureBase64,
        message: nonce,
      });
      setRedirected(true);
      window.location.href = `http://localhost:${port}/wallet?${params.toString()}`;
    } catch (err: any) {
      setSigning(false);
      setSignError(err.message || "Signature rejected");
    }
  }, [publicKey, port, nonce, signMessage, signing, redirected]);

  // When wallet connects and we have a port, sign and redirect
  useEffect(() => {
    if (disconnecting || redirected || signing) return;
    if (connected && publicKey && port) {
      signAndRedirect();
    }
  }, [connected, publicKey, port, redirected, disconnecting, signing, signAndRedirect]);

  const walletAddress = publicKey?.toBase58() ?? "";

  function handleCopy() {
    navigator.clipboard.writeText(walletAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // State: not connected
  if (!connected) {
    return (
      <div className="space-y-8">
        <div className="space-y-4 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-zinc-800/80 border border-zinc-700 mx-auto">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-400">
              <path d="M13.5 3H12H8C6.34315 3 5 4.34315 5 6V18C5 19.6569 6.34315 21 8 21H11M13.5 3L19 8.625M13.5 3V7.625C13.5 8.17728 13.9477 8.625 14.5 8.625H19M19 8.625V11" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M17 15V18M17 21V18M17 18H14M17 18H20" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="space-y-2">
            <h1 className="text-base font-semibold tracking-tight text-zinc-100">Link your wallet</h1>
            <p className="text-sm text-zinc-500 leading-relaxed max-w-xs mx-auto">
              Connect your Solana wallet to link it with the terminal game.
            </p>
          </div>
        </div>

        <button
          onClick={() => openWalletModal(true)}
          className="w-full py-3 bg-zinc-100 text-zinc-900 rounded-lg font-medium text-sm hover:bg-white transition-colors cursor-pointer"
        >
          Connect Wallet
        </button>

        <p className="text-center text-xs text-zinc-600">
          Phantom, Solflare, or any Solana wallet
        </p>
      </div>
    );
  }

  // State: signing the challenge
  if (signing && !redirected) {
    return (
      <div className="space-y-6 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-zinc-800/80 border border-zinc-700 mx-auto">
          <div className="w-5 h-5 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
        </div>
        <div className="space-y-2">
          <h1 className="text-base font-semibold tracking-tight text-zinc-100">Sign to verify</h1>
          <p className="text-sm text-zinc-500 leading-relaxed max-w-xs mx-auto">
            Approve the signature request in your wallet to prove ownership.
          </p>
        </div>
      </div>
    );
  }

  // State: sign error
  if (signError) {
    return (
      <div className="space-y-6 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 mx-auto">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>
        <div className="space-y-2">
          <h1 className="text-base font-semibold tracking-tight text-zinc-100">Signature rejected</h1>
          <p className="text-sm text-zinc-500 leading-relaxed max-w-xs mx-auto">
            You need to sign the message to verify wallet ownership.
          </p>
        </div>
        <button
          onClick={() => { setSignError(null); signAndRedirect(); }}
          className="w-full py-3 bg-zinc-100 text-zinc-900 rounded-lg font-medium text-sm hover:bg-white transition-colors cursor-pointer"
        >
          Try Again
        </button>
      </div>
    );
  }

  // State: linked via game (auto-redirect happened)
  if (port && redirected) {
    return (
      <div className="space-y-6 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-500/10 border border-green-500/20 mx-auto">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-400">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div className="space-y-2">
          <h1 className="text-base font-semibold tracking-tight text-zinc-100">Wallet verified</h1>
          <p className="text-sm text-zinc-500 leading-relaxed">
            Your wallet has been cryptographically verified and linked to the game.
          </p>
        </div>
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3">
          <code className="text-xs font-mono text-zinc-500 break-all">{walletAddress}</code>
        </div>
        <p className="text-xs text-zinc-600">
          You can close this tab and return to the terminal.
        </p>
      </div>
    );
  }

  // State: connected but no port (manual flow — copy address)
  if (connected && !port) {
    return (
      <div className="space-y-6 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-500/10 border border-green-500/20 mx-auto">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-400">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div className="space-y-2">
          <h1 className="text-base font-semibold tracking-tight text-zinc-100">Wallet connected</h1>
          <p className="text-sm text-zinc-500 leading-relaxed max-w-xs mx-auto">
            Copy your address and paste it in the game with <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-xs font-mono text-zinc-400">Ctrl+V</kbd>
          </p>
        </div>

        <button
          onClick={handleCopy}
          className="w-full bg-zinc-900/60 border border-zinc-800 rounded-lg p-4 text-left hover:border-zinc-600 transition-all group cursor-pointer"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-600 font-medium uppercase tracking-wider">Wallet address</span>
            <span className="text-xs text-zinc-600 group-hover:text-zinc-400 transition-colors">
              {copied ? (
                <span className="text-green-400">Copied</span>
              ) : (
                "Click to copy"
              )}
            </span>
          </div>
          <code className="text-amber-400/90 text-xs font-mono block break-all leading-relaxed">
            {walletAddress}
          </code>
        </button>
      </div>
    );
  }

  return null;
}

export default function LinkPage() {
  return (
    <div className="h-dvh flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-8 backdrop-blur-sm shadow-2xl shadow-black/20">
          <Suspense fallback={
            <div className="text-center py-8">
              <div className="inline-block w-5 h-5 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
            </div>
          }>
            <LinkContent />
          </Suspense>
        </div>

        <div className="flex items-center justify-center gap-2 mt-6 text-xs text-zinc-700">
          <span className="font-mono tracking-wider">Token Monsters</span>
        </div>
      </div>
    </div>
  );
}
