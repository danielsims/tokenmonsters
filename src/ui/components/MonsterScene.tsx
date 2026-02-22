import { useRef, useMemo, useCallback, useState, useEffect } from "react";
import { useKeyboard } from "@opentui/react";
import { useGame } from "../../game/context";
import { decodeGenome } from "../../models/genome";
import { getEvolutionProgress } from "../../models/evolution";
import { createEggScene } from "../../three/scenes/egg";
import { createHatchlingScene } from "../../three/scenes/hatchling";
import { createJuvenileScene } from "../../three/scenes/juvenile";
import { createAdultScene } from "../../three/scenes/adult";
import { loadGlbTestScene } from "../../three/glb-loader";
import { resolve } from "path";
import { existsSync } from "fs";
import type { Species, Stage } from "../../models/types";

/**
 * Model directory layout:
 *   src/three/models/<speciesId>/<formName>.glb
 *
 * Form names come from species.ts (lowercased).
 * e.g. byteclaw/bytepup.glb, byteclaw/byteclaw-egg.glb
 */
const modelsRoot = resolve(import.meta.dir, "../../three/models");

interface SpeciesConfig {
  background?: number;
}

function getGlbModel(species: Species | null, stage: Stage): string | null {
  if (!species) return null;
  const form = species.forms.find((f) => f.stage === stage);
  if (!form) return null;
  const formName = form.name.toLowerCase().replace(/\s+/g, "-");
  const path = resolve(modelsRoot, species.id, formName + ".glb");
  if (existsSync(path)) return path;
  return null;
}

function loadFormConfig(speciesId: string, formName: string): SpeciesConfig {
  try {
    const configPath = resolve(modelsRoot, speciesId, "config.json");
    if (!existsSync(configPath)) return {};
    const raw = JSON.parse(require("fs").readFileSync(configPath, "utf-8"));
    // Per-form background takes priority, then species-level fallback
    const formBg = raw.forms?.[formName]?.background;
    const speciesBg = raw.background;
    const bg = formBg ?? speciesBg;
    return {
      background: bg != null ? parseInt(String(bg), 16) : undefined,
    };
  } catch {
    return {};
  }
}

export function MonsterScene() {
  const { monster, species } = useGame();
  const timeRef = useRef(0);
  const [glbReady, setGlbReady] = useState(false);

  // User rotation: pauseAccum tracks total paused time so orbit resumes in place
  const dragRef = useRef({ rotation: 0, lastInteraction: 0, pauseAccum: 0, zoom: 0 });

  const traits = useMemo(
    () => (monster ? decodeGenome(monster.genome) : null),
    [monster?.genome],
  );

  const progress = monster && species ? getEvolutionProgress(monster, species) : 0;

  const glbPath = monster && species ? getGlbModel(species, monster.stage) : null;

  const currentFormName = useMemo(() => {
    if (!monster || !species) return "";
    const form = species.forms.find((f) => f.stage === monster.stage);
    return form ? form.name.toLowerCase().replace(/\s+/g, "-") : "";
  }, [monster?.stage, species]);

  const speciesConfig = useMemo(
    () => species && currentFormName ? loadFormConfig(species.id, currentFormName) : {},
    [species?.id, currentFormName],
  );

  const glbScene = useMemo(() => {
    if (!glbPath) return null;
    return loadGlbTestScene(glbPath, {
      targetHeight: 1.4,
      cameraDistance: 3.2,
      cameraHeight: -2.0,
      lookAtHeight: -2.0,
      orbitSpeed: 0.3,
      ...speciesConfig,
    });
  }, [glbPath, speciesConfig]);

  useEffect(() => {
    if (!glbScene) { setGlbReady(false); return; }
    glbScene.ready.then(() => setGlbReady(true)).catch(() => setGlbReady(false));
  }, [glbScene]);

  const sceneData = useMemo(() => {
    if (glbScene && glbReady) return glbScene;
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
  }, [monster?.stage, traits, glbScene, glbReady]);

  const wobbleIntensity = monster?.stage === "egg" ? Math.max(0, (progress - 50) / 50) : 0;

  const isGlb = !!(glbScene && glbReady);

  // Arrow key rotation — pauses auto-spin for 1.5s, resumes from current position
  useKeyboard((key) => {
    if (!isGlb) return;
    if (key.name === "left" || key.name === "right") {
      const d = dragRef.current;
      d.rotation += key.name === "left" ? -0.15 : 0.15;
      d.lastInteraction = Date.now();
    }
    if (key.name === "up" || key.name === "down") {
      const d = dragRef.current;
      d.zoom += key.name === "up" ? -0.2 : 0.2;
      d.zoom = Math.max(-2, Math.min(4, d.zoom));
    }
  });

  const PAUSE_MS = 1500;

  const renderBefore = useCallback(
    (_buffer: any, deltaTime: number) => {
      if (!sceneData) return;
      const dt = deltaTime / 1000;
      timeRef.current += dt;
      if (monster?.stage === "egg") {
        (sceneData as any).update(timeRef.current, wobbleIntensity);
      } else if (isGlb) {
        const d = dragRef.current;
        const paused = Date.now() - d.lastInteraction < PAUSE_MS;
        // While paused, accumulate skipped time so orbit resumes in place
        if (paused) d.pauseAccum += dt;
        sceneData.camera.position.z = 3.2 + d.zoom;
        (sceneData as any).update(timeRef.current - d.pauseAccum, d.rotation);
      } else {
        (sceneData as any).update(timeRef.current);
      }
    },
    [sceneData, monster?.stage, wobbleIntensity, isGlb],
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
