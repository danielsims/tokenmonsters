import { useEffect } from "react";
import { useGame } from "../../game/context";
import { useTokenTracker } from "./useTokenTracker";
import type { TokenEvent } from "../../tracking/types";

/** Connects the token daemon to the game engine */
export function useGameLoop() {
  const game = useGame();

  const onTokens = (events: TokenEvent[]) => {
    for (const event of events) {
      game.feed(event.source, event.inputTokens, event.outputTokens, event.cacheTokens);
    }
  };

  const { connected } = useTokenTracker(onTokens);

  useEffect(() => {
    game.setDaemonConnected(connected);
  }, [connected]);

  return { connected };
}
