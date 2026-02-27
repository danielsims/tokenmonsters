import { execSync } from "child_process";
import { randomBytes } from "crypto";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";

const LINK_TIMEOUT_MS = 120_000; // 2 minutes to connect wallet
const WEBSITE_URL = process.env.TOKENMON_WEBSITE_URL || "https://tokenmonsters.vercel.app";

export interface LinkResult {
  address: string;
  /** Whether the wallet was cryptographically verified via signature */
  verified: boolean;
}

/**
 * Link a wallet by opening the browser and waiting for the callback.
 *
 * Flow:
 * 1. Generate a random nonce for challenge-response auth
 * 2. Start a local HTTP server on a random port
 * 3. Open the website's /link page with port + nonce as query params
 * 4. User connects Phantom, signs the nonce message
 * 5. Website redirects to localhost with address + signature
 * 6. Game verifies Ed25519 signature to prove wallet ownership
 * 7. Return the verified wallet address
 */
export async function linkWallet(opts?: { fresh?: boolean }): Promise<LinkResult> {
  const port = await findFreePort();
  const nonce = randomBytes(16).toString("hex");
  const challenge = `tokenmon-link:${Date.now()}:${nonce}`;

  let linkUrl = `${WEBSITE_URL}/link?port=${port}&nonce=${encodeURIComponent(challenge)}`;
  if (opts?.fresh) linkUrl += "&fresh=1";

  return new Promise<LinkResult>((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.stop();
      reject(new Error("Wallet connection timed out"));
    }, LINK_TIMEOUT_MS);

    const server = Bun.serve({
      port,
      fetch(req) {
        const url = new URL(req.url);

        if (url.pathname === "/wallet") {
          const address = url.searchParams.get("address");
          const signature = url.searchParams.get("signature");
          const message = url.searchParams.get("message");

          if (!address || address.length < 32) {
            return new Response("Invalid address", { status: 400 });
          }

          clearTimeout(timeout);
          setTimeout(() => server.stop(), 500);

          // Verify the signature if provided
          let verified = false;
          if (signature && message) {
            try {
              verified = verifyWalletSignature(address, message, signature);
            } catch {
              // Signature verification failed — still accept the address but mark as unverified
              verified = false;
            }
          }

          resolve({ address, verified });

          const statusText = verified ? "Wallet verified" : "Wallet linked";
          const statusColor = verified ? "#4ade80" : "#fbbf24";
          return new Response(
            `<html>
              <head><style>body{background:#0a0a0a;color:#e4e4e7;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}</style></head>
              <body><div style="text-align:center"><p style="color:${statusColor};font-size:18px">${statusText}</p><p style="color:#71717a;font-size:14px">You can close this tab.</p></div></body>
            </html>`,
            { headers: { "Content-Type": "text/html" } },
          );
        }

        return new Response("Not found", { status: 404 });
      },
    });

    // Open the link page in the default browser
    try {
      if (process.platform === "darwin") {
        execSync(`open "${linkUrl}"`);
      } else if (process.platform === "linux") {
        execSync(`xdg-open "${linkUrl}"`);
      } else {
        execSync(`start "" "${linkUrl}"`);
      }
    } catch {
      clearTimeout(timeout);
      server.stop();
      reject(new Error("Could not open browser"));
    }
  });
}

/**
 * Verify an Ed25519 signature from a Solana wallet.
 * Phantom's signMessage() produces a raw Ed25519 signature over the UTF-8 message bytes.
 */
function verifyWalletSignature(address: string, message: string, signatureBase64: string): boolean {
  const publicKeyBytes = bs58.decode(address);
  const messageBytes = new TextEncoder().encode(message);
  const signatureBytes = Buffer.from(signatureBase64, "base64");
  return ed25519.verify(signatureBytes, messageBytes, publicKeyBytes);
}

async function findFreePort(): Promise<number> {
  const server = Bun.serve({ port: 0, fetch: () => new Response("") });
  const port = server.port!;
  server.stop();
  return port;
}
