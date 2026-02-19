import { useState, useCallback } from "react";
import { useKeyboard, useRenderer } from "@opentui/react";
import { GameProvider, useGame } from "./game/context";
import { useGameLoop } from "./ui/hooks/useGameLoop";
import { useMonster } from "./ui/hooks/useMonster";
import { HomeScreen } from "./ui/screens/HomeScreen";
import { InfoScreen } from "./ui/screens/InfoScreen";
import { HatchScreen } from "./ui/screens/HatchScreen";
import { EvolveScreen } from "./ui/screens/EvolveScreen";
import { WelcomeScreen } from "./ui/screens/WelcomeScreen";

type Screen = "welcome" | "home" | "info" | "hatch" | "evolve";

function AppInner() {
  const renderer = useRenderer();
  const { monster, isEvolving, setEvolving } = useGame();
  const { isFirstRun, generateEgg } = useMonster();
  useGameLoop();

  const [screen, setScreen] = useState<Screen>(() => {
    if (isFirstRun()) return "welcome";
    return "home";
  });

  // Handle evolution events
  if (isEvolving && screen !== "evolve" && screen !== "hatch") {
    // Determine if this is egg→hatchling (hatch) or other evolution
    if (monster?.stage === "hatchling") {
      setScreen("hatch");
    } else {
      setScreen("evolve");
    }
  }

  const handleEvolveComplete = useCallback(() => {
    setEvolving(false);
    setScreen("home");
  }, [setEvolving]);

  const handleWelcomeComplete = useCallback(
    (_name: string) => {
      // Egg generation + naming handled in WelcomeScreen
      setScreen("home");
    },
    []
  );

  useKeyboard((key) => {
    if (screen === "welcome" || screen === "hatch" || screen === "evolve") return;

    if (key.name === "q" || (key.ctrl && key.name === "c")) {
      renderer.destroy();
      return;
    }

    if (key.name === "i" || key.name === "tab") {
      setScreen((s) => (s === "info" ? "home" : "info"));
    }
  });

  switch (screen) {
    case "welcome":
      return <WelcomeScreen onComplete={handleWelcomeComplete} />;
    case "home":
      return <HomeScreen />;
    case "info":
      return <InfoScreen />;
    case "hatch":
      return <HatchScreen onComplete={handleEvolveComplete} />;
    case "evolve":
      return <EvolveScreen onComplete={handleEvolveComplete} />;
  }
}

export function App() {
  return (
    <GameProvider>
      <AppInner />
    </GameProvider>
  );
}
