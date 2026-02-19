import { useState } from "react";
import { useKeyboard } from "@opentui/react";
import { useMonster } from "../hooks/useMonster";

const WELCOME_ART = [
  "  _____ ___  _  _____ _  _   __  __  ___  _  _ ___ _____ ___ ___  ___",
  " |_   _/ _ \\| |/ / __| \\| | |  \\/  |/ _ \\| \\| / __|_   _| __| _ \\/ __|",
  "   | || (_) | ' <| _|| .` | | |\\/| | (_) | .` \\__ \\ | | | _||   /\\__ \\",
  "   |_| \\___/|_|\\_\\___|_|\\_| |_|  |_|\\___/|_|\\_|___/ |_| |___|_|_\\|___/",
].join("\n");

export function WelcomeScreen({ onComplete }: { onComplete: (name: string) => void }) {
  const [step, setStep] = useState<"intro" | "naming">("intro");
  const [name, setName] = useState("");
  const { generateEgg, nameMonster, refresh } = useMonster();

  useKeyboard((key) => {
    if (step === "intro") {
      if (key.name === "return" || key.name === "space") {
        // Generate the egg first
        generateEgg();
        setStep("naming");
      }
      return;
    }

    if (step === "naming") {
      if (key.name === "return" && name.length > 0) {
        nameMonster(name);
        onComplete(name);
        return;
      }
      if (key.name === "backspace" || key.name === "delete") {
        setName((n) => n.slice(0, -1));
        return;
      }
      // Accept printable characters
      if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        setName((n) => n + key.sequence);
      }
    }
  });

  return (
    <box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      width="100%"
      height="100%"
      backgroundColor="#0a0a1a"
    >
      <text fg="#ff8844">{WELCOME_ART}</text>
      <box height={2} />

      {step === "intro" && (
        <>
          <text fg="#aaaacc">
            Your AI token consumption feeds and evolves digital creatures.
          </text>
          <text fg="#888888">
            Every token from Claude Code, Codex, or OpenCode powers your monster's growth.
          </text>
          <box height={2} />
          <text fg="#ffffff">
            <strong>Press ENTER to receive your first egg!</strong>
          </text>
        </>
      )}

      {step === "naming" && (
        <>
          <text fg="#44ff44">
            A mysterious egg appears before you...
          </text>
          <box height={1} />
          <text fg="#ffffff">
            <strong>Name your creature:</strong>
          </text>
          <box height={1} />
          <box
            border
            borderStyle="rounded"
            borderColor="#444466"
            paddingX={2}
            width={40}
          >
            <text fg={name.length > 0 ? "#ffffff" : "#555555"}>
              {name.length > 0 ? name : "Type a name..."}
              <span fg="#ffdd44">_</span>
            </text>
          </box>
          <box height={1} />
          <text fg="#555555">Press ENTER to confirm</text>
        </>
      )}
    </box>
  );
}
