import { useState, useEffect } from "react";
import { useGame } from "../../game/context";
import { getCurrentForm } from "../../models/evolution";
import { t } from "../theme";

export function EvolveScreen({ onComplete }: { onComplete: () => void }) {
  const { monster, species } = useGame();
  const [dots, setDots] = useState(0);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const dotInterval = setInterval(() => {
      setDots((d) => (d + 1) % 4);
    }, 400);

    const completeTimer = setTimeout(() => {
      clearInterval(dotInterval);
      setComplete(true);
      setTimeout(onComplete, 2500);
    }, 3000);

    return () => {
      clearInterval(dotInterval);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  const form = monster && species ? getCurrentForm(species, monster.stage) : null;
  const formName = form?.name ?? "???";
  const dotStr = ".".repeat(dots);

  return (
    <box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      width="100%"
      height="100%"
      backgroundColor={t.bg.base}
    >
      {!complete ? (
        <>
          <text fg={t.accent.primary}>
            <strong>EVOLVING{dotStr}</strong>
          </text>
          <box height={1} />
          <text fg={t.text.secondary}>Your monster is transforming!</text>
          <box height={1} />
          <text fg={t.accent.warm}>
            {"*".repeat(20 + dots * 5)}
          </text>
        </>
      ) : (
        <>
          <text fg={t.accent.green}>
            <strong>EVOLUTION COMPLETE!</strong>
          </text>
          <box height={1} />
          <text fg={t.text.primary}>
            Your monster evolved to <strong fg={t.accent.primary}>{formName}</strong>!
          </text>
        </>
      )}
    </box>
  );
}
