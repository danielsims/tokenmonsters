import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";
import {
  mplTokenMetadata,
  createV1,
  mintV1,
  TokenStandard,
} from "@metaplex-foundation/mpl-token-metadata";
import { generateSigner, percentAmount, publicKey as umiPublicKey, sol } from "@metaplex-foundation/umi";
import { transferSol } from "@metaplex-foundation/mpl-toolbox";
import type { WalletAdapter } from "@solana/wallet-adapter-base";

const NFT_SYMBOL = "TMON"; // Token Monsters
const SELLER_FEE_BPS = 500; // 5%

/** Treasury wallet that receives mint payments. Set via NEXT_PUBLIC_TREASURY_WALLET env var. */
const TREASURY_WALLET = (process.env.NEXT_PUBLIC_TREASURY_WALLET ?? "").trim();

export interface MintParams {
  wallet: WalletAdapter;
  rpcEndpoint: string;
  name: string;
  speciesName: string;
  rarity: string;
  genomeHex: string;
  priceLamports: number;
}

export interface MintResult {
  mintAddress: string;
  signature: string;
}

/** Generate a random 256-bit genome as hex */
export function generateGenomeHex(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Mint a new egg NFT using the connected browser wallet */
export async function mintEggNft(params: MintParams): Promise<MintResult> {
  const { wallet, rpcEndpoint, name, speciesName, rarity, genomeHex, priceLamports } = params;

  const umi = createUmi(rpcEndpoint)
    .use(mplTokenMetadata())
    .use(walletAdapterIdentity(wallet));

  const mintSigner = generateSigner(umi);

  let builder = createV1(umi, {
    mint: mintSigner,
    name: name.slice(0, 32),
    symbol: NFT_SYMBOL,
    uri: "", // Off-chain metadata hosting TBD
    sellerFeeBasisPoints: percentAmount(SELLER_FEE_BPS / 100),
    creators: [{ address: umi.identity.publicKey, verified: true, share: 100 }],
    isMutable: true,
    tokenStandard: TokenStandard.NonFungible,
  }).append(
    mintV1(umi, {
      mint: mintSigner.publicKey,
      tokenOwner: umi.identity.publicKey,
      amount: 1,
      tokenStandard: TokenStandard.NonFungible,
    }),
  );

  // Add SOL payment for paid mints
  if (priceLamports > 0 && TREASURY_WALLET) {
    builder = builder.prepend(
      transferSol(umi, {
        destination: umiPublicKey(TREASURY_WALLET),
        amount: sol(priceLamports / 1_000_000_000),
      }),
    );
  }

  const result = await builder.sendAndConfirm(umi);

  return {
    mintAddress: mintSigner.publicKey.toString(),
    signature: Buffer.from(result.signature).toString("base64"),
  };
}
