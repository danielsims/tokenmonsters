import { useState, useEffect } from "react";
import { useGame } from "../../game/context";
import { getCurrentForm } from "../../models/evolution";

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
      backgroundColor="#0a0a1a"
    >
      {!complete ? (
        <>
          <text fg="#ffdd44">
            <strong>EVOLVING{dotStr}</strong>
          </text>
          <box height={1} />
          <text fg="#aaaacc">Your monster is transforming!</text>
          <box height={1} />
          <text fg="#ffaa00">
            {"*".repeat(20 + dots * 5)}
          </text>
        </>
      ) : (
        <>
          <text fg="#44ff44">
            <strong>EVOLUTION COMPLETE!</strong>
          </text>
          <box height={1} />
          <text fg="#ffffff">
            Your monster evolved to <strong fg="#ffdd44">{formName}</strong>!
          </text>
        </>
      )}
    </box>
  );
}
