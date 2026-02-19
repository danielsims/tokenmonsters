import { useState, useEffect } from "react";
import { useTimeline } from "@opentui/react";
import { useGame } from "../../game/context";

const HATCH_FRAMES = [
  [
    "      ___      ",
    "    /     \\    ",
    "   |       |   ",
    "   |       |   ",
    "    \\_____/    ",
  ],
  [
    "      _*_      ",
    "    / * * \\    ",
    "   |   *   |   ",
    "   | *   * |   ",
    "    \\_*_*_/    ",
  ],
  [
    "     _/ \\_     ",
    "   /  * *  \\   ",
    "  | *     * |  ",
    "   \\  * *  /   ",
    "    \\_/ \\_/    ",
  ],
  [
    "   \\  / \\  /   ",
    "  * \\/ * \\/ *  ",
    "  *  (o.o)  *  ",
    "  *  (> <)  *  ",
    "    * * * *    ",
  ],
  [
    "               ",
    "    (\\_/)      ",
    "    (o.o)      ",
    "    (> <)      ",
    "               ",
  ],
];

export function HatchScreen({ onComplete }: { onComplete: () => void }) {
  const { monster } = useGame();
  const [frame, setFrame] = useState(0);
  const [showMessage, setShowMessage] = useState(false);

  useEffect(() => {
    let current = 0;
    const interval = setInterval(() => {
      current++;
      if (current >= HATCH_FRAMES.length) {
        clearInterval(interval);
        setShowMessage(true);
        setTimeout(onComplete, 3000);
        return;
      }
      setFrame(current);
    }, 800);

    return () => clearInterval(interval);
  }, [onComplete]);

  const art = HATCH_FRAMES[frame].join("\n");

  return (
    <box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      width="100%"
      height="100%"
      backgroundColor="#0a0a1a"
    >
      <text fg="#ffdd44">{art}</text>
      <box height={2} />
      {showMessage && (
        <box flexDirection="column" alignItems="center">
          <text>
            <strong fg="#ffffff">Your egg has hatched!</strong>
          </text>
          <text fg="#aaaacc">
            A {monster?.name ? `${monster.name}` : "new creature"} has emerged!
          </text>
        </box>
      )}
      {!showMessage && frame < HATCH_FRAMES.length - 1 && (
        <text fg="#888888">The egg is cracking...</text>
      )}
    </box>
  );
}
