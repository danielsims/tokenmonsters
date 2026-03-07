import { useState, useCallback } from "react";
import { useKeyboard, useRenderer } from "@opentui/react";
import { GameProvider, useGame } from "./game/context";
import { useGameLoop } from "./ui/hooks/useGameLoop";
import { useMonster } from "./ui/hooks/useMonster";
import { HomeScreen } from "./ui/screens/HomeScreen";
import { InfoScreen } from "./ui/screens/InfoScreen";
import { HatchScreen } from "./ui/screens/HatchScreen";
import { EvolveScreen } from "./ui/screens/EvolveScreen";
import { OnboardingScreen } from "./ui/screens/OnboardingScreen";
import { RegistryScreen } from "./ui/screens/RegistryScreen";
import { PartyScreen } from "./ui/screens/PartyScreen";
import { getSetting, setSetting } from "./db/queries";
import { cycleTheme, setTheme, getThemeName } from "./ui/theme";

type Screen = "welcome" | "home" | "info" | "hatch" | "evolve" | "registry" | "party" | "new-egg";

function AppInner() {
  const renderer = useRenderer();
  const { monster, isEvolving, evolutionFromStage, setEvolving, reportKeystroke } = useGame();
  const { isFirstRun, generateEgg } = useMonster();
  useGameLoop();

  // Theme version counter — bump to force re-render after theme switch
  const [, setThemeVersion] = useState(0);

  const [screen, setScreen] = useState<Screen>(() => {
    // Restore saved theme on startup
    const saved = getSetting("theme");
    if (saved) setTheme(saved);

    if (isFirstRun()) return "welcome";
    return "home";
  });

  // Handle evolution events — wait for both isEvolving AND evolutionFromStage
  // to be set before routing, otherwise the else branch fires prematurely
  if (isEvolving && evolutionFromStage !== null && screen !== "evolve" && screen !== "hatch") {
    if (evolutionFromStage === "egg") {
      setScreen("hatch");
    } else {
      setScreen("evolve");
    }
  }

  const handleEvolveComplete = useCallback(() => {
    setEvolving(false);
    setScreen("home");
  }, [setEvolving]);

  const handleWelcomeComplete = useCallback(() => {
    setScreen("home");
  }, []);

  // Track ALL keypresses for focus-gating (runs on every screen including evolve/hatch)
  useKeyboard(() => {
    reportKeystroke();
  });

  useKeyboard((key) => {
    if (key.name === "q" || (key.ctrl && key.name === "c")) {
      renderer.destroy();
      return;
    }

    if (screen === "welcome" || screen === "hatch" || screen === "evolve" || screen === "new-egg") return;

    if (key.name === "escape" && screen !== "home") {
      setScreen("home");
      return;
    }

    if (key.name === "i" || key.name === "tab") {
      setScreen((s) => (s === "info" ? "home" : "info"));
    }

    if (key.name === "r") {
      setScreen((s) => (s === "registry" ? "home" : "registry"));
    }

    if (key.name === "p") {
      setScreen((s) => (s === "party" ? "home" : "party"));
    }

    if (key.name === "e") {
      setScreen((s) => (s === "new-egg" ? "home" : "new-egg"));
    }

    if (key.name === "m") {
      const current = getSetting("sound_mute");
      setSetting("sound_mute", current === "on" ? "off" : "on");
      setThemeVersion((v) => v + 1); // re-render to update StatusBar mute label
    }

    if (key.name === "t") {
      const newName = cycleTheme();
      setSetting("theme", newName);
      setThemeVersion((v) => v + 1);
    }
  });

  switch (screen) {
    case "welcome":
      return <OnboardingScreen onComplete={handleWelcomeComplete} />;
    case "home":
      return <HomeScreen />;
    case "info":
      return <InfoScreen />;
    case "hatch":
      return <HatchScreen onComplete={handleEvolveComplete} />;
    case "evolve":
      return <EvolveScreen onComplete={handleEvolveComplete} />;
    case "registry":
      return <RegistryScreen />;
    case "party":
      return <PartyScreen onSwitch={() => setScreen("home")} />;
    case "new-egg":
      return <OnboardingScreen onComplete={() => setScreen("home")} mode="new-egg" />;
  }
}

export function App() {
  return (
    <GameProvider>
      <AppInner />
    </GameProvider>
  );
}
