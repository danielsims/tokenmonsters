import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import WalletProvider from "@/providers/WalletProvider";
import WalletButton from "@/components/WalletButton";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Token Monsters — your AI tokens are feeding something",
  description: "Mint monster eggs on Solana. Hatch them by coding with AI.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased bg-[#0a0a0a] text-zinc-100`}>
        <WalletProvider>
          <div className="fixed top-4 right-4 z-50">
            <WalletButton />
          </div>
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}
