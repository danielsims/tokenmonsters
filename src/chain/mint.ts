import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  mplTokenMetadata,
  createV1,
  mintV1,
  TokenStandard,
} from "@metaplex-foundation/mpl-token-metadata";
import {
  generateSigner,
  percentAmount,
  publicKey as umiPublicKey,
  createNoopSigner,
  type Umi,
  type KeypairSigner,
} from "@metaplex-foundation/umi";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { toWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters";
import { generateGenome } from "../models/genome";
import { getSpeciesById } from "../db/queries";
import { buildNftName, buildMetadata, validateMetadata } from "./metadata";
import {
  getRpcUrl,
  getNetwork,
  getMintPriceLamports,
  NFT_SYMBOL,
  SELLER_FEE_BASIS_POINTS,
} from "./config";
import { signTransaction as wcSignTransaction, getConnectedWallet } from "./wallet";
import type { Monster } from "../models/types";

export interface MintResult {
  monster: Omit<Monster, "checksum">;
  mintAddress: string;
  txSignature: string;
  network: string;
}

/**
 * Mint a new egg NFT on Solana.
 *
 * Flow:
 * 1. Generate genome + build metadata
 * 2. Build Metaplex createV1 + mintV1 transaction via UMI
 * 3. Sign locally with the mint keypair
 * 4. Send to mobile wallet via WalletConnect for payer signature
 * 5. Broadcast and wait for confirmation
 * 6. Return monster data + mint address for DB insertion
 *
 * DB write is the caller's responsibility — only after this returns successfully.
 */
export async function mintEgg(speciesId: number): Promise<MintResult> {
  const walletPubkey = getConnectedWallet();
  if (!walletPubkey) throw new Error("No wallet connected");

  const species = getSpeciesById(speciesId);
  if (!species) throw new Error(`Unknown species: ${speciesId}`);

  const rpcUrl = getRpcUrl();
  const network = getNetwork();

  // Check balance and airdrop on devnet if needed
  const connection = new Connection(rpcUrl, "confirmed");
  await ensureSufficientBalance(connection, walletPubkey, network);

  // Generate a unique genome for this egg
  const genome = generateGenome();
  const genomeHex = genome.toString("hex");

  // Build monster data (egg stage, full stats)
  const now = Date.now();
  const monsterId = crypto.randomUUID();
  const eggForm = species.forms.find((f) => f.stage === "egg");
  const monster: Omit<Monster, "checksum"> = {
    id: monsterId,
    name: null,
    speciesId,
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
    origin: "generated",
    originFrom: `mint:${network}`,
    mintAddress: null,
    mintNetwork: null,
    claimedBy: null,
  };

  // Validate metadata before building the transaction
  const metadata = buildMetadata(monster as Monster & { checksum: "" }, species, walletPubkey);
  const errors = validateMetadata(metadata);
  if (errors.length > 0) {
    throw new Error(`Invalid metadata: ${errors.join(", ")}`);
  }

  // Set up UMI with the player's wallet as a noop signer
  // (actual signing happens via WalletConnect)
  const umi = createUmi(rpcUrl).use(mplTokenMetadata());
  const payerSigner = createNoopSigner(umiPublicKey(walletPubkey));
  umi.identity = payerSigner;
  umi.payer = payerSigner;

  // Generate a local keypair for the new mint account
  const mintSigner = generateSigner(umi);
  const nftName = buildNftName(monster as Monster & { checksum: "" }, species);

  // Build createV1 + mintV1 as a single transaction
  const builder = createV1(umi, {
    mint: mintSigner,
    name: nftName,
    symbol: NFT_SYMBOL,
    uri: "", // Off-chain metadata hosting TBD
    sellerFeeBasisPoints: percentAmount(SELLER_FEE_BASIS_POINTS / 100),
    creators: [{ address: umiPublicKey(walletPubkey), verified: true, share: 100 }],
    isMutable: true, // Allow metadata updates when server authority is added
    tokenStandard: TokenStandard.NonFungible,
  }).append(
    mintV1(umi, {
      mint: mintSigner.publicKey,
      tokenOwner: umiPublicKey(walletPubkey),
      amount: 1,
      tokenStandard: TokenStandard.NonFungible,
    }),
  );

  // Build transaction with latest blockhash, sign with mint keypair
  let tx = await builder.buildWithLatestBlockhash(umi);
  tx = await mintSigner.signTransaction(tx);

  // Serialize to Solana wire format
  const txBytes = umi.transactions.serialize(tx);

  // Send to mobile wallet for payer signature via WalletConnect
  const signedTxBytes = await wcSignTransaction(txBytes);

  // Broadcast the fully-signed transaction
  const txSignature = await broadcastAndConfirm(connection, signedTxBytes);

  // Convert UMI public key to base58 string for storage
  const mintAddress = mintSigner.publicKey.toString();

  return {
    monster,
    mintAddress,
    txSignature,
    network,
  };
}

/**
 * Ensure the wallet has enough SOL for the transaction.
 * On devnet, auto-airdrop if balance is low.
 */
async function ensureSufficientBalance(
  connection: Connection,
  walletPubkey: string,
  network: string,
): Promise<void> {
  const pubkey = new PublicKey(walletPubkey);
  const balance = await connection.getBalance(pubkey);

  // Creating an NFT costs ~0.01-0.02 SOL in rent + fees
  const minRequired = 0.05 * LAMPORTS_PER_SOL + getMintPriceLamports();

  if (balance >= minRequired) return;

  if (network === "devnet") {
    // Auto-airdrop on devnet
    const airdropSig = await connection.requestAirdrop(pubkey, LAMPORTS_PER_SOL);
    await connection.confirmTransaction(airdropSig, "confirmed");
    return;
  }

  const solRequired = (minRequired / LAMPORTS_PER_SOL).toFixed(3);
  const solBalance = (balance / LAMPORTS_PER_SOL).toFixed(3);
  throw new Error(
    `Insufficient SOL: ${solBalance} SOL available, need ~${solRequired} SOL. ` +
      `Send SOL to ${walletPubkey}`,
  );
}

/** Broadcast a signed transaction and wait for confirmation */
async function broadcastAndConfirm(
  connection: Connection,
  signedTxBytes: Uint8Array,
): Promise<string> {
  const txSignature = await connection.sendRawTransaction(Buffer.from(signedTxBytes), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });

  const confirmation = await connection.confirmTransaction(txSignature, "confirmed");
  if (confirmation.value.err) {
    throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
  }

  return txSignature;
}
