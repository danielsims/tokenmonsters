import { join } from "path";
import { homedir } from "os";
import { existsSync, readFileSync } from "fs";

export type Network = "devnet" | "mainnet-beta";

const CONFIG_PATH = join(homedir(), ".tokenmonsters", "chain-config.json");

const RPC_ENDPOINTS: Record<Network, string> = {
  devnet: "https://api.devnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
};

/** CAIP-2 chain IDs for WalletConnect */
const CHAIN_IDS: Record<Network, string> = {
  devnet: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
  "mainnet-beta": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
};

/** Mint price in lamports per network (0 = free) */
const MINT_PRICES: Record<Network, number> = {
  devnet: 0,
  "mainnet-beta": 0, // Free at launch, configurable later
};

interface ChainConfig {
  network: Network;
  walletConnectProjectId: string;
  rpcUrl: string | null;
}

function loadConfig(): ChainConfig {
  const network = (process.env.TOKENMONSTERS_NETWORK as Network) || "devnet";
  const walletConnectProjectId = process.env.WALLETCONNECT_PROJECT_ID || "";
  const rpcUrl = process.env.SOLANA_RPC_URL || null;

  if (existsSync(CONFIG_PATH)) {
    try {
      const file = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
      return {
        network: file.network || network,
        walletConnectProjectId: file.walletConnectProjectId || walletConnectProjectId,
        rpcUrl: file.rpcUrl || rpcUrl,
      };
    } catch {}
  }

  return { network, walletConnectProjectId, rpcUrl };
}

let config: ChainConfig | null = null;

function getConfig(): ChainConfig {
  if (!config) config = loadConfig();
  return config;
}

export function getNetwork(): Network {
  return getConfig().network;
}

export function getRpcUrl(): string {
  return getConfig().rpcUrl || RPC_ENDPOINTS[getNetwork()];
}

export function getChainId(): string {
  return CHAIN_IDS[getNetwork()];
}

export function getMintPriceLamports(): number {
  return MINT_PRICES[getNetwork()];
}

export function getWalletConnectProjectId(): string {
  const id = getConfig().walletConnectProjectId;
  if (!id) {
    throw new Error(
      "WalletConnect project ID not configured. Set WALLETCONNECT_PROJECT_ID env var or add to ~/.tokenmonsters/chain-config.json",
    );
  }
  return id;
}

export const NFT_SYMBOL = "TMON"; // Token Monsters
export const SELLER_FEE_BASIS_POINTS = 500; // 5%
