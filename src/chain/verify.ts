import { Connection, PublicKey } from "@solana/web3.js";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  mplTokenMetadata,
  fetchDigitalAsset,
  fetchAllDigitalAssetByOwner,
  fetchJsonMetadata,
} from "@metaplex-foundation/mpl-token-metadata";
import { publicKey as umiPublicKey } from "@metaplex-foundation/umi";
import { getRpcUrl } from "./config";
import { verifyMonster } from "../models/integrity";
import { getSpeciesById } from "../db/queries";
import type { Monster } from "../models/types";

/**
 * Verify that a wallet owns a specific NFT.
 * Checks the on-chain token account for the mint address.
 */
export async function verifyOwnership(
  mintAddress: string,
  walletAddress: string,
): Promise<boolean> {
  const connection = new Connection(getRpcUrl(), "confirmed");
  const mintPubkey = new PublicKey(mintAddress);
  const walletPubkey = new PublicKey(walletAddress);

  try {
    // Get the largest token account for this mint (should be the NFT holder)
    const tokenAccounts = await connection.getTokenLargestAccounts(mintPubkey);
    if (!tokenAccounts.value.length) return false;

    const largestAccount = tokenAccounts.value[0];
    if (largestAccount.amount !== "1") return false;

    // Check who owns the token account
    const accountInfo = await connection.getParsedAccountInfo(largestAccount.address);
    if (!accountInfo.value) return false;

    const parsed = (accountInfo.value.data as any)?.parsed;
    if (!parsed) return false;

    const owner = parsed.info?.owner;
    return owner === walletPubkey.toBase58();
  } catch {
    return false;
  }
}

/**
 * Fetch the on-chain metadata for an NFT by its mint address.
 * Returns the Metaplex Digital Asset data including name, symbol, URI, and creators.
 */
export async function fetchNftMetadata(mintAddress: string) {
  const umi = createUmi(getRpcUrl()).use(mplTokenMetadata());

  const asset = await fetchDigitalAsset(umi, umiPublicKey(mintAddress));

  return {
    name: asset.metadata.name,
    symbol: asset.metadata.symbol,
    uri: asset.metadata.uri,
    sellerFeeBasisPoints: asset.metadata.sellerFeeBasisPoints,
    creators: asset.metadata.creators,
    isMutable: asset.metadata.isMutable,
    mint: asset.mint.publicKey.toString(),
    supply: Number(asset.mint.supply),
  };
}

/**
 * Fetch the off-chain JSON metadata from the URI stored on-chain.
 * Returns null if the URI is empty or unreachable.
 */
export async function fetchOffChainMetadata(mintAddress: string): Promise<object | null> {
  const umi = createUmi(getRpcUrl()).use(mplTokenMetadata());

  try {
    const asset = await fetchDigitalAsset(umi, umiPublicKey(mintAddress));
    if (!asset.metadata.uri) return null;

    const json = await fetchJsonMetadata(umi, asset.metadata.uri);
    return json;
  } catch {
    return null;
  }
}

export interface WalletNft {
  mintAddress: string;
  name: string;
  symbol: string;
}

/**
 * Scan a wallet for all TMON NFTs it owns.
 * Returns mint addresses and names for each.
 */
export async function fetchWalletTmonNfts(walletAddress: string): Promise<WalletNft[]> {
  const umi = createUmi(getRpcUrl()).use(mplTokenMetadata());

  const assets = await fetchAllDigitalAssetByOwner(umi, umiPublicKey(walletAddress));

  return assets
    .filter((a) => a.metadata.symbol.replace(/\0/g, "").trim() === "TMON")
    .map((a) => ({
      mintAddress: a.mint.publicKey.toString(),
      name: a.metadata.name.replace(/\0/g, "").trim(),
      symbol: a.metadata.symbol.replace(/\0/g, "").trim(),
    }));
}

/**
 * Check if a genome has already been minted as an NFT.
 * This prevents duplicate mints of the same genome.
 *
 * Note: This is a local DB check, not an on-chain check.
 * On-chain uniqueness is enforced by the mint keypair (each mint is unique).
 * This check prevents accidental duplicate local monsters pointing to different mints.
 */
