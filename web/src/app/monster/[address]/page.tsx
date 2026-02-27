import { Connection, PublicKey } from "@solana/web3.js";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  mplTokenMetadata,
  fetchDigitalAsset,
} from "@metaplex-foundation/mpl-token-metadata";
import { publicKey as umiPublicKey } from "@metaplex-foundation/umi";

const RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
const NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";

interface MonsterPageProps {
  params: Promise<{ address: string }>;
}

export default async function MonsterPage({ params }: MonsterPageProps) {
  const { address } = await params;

  let nftData: {
    name: string;
    symbol: string;
    uri: string;
    isMutable: boolean;
    sellerFeeBasisPoints: number;
    owner: string | null;
  } | null = null;

  let error: string | null = null;

  try {
    // Fetch on-chain metadata
    const umi = createUmi(RPC_URL).use(mplTokenMetadata());
    const asset = await fetchDigitalAsset(umi, umiPublicKey(address));

    // Fetch owner
    const connection = new Connection(RPC_URL, "confirmed");
    const mintPubkey = new PublicKey(address);
    const tokenAccounts = await connection.getTokenLargestAccounts(mintPubkey);
    let owner: string | null = null;

    if (tokenAccounts.value.length > 0 && tokenAccounts.value[0].amount === "1") {
      const accountInfo = await connection.getParsedAccountInfo(
        tokenAccounts.value[0].address,
      );
      owner = (accountInfo.value?.data as any)?.parsed?.info?.owner || null;
    }

    nftData = {
      name: asset.metadata.name,
      symbol: asset.metadata.symbol,
      uri: asset.metadata.uri,
      isMutable: asset.metadata.isMutable,
      sellerFeeBasisPoints: asset.metadata.sellerFeeBasisPoints,
      owner,
    };
  } catch (e: any) {
    error = e.message || "Failed to fetch NFT data";
  }

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-16">
      <div className="max-w-lg w-full space-y-6">
        {error ? (
          <div className="border border-red-800 bg-red-900/20 rounded-lg p-6 text-center">
            <p className="text-red-400 font-mono text-sm">
              Could not load monster data.
            </p>
            <p className="text-red-500/60 text-xs font-mono mt-2">{error}</p>
          </div>
        ) : nftData ? (
          <>
            <div className="space-y-1">
              <h1 className="font-mono font-bold text-2xl">{nftData.name}</h1>
              <p className="text-zinc-500 font-mono text-sm">{nftData.symbol}</p>
            </div>

            <div className="border border-zinc-800 rounded-lg divide-y divide-zinc-800">
              <Row label="Mint Address" value={address} mono truncate />
              {nftData.owner && (
                <Row label="Owner" value={nftData.owner} mono truncate />
              )}
              <Row label="Network" value={NETWORK} />
              <Row
                label="Royalties"
                value={`${nftData.sellerFeeBasisPoints / 100}%`}
              />
              <Row
                label="Mutable"
                value={nftData.isMutable ? "Yes" : "No"}
              />
            </div>

            <a
              href={`https://explorer.solana.com/address/${address}?cluster=${NETWORK}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center py-3 border border-zinc-700 rounded-lg font-mono text-sm text-zinc-300 hover:bg-zinc-900 transition-colors"
            >
              View on Solana Explorer
            </a>
          </>
        ) : (
          <div className="text-center py-12">
            <p className="text-zinc-500 font-mono">Loading...</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  truncate,
}: {
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-4">
      <span className="text-zinc-500 text-sm shrink-0">{label}</span>
      <span
        className={`text-sm text-right ${mono ? "font-mono" : ""} ${truncate ? "truncate max-w-[200px]" : ""}`}
        title={truncate ? value : undefined}
      >
        {value}
      </span>
    </div>
  );
}
