"use client";

import dynamic from "next/dynamic";

const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then((mod) => mod.WalletMultiButton),
  { ssr: false },
);

export default function WalletButton() {
  return (
    <WalletMultiButton
      style={{
        backgroundColor: "#27272a",
        fontSize: "0.875rem",
        height: "2.25rem",
        borderRadius: "0.5rem",
        fontFamily: "var(--font-geist-mono), monospace",
      }}
    />
  );
}
