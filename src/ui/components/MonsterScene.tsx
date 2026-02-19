import { useRef, useMemo, useCallback } from "react";
import { useGame } from "../../game/context";
import { decodeGenome } from "../../models/genome";
import { getEvolutionProgress } from "../../models/evolution";
import { createEggScene } from "../../three/scenes/egg";
import { createHatchlingScene } from "../../three/scenes/hatchling";
import { createJuvenileScene } from "../../three/scenes/juvenile";
import { createAdultScene } from "../../three/scenes/adult";

export function MonsterScene() {
  const { monster, species } = useGame();
  const timeRef = useRef(0);

  const traits = useMemo(
    () => (monster ? decodeGenome(monster.genome) : null),
    [monster?.genome],
  );

  const progress = monster && species ? getEvolutionProgress(monster, species) : 0;

  const sceneData = useMemo(() => {
    if (!traits || !monster) return null;
    switch (monster.stage) {
      case "egg":
        return createEggScene(traits);
      case "hatchling":
        return createHatchlingScene(traits);
      case "prime":
        return createJuvenileScene(traits);
      case "apex":
        return createAdultScene(traits);
    }
  }, [monster?.stage, traits]);

  const wobbleIntensity = monster?.stage === "egg" ? Math.max(0, (progress - 50) / 50) : 0;

  const renderBefore = useCallback(
    (_buffer: any, deltaTime: number) => {
      if (!sceneData) return;
      timeRef.current += deltaTime / 1000;
      if (monster?.stage === "egg") {
        (sceneData as any).update(timeRef.current, wobbleIntensity);
      } else {
        (sceneData as any).update(timeRef.current);
      }
    },
    [sceneData, monster?.stage, wobbleIntensity],
  );

  if (!monster || !species || !sceneData) {
    return (
      <box justifyContent="center" alignItems="center" flexGrow={1}>
        <text fg="#666666">No monster yet...</text>
      </box>
    );
  }

  return (
    <threeScene
      scene={sceneData.scene}
      camera={sceneData.camera}
      autoAspect
      flexGrow={1}
      renderBefore={renderBefore}
    />
  );
}
