import { useState, useEffect, useCallback, useRef } from "react";
import type { TokenEvent } from "../../tracking/types";

const SOCKET_PATH = process.env.TOKENMONSTERS_SOCKET ?? "/tmp/tokenmonsters.sock";
const POLL_INTERVAL = 3_000;

async function fetchFromDaemon(path: string): Promise<any | null> {
  try {
    const resp = await fetch(`http://localhost${path}`, {
      unix: SOCKET_PATH,
    } as any);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

export function useTokenTracker(onTokens?: (events: TokenEvent[]) => void) {
  const [connected, setConnected] = useState(false);
  const [latestEvents, setLatestEvents] = useState<TokenEvent[]>([]);
  const callbackRef = useRef(onTokens);
  callbackRef.current = onTokens;

  const checkHealth = useCallback(async () => {
    const data = await fetchFromDaemon("/health");
    setConnected(data?.status === "ok");
    return data?.status === "ok";
  }, []);

  useEffect(() => {
    let alive = true;

    const poll = async () => {
      if (!alive) return;

      const healthy = await checkHealth();
      if (!healthy) return;

      const data = await fetchFromDaemon("/tokens/latest");
      if (data?.events?.length) {
        setLatestEvents(data.events);
        callbackRef.current?.(data.events);
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL);

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [checkHealth]);

  return { connected, latestEvents };
}
