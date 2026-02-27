import { randomUUID } from "crypto";
import { fetchNftMetadata, verifyOwnership } from "./verify";
import { getNetwork } from "./config";
import {
  createMonster,
  getMonsterCount,
  isAlreadyClaimed,
  resolveSpeciesByEggName,
  PARTY_MAX,
} from "../db/queries";
import type { Monster } from "../models/types";

export type ClaimError =
  | "already_claimed"
  | "party_full"
  | "not_found"
  | "not_tmon"
  | "not_owner"
  | "missing_genome"
  | "unknown_species"
  | "network_error";

export type ClaimResult =
  | { ok: true; monster: Monster }
  | { ok: false; error: ClaimError; message: string };

export async function claimEgg(mintAddress: string, walletAddress: string): Promise<ClaimResult> {
  // Check party size
  if (getMonsterCount() >= PARTY_MAX) {
    return { ok: false, error: "party_full", message: "Party is full (max 10)." };
  }

  // Check if already claimed locally
  if (isAlreadyClaimed(mintAddress)) {
    return { ok: false, error: "already_claimed", message: "This NFT has already been claimed." };
  }

  // Verify wallet owns this NFT on-chain
  let isOwner: boolean;
  try {
    isOwner = await verifyOwnership(mintAddress, walletAddress);
  } catch {
    return { ok: false, error: "network_error", message: "Could not verify ownership on-chain." };
  }
  if (!isOwner) {
    return { ok: false, error: "not_owner", message: "Your wallet doesn't own this NFT." };
  }

  // Fetch on-chain metadata
  let metadata: Awaited<ReturnType<typeof fetchNftMetadata>>;
  try {
    metadata = await fetchNftMetadata(mintAddress);
  } catch {
    return { ok: false, error: "not_found", message: "Could not find NFT on-chain." };
  }

  // Validate it's a TMON NFT
  if (metadata.symbol.replace(/\0/g, "").trim() !== "TMON") {
    return { ok: false, error: "not_tmon", message: "Not a Token Monsters NFT." };
  }

  // Extract egg name from NFT name (e.g. "Molting Egg #a3f8" → "Molting Egg")
  const nameMatch = metadata.name.replace(/\0/g, "").trim();
  const hashIdx = nameMatch.lastIndexOf("#");
  const eggName = hashIdx > 0 ? nameMatch.slice(0, hashIdx).trim() : nameMatch;

  // Resolve species from egg name
  const species = resolveSpeciesByEggName(eggName);
  if (!species) {
    return { ok: false, error: "unknown_species", message: `Unknown species: ${eggName}` };
  }

  // Generate deterministic genome from mint address
  const genome = generateGenomeFromMint(mintAddress);

  const now = Date.now();
  const monster = createMonster({
    id: randomUUID(),
    name: null,
    speciesId: species.id,
    genome,
    stage: "egg",
    hunger: 100,
    happiness: 100,
    energy: 100,
    experience: 0,
    createdAt: now,
    hatchedAt: null,
    lastFedAt: null,
    lastInteractionAt: null,
    evolvedAt: null,
    origin: "minted",
    originFrom: mintAddress,
    mintAddress,
    mintNetwork: getNetwork(),
    claimedBy: walletAddress,
  });

  if (!monster) {
    return { ok: false, error: "party_full", message: "Party is full (max 10)." };
  }

  return { ok: true, monster };
}

/** Deterministic 256-bit genome from a mint address */
function generateGenomeFromMint(mintAddress: string): Buffer {
  const encoder = new TextEncoder();
  const data = encoder.encode(mintAddress);
  // Use a simple hash to generate 32 bytes deterministically
  const hash = new Bun.CryptoHasher("sha256").update(data).digest();
  return Buffer.from(hash);
}
