import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import type { Monster, Species, TokenFeed, TokenSource } from "../models/types";
import { getActiveMonster, getMonster, getSpeciesById, getRecentFeeds, updateMonster } from "../db/queries";
import { gameTick, feedMonster, TICK_INTERVAL } from "./engine";

interface GameState {
  monster: Monster | null;
  species: Species | null;
  recentFeeds: TokenFeed[];
  isEvolving: boolean;
  evolutionTarget: string | null;
  daemonConnected: boolean;
}

interface GameActions {
  refresh: () => void;
  feed: (source: TokenSource, input: number, output: number, cache: number) => void;
  nameMonster: (name: string) => void;
  setDaemonConnected: (connected: boolean) => void;
  setEvolving: (evolving: boolean) => void;
}

const GameContext = createContext<(GameState & GameActions) | null>(null);

// Track monster ID outside React so intervals/callbacks always know which monster
let activeId: string | null = null;

export function GameProvider({ children }: { children: ReactNode }) {
  const [monster, setMonster] = useState<Monster | null>(null);
  const [species, setSpecies] = useState<Species | null>(null);
  const [recentFeeds, setRecentFeeds] = useState<TokenFeed[]>([]);
  const [isEvolving, setIsEvolving] = useState(false);
  const [evolutionTarget, setEvolutionTarget] = useState<string | null>(null);
  const [daemonConnected, setDaemonConnected] = useState(false);

  const refresh = useCallback(() => {
    const m = getActiveMonster();
    activeId = m?.id ?? null;
    setMonster(m);
    if (m) {
      const s = getSpeciesById(m.speciesId);
      setSpecies(s);
      setRecentFeeds(getRecentFeeds(m.id));
    }
  }, []);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Game tick loop — reads fresh from DB each tick
  useEffect(() => {
    if (!activeId) return;
    const id = activeId;

    const interval = setInterval(() => {
      const freshMonster = getMonster(id);
      const s = freshMonster ? getSpeciesById(freshMonster.speciesId) : null;
      if (!freshMonster || !s) return;

      const { monster: updated } = gameTick(freshMonster, s, Date.now());
      const persisted = updateMonster(updated);
      setMonster(persisted);
    }, TICK_INTERVAL);

    return () => clearInterval(interval);
  }, [activeId]);

  // Feed always reads fresh from DB so concurrent calls don't clobber each other
  const feed = useCallback(
    (source: TokenSource, input: number, output: number, cache: number) => {
      if (!activeId) return;
      const freshMonster = getMonster(activeId);
      const s = freshMonster ? getSpeciesById(freshMonster.speciesId) : null;
      if (!freshMonster || !s) return;

      const result = feedMonster(freshMonster, s, source, input, output, cache);
      setMonster(result.monster);
      setRecentFeeds(getRecentFeeds(result.monster.id));

      if (result.evolved && result.newStage) {
        setEvolutionTarget(result.newStage);
        setIsEvolving(true);
      }
    },
    []
  );

  const nameMonster = useCallback(
    (name: string) => {
      if (!activeId) return;
      const freshMonster = getMonster(activeId);
      if (!freshMonster) return;
      const updated = updateMonster({ ...freshMonster, name });
      setMonster(updated);
    },
    []
  );

  return (
    <GameContext.Provider
      value={{
        monster,
        species,
        recentFeeds,
        isEvolving,
        evolutionTarget,
        daemonConnected,
        refresh,
        feed,
        nameMonster,
        setDaemonConnected,
        setEvolving: setIsEvolving,
      }}
    >
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used within GameProvider");
  return ctx;
}