export function isGenomeMinted(genomeHex: string, db: any): boolean {
  const row = db
    .query("SELECT 1 FROM monsters WHERE hex(genome) = ? AND mint_address IS NOT NULL LIMIT 1")
    .get(genomeHex.toUpperCase());
  return !!row;
}

// --- On-Chain Verification Gate ---

export interface ChainVerifyResult {
  valid: boolean;
  errors: string[];
}

/**
 * Deep verification of a minted monster against on-chain data.
 * This is the security gate before any chain interaction (re-minting, trading, battling).
 *
 * Checks:
 * 1. Local HMAC checksum integrity
 * 2. NFT exists on-chain with TMON symbol
 * 3. Genome matches (deterministic from mint address)
 * 4. Species matches (on-chain name vs local species egg name)
 * 5. Wallet ownership (if walletAddress provided)
 */
export async function verifyMonsterOnChain(
  monster: Monster,
  walletAddress?: string,
): Promise<ChainVerifyResult> {
  const errors: string[] = [];

  // 1. Local HMAC check
  if (monster.tampered || !verifyMonster(monster)) {
    errors.push("Local checksum verification failed — monster state has been tampered with.");
  }

  // Must be a minted monster
  if (!monster.mintAddress) {
    errors.push("Monster has no mint address — not an on-chain monster.");
    return { valid: false, errors };
  }

  // 2. Fetch on-chain metadata
  let metadata: Awaited<ReturnType<typeof fetchNftMetadata>>;
  try {
    metadata = await fetchNftMetadata(monster.mintAddress);
  } catch {
    errors.push("Could not fetch NFT metadata from chain.");
    return { valid: false, errors };
  }

  // Validate TMON symbol
  if (metadata.symbol.replace(/\0/g, "").trim() !== "TMON") {
    errors.push("On-chain NFT is not a TMON token.");
  }

  // 3. Verify genome (deterministic from mint address)
  const expectedGenome = Buffer.from(
    new Bun.CryptoHasher("sha256").update(new TextEncoder().encode(monster.mintAddress)).digest(),
  );
  if (!monster.genome.equals(expectedGenome)) {
    errors.push("Genome does not match what the mint address should produce.");
  }

  // 4. Verify species (on-chain name should contain the species egg name)
  const species = getSpeciesById(monster.speciesId);
  if (species) {
    const onChainName = metadata.name.replace(/\0/g, "").trim();
    const eggName = species.forms[0]?.name ?? "";
    if (eggName && !onChainName.startsWith(eggName)) {
      errors.push(`Species mismatch: on-chain name "${onChainName}" does not match "${eggName}".`);
    }
  }

  // 5. Verify off-chain attributes (rarity, genome hex) if URI is available
  try {
    const offChain = await fetchOffChainMetadata(monster.mintAddress);
    if (offChain && "attributes" in offChain) {
      const attrs = (offChain as any).attributes as { trait_type: string; value: string }[];
      const onChainRarity = attrs.find((a) => a.trait_type === "Rarity")?.value;
      if (species && onChainRarity && onChainRarity.toLowerCase() !== species.rarity) {
        errors.push(`Rarity mismatch: on-chain "${onChainRarity}" vs local "${species.rarity}".`);
      }
      const onChainGenome = attrs.find((a) => a.trait_type === "Genome")?.value;
      if (onChainGenome && onChainGenome !== monster.genome.toString("hex")) {
        errors.push("On-chain genome attribute does not match local genome.");
      }
    }
  } catch {
    // Off-chain metadata not available — not a critical failure
  }

  // 6. Wallet ownership check (optional)
  if (walletAddress) {
    try {
      const owns = await verifyOwnership(monster.mintAddress, walletAddress);
      if (!owns) {
        errors.push("Wallet does not currently own this NFT on-chain.");
      }
    } catch {
      errors.push("Could not verify wallet ownership on-chain.");
    }
  }

  return { valid: errors.length === 0, errors };
}
