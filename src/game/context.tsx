import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import type { Monster, Species, TokenFeed, TokenSource, Stage } from "../models/types";
import { getActiveMonster, getMonster, getSpeciesById, getRecentFeeds, updateMonster, setActiveMonster } from "../db/queries";
import { gameTick, feedMonster, TICK_INTERVAL } from "./engine";
import { playSound, startAlert, stopAlert } from "../audio/player";

/** How long without a keypress before we consider the user idle (ms) */
const IDLE_THRESHOLD = 30_000;

interface PendingEvolution {
  newStage: Stage;
  fromStage: Stage;
}

interface GameState {
  monster: Monster | null;
  species: Species | null;
  recentFeeds: TokenFeed[];
  isEvolving: boolean;
  evolutionTarget: string | null;
  evolutionFromStage: Stage | null;
  evolutionPending: boolean;
  daemonConnected: boolean;
}

interface GameActions {
  refresh: () => void;
  feed: (source: TokenSource, input: number, output: number, cache: number) => void;
  nameMonster: (name: string) => void;
  switchMonster: (id: string) => void;
  setDaemonConnected: (connected: boolean) => void;
  setEvolving: (evolving: boolean) => void;
  reportKeystroke: () => void;
}

const GameContext = createContext<(GameState & GameActions) | null>(null);

// Track monster ID outside React so intervals/callbacks always know which monster
let activeId: string | null = null;

// Track last keystroke time outside React — needs to be readable from callbacks
let lastKeystrokeAt = Date.now();

export function GameProvider({ children }: { children: ReactNode }) {
  const [monster, setMonster] = useState<Monster | null>(null);
  const [species, setSpecies] = useState<Species | null>(null);
  const [recentFeeds, setRecentFeeds] = useState<TokenFeed[]>([]);
  const [isEvolving, setIsEvolving] = useState(false);
  const [evolutionTarget, setEvolutionTarget] = useState<string | null>(null);
  const [evolutionFromStage, setEvolutionFromStage] = useState<Stage | null>(null);
  const [daemonConnected, setDaemonConnected] = useState(false);
  const pendingRef = useRef<PendingEvolution | null>(null);
  const evolvingRef = useRef(false);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [evolutionPending, setEvolutionPending] = useState(false);


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

  // Poll for pending evolution — check every 500ms if user has returned
  useEffect(() => {
    const interval = setInterval(() => {
      if (!pendingRef.current) return;
      const timeSinceKeystroke = Date.now() - lastKeystrokeAt;
      if (timeSinceKeystroke < 2000) {
        // User is back — stop alert and fire the evolution screen
        stopAlert();
        const pending = pendingRef.current;
        pendingRef.current = null;
        setEvolutionPending(false);
        evolvingRef.current = true;
        setEvolutionFromStage(pending.fromStage);
        setEvolutionTarget(pending.newStage);
        setIsEvolving(true);
      }
    }, 500);

    return () => clearInterval(interval);
  }, []);

  const reportKeystroke = useCallback(() => {
    lastKeystrokeAt = Date.now();
  }, []);

  // Feed always reads fresh from DB so concurrent calls don't clobber each other
  const feed = useCallback(
    (source: TokenSource, input: number, output: number, cache: number) => {
      if (!activeId) return;
      // Block ALL feeding while evolution animation is playing — feedMonster
      // writes to DB immediately, so if we let it run, the monster silently
      // evolves through multiple stages causing a loop
      if (evolvingRef.current || pendingRef.current) return;

      const freshMonster = getMonster(activeId);
      const s = freshMonster ? getSpeciesById(freshMonster.speciesId) : null;
      if (!freshMonster || !s) return;

      const result = feedMonster(freshMonster, s, source, input, output, cache);
      setMonster(result.monster);
      setRecentFeeds(getRecentFeeds(result.monster.id));

      if (result.leveledUp) {
        playSound("level-up");
      }

      if (result.evolved && result.newStage) {
        // freshMonster.stage is the stage BEFORE feedMonster evolved it
        const fromStage = freshMonster.stage;
        const idle = Date.now() - lastKeystrokeAt > IDLE_THRESHOLD;
        if (idle) {
          // User is AFK — loop alert and queue the evolution screen
          startAlert(30_000);
          pendingRef.current = { newStage: result.newStage, fromStage };
          setEvolutionFromStage(fromStage);
          setEvolutionPending(true);
        } else {
          evolvingRef.current = true;
          setEvolutionFromStage(fromStage);
          setEvolutionTarget(result.newStage);
          setIsEvolving(true);
        }
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

  const switchMonster = useCallback(
    (id: string) => {
      setActiveMonster(id);
      refresh();
    },
    [refresh]
  );

  return (
    <GameContext.Provider
      value={{
        monster,
        species,
        recentFeeds,
        isEvolving,
        evolutionTarget,
        evolutionFromStage,
        evolutionPending,
        daemonConnected,
        refresh,
        feed,
        nameMonster,
        switchMonster,
        setDaemonConnected,
        setEvolving: (v: boolean) => {
          setIsEvolving(v);
          if (v) {
            // Starting evolution — clear any pending cooldown
            if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
            evolvingRef.current = true;
          } else {
            // Animation done — clear UI state but keep feed guard up
            // to prevent a chained evolution from immediately re-triggering
            setEvolutionFromStage(null);
            setEvolutionTarget(null);
            cooldownTimer.current = setTimeout(() => {
              evolvingRef.current = false;
            }, 5000);
          }
        },
        reportKeystroke,
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
