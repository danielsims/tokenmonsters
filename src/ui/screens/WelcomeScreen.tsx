import { useState } from "react";
import { useKeyboard } from "@opentui/react";
import { useMonster } from "../hooks/useMonster";
import { t } from "../theme";

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
      backgroundColor={t.bg.base}
    >
      <text fg={t.accent.warm}>{WELCOME_ART}</text>
      <box height={2} />

      {step === "intro" && (
        <>
          <text fg={t.text.secondary}>
            Your AI token consumption feeds and evolves digital creatures.
          </text>
          <text fg={t.text.muted}>
            Every token from Claude Code, Codex, or OpenCode powers your monster's growth.
          </text>
          <box height={2} />
          <text fg={t.text.primary}>
            <strong>Press ENTER to receive your first egg!</strong>
          </text>
        </>
      )}

      {step === "naming" && (
        <>
          <text fg={t.accent.green}>
            A mysterious egg appears before you...
          </text>
          <box height={1} />
          <text fg={t.text.primary}>
            <strong>Name your creature:</strong>
          </text>
          <box height={1} />
          <box
            border
            borderStyle="rounded"
            borderColor={t.border.muted}
            paddingX={2}
            width={40}
          >
            <text fg={name.length > 0 ? t.text.primary : t.text.dim}>
              {name.length > 0 ? name : "Type a name..."}
              <span fg={t.accent.primary}>_</span>
            </text>
          </box>
          <box height={1} />
          <text fg={t.text.dim}>Press ENTER to confirm</text>
        </>
      )}
    </box>
  );
}
