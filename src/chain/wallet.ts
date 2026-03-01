import SignClient from "@walletconnect/sign-client";
import qrcode from "qrcode-terminal";
import { join } from "path";
import { homedir } from "os";
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "fs";
import { getChainId, getWalletConnectProjectId } from "./config";

const SESSION_PATH = join(homedir(), ".tokenmonsters", "wallet-session.json");
const CONNECTION_TIMEOUT_MS = 120_000; // 2 minutes to scan QR
const SIGN_TIMEOUT_MS = 120_000; // 2 minutes to approve on phone

interface StoredSession {
  topic: string;
  publicKey: string;
  chainId: string;
}

let client: SignClient | null = null;
let activeSession: StoredSession | null = null;

async function getClient(): Promise<SignClient> {
  if (client) return client;

  client = await SignClient.init({
    projectId: getWalletConnectProjectId(),
    metadata: {
      name: "Token Monsters",
      description: "Your AI tokens are feeding something.",
      url: "https://tokenmonsters.dev",
      icons: [],
    },
  });

  client.on("session_delete", () => {
    activeSession = null;
    clearStoredSession();
  });

  client.on("session_expire", () => {
    activeSession = null;
    clearStoredSession();
  });

  return client;
}

/**
 * Connect to a mobile wallet via WalletConnect.
 * Returns the wallet's public key and the pairing URI (for QR display).
 * If a valid session already exists, reconnects silently (qrUri will be empty).
 */
export async function connectWallet(): Promise<{ publicKey: string; qrUri: string }> {
  // Try restoring an existing session
  const stored = loadStoredSession();
  if (stored && stored.chainId === getChainId()) {
    const sc = await getClient();
    const sessions = sc.session.getAll();
    const existing = sessions.find((s) => s.topic === stored.topic);
    if (existing) {
      activeSession = stored;
      return { publicKey: stored.publicKey, qrUri: "" };
    }
  }

  const sc = await getClient();
  const chainId = getChainId();

  const { uri, approval } = await sc.connect({
    requiredNamespaces: {
      solana: {
        methods: ["solana_signTransaction"],
        chains: [chainId],
        events: [],
      },
    },
  });

  if (!uri) throw new Error("Failed to generate WalletConnect pairing URI");

  const session = await Promise.race([
    approval(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Wallet connection timed out")), CONNECTION_TIMEOUT_MS),
    ),
  ]);

  // Extract public key — format: "solana:<chainRef>:<publicKey>"
  const accounts = session.namespaces.solana?.accounts;
  if (!accounts || accounts.length === 0) {
    throw new Error("No Solana accounts found in wallet");
  }

  const parts = accounts[0].split(":");
  const publicKey = parts[parts.length - 1];
  if (!publicKey || publicKey.length < 32) {
    throw new Error("Invalid account format from wallet");
  }

  activeSession = { topic: session.topic, publicKey, chainId };
  storeSession(activeSession);

  return { publicKey, qrUri: uri };
}

/**
 * Sign a serialized Solana transaction via the connected wallet.
 * The transaction should be partially signed (e.g., mint keypair signed, payer unsigned).
 * Returns the fully-signed transaction bytes ready for broadcast.
 */
export async function signTransaction(serializedTx: Uint8Array): Promise<Uint8Array> {
  if (!activeSession) throw new Error("No wallet connected. Call connectWallet() first.");

  const sc = await getClient();
  const bs58 = await import("bs58");
  const txBase58 = bs58.default.encode(serializedTx);

  const result = await Promise.race([
    sc.request<{ signature: string }>({
      topic: activeSession.topic,
      chainId: activeSession.chainId,
      request: {
        method: "solana_signTransaction",
        params: { transaction: txBase58 },
      },
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Transaction approval timed out")), SIGN_TIMEOUT_MS),
    ),
  ]);

  const decoded = bs58.default.decode(result.signature);

  // Wallets may return either the 64-byte signature or the full signed transaction.
  // If it's 64 bytes, it's just the signature — we need to insert it into the transaction.
  // If it's longer, it's the full signed transaction ready for broadcast.
  if (decoded.length === 64) {
    return insertPayerSignature(serializedTx, decoded, activeSession.publicKey);
  }

  return decoded;
}

/**
 * Insert a payer signature into a partially-signed transaction.
 * In Solana wire format: [num_sigs (compact-u16)] [sig1] [sig2] ... [message]
 * The fee payer's signature is always at the first slot.
 */
function insertPayerSignature(
  txBytes: Uint8Array,
  signature: Uint8Array,
  _payerPubkey: string,
): Uint8Array {
  // For compact-u16, values < 128 are a single byte
  const numSigs = txBytes[0];
  if (numSigs === 0 || numSigs >= 128) {
    throw new Error(`Unexpected number of signatures: ${numSigs}`);
  }

  // Fee payer signature is always at offset 1 (first signature slot)
  const result = new Uint8Array(txBytes);
  result.set(signature, 1);
  return result;
}

/** Get the currently connected wallet's public key, or null */
export function getConnectedWallet(): string | null {
  if (activeSession) return activeSession.publicKey;

  const stored = loadStoredSession();
  if (stored && stored.chainId === getChainId()) return stored.publicKey;
  return null;
}

/** Check if a wallet session exists (may or may not be still valid) */
export function hasStoredSession(): boolean {
  return loadStoredSession() !== null;
}

/** Disconnect the wallet and clear stored session */
export async function disconnectWallet(): Promise<void> {
  if (activeSession) {
    try {
      const sc = await getClient();
      await sc.disconnect({
        topic: activeSession.topic,
        reason: { code: 6000, message: "User disconnected" },
      });
    } catch {}
    activeSession = null;
  }
  clearStoredSession();
}

/** Generate a QR code string for terminal display */
export function generateQrString(uri: string): Promise<string> {
  return new Promise((resolve) => {
    qrcode.generate(uri, { small: true }, (qr: string) => {
      resolve(qr);
    });
  });
}

// --- Session persistence at ~/.tokenmonsters/wallet-session.json ---

function storeSession(session: StoredSession): void {
  const dir = join(homedir(), ".tokenmonsters");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(SESSION_PATH, JSON.stringify(session), { mode: 0o600 });
}

function loadStoredSession(): StoredSession | null {
  if (!existsSync(SESSION_PATH)) return null;
  try {
    const data = JSON.parse(readFileSync(SESSION_PATH, "utf-8"));
    if (!data.topic || !data.publicKey || !data.chainId) return null;
    return data;
  } catch {
    return null;
  }
}

function clearStoredSession(): void {
  try {
    if (existsSync(SESSION_PATH)) unlinkSync(SESSION_PATH);
  } catch {}
}
