import { useRef, useMemo, useCallback, useState, useEffect } from "react";
import { useKeyboard } from "@opentui/react";
import { useGame } from "../../game/context";
import { loadGlbTestScene, updateSceneBackground, disposeScene } from "../../three/glb-loader";
import { resolve } from "path";
import { existsSync } from "fs";
import type { Species, Stage } from "../../models/types";
import { t, getSceneBg } from "../theme";

/**
 * Model directory layout:
 *   src/three/models/<formName>.glb
 *
 * Form names come from species.ts (lowercased, spaces to dashes).
 */
const modelsRoot = resolve(import.meta.dir, "../../three/models");

interface SpeciesConfig {
  background?: number;
  targetHeight?: number;
  cameraDistance?: number;
  cameraHeight?: number;
  lookAtHeight?: number;
  yOffset?: number;
}

function getGlbModel(species: Species | null, stage: Stage): string | null {
  if (!species) return null;
  const form = species.forms.find((f) => f.stage === stage);
  if (!form) return null;
  const formName = form.name.toLowerCase().replace(/\s+/g, "-");
  const path = resolve(modelsRoot, formName + ".glb");
  if (existsSync(path)) return path;
  return null;
}

function loadFormConfig(formName: string): SpeciesConfig {
  try {
    const configPath = resolve(modelsRoot, "config.json");
    if (!existsSync(configPath)) return {};
    const raw = JSON.parse(require("fs").readFileSync(configPath, "utf-8"));
    const formData = raw[formName] ?? {};
    const bg = formData.background;
    const config: SpeciesConfig = {};
    if (bg != null) config.background = parseInt(String(bg), 16);
    if (formData.targetHeight != null) config.targetHeight = formData.targetHeight;
    if (formData.cameraDistance != null) config.cameraDistance = formData.cameraDistance;
    if (formData.cameraHeight != null) config.cameraHeight = formData.cameraHeight;
    if (formData.lookAtHeight != null) config.lookAtHeight = formData.lookAtHeight;
    if (formData.yOffset != null) config.yOffset = formData.yOffset;
    return config;
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

  const glbPath = monster && species ? getGlbModel(species, monster.stage) : null;

  const currentFormName = useMemo(() => {
    if (!monster || !species) return "";
    const form = species.forms.find((f) => f.stage === monster.stage);
    return form ? form.name.toLowerCase().replace(/\s+/g, "-") : "";
  }, [monster?.stage, species]);

  const speciesConfig = useMemo(
    () => currentFormName ? loadFormConfig(currentFormName) : {},
    [currentFormName],
  );

  const glbScene = useMemo(() => {
    if (!glbPath) return null;
    return loadGlbTestScene(glbPath, {
      targetHeight: 1.4,
      cameraDistance: 3.2,
      orbitSpeed: 0.3,
      ...speciesConfig,
      background: getSceneBg(),
    });
  }, [glbPath, speciesConfig]);

  useEffect(() => {
    if (!glbScene) { setGlbReady(false); return; }
    let cancelled = false;
    setGlbReady(false);
    glbScene.ready.then(() => {
      if (!cancelled) setGlbReady(true);
    }).catch(() => {
      if (!cancelled) setGlbReady(false);
    });
    return () => {
      cancelled = true;
      disposeScene(glbScene.scene);
    };
  }, [glbScene]);

  const sceneData = useMemo(() => {
    if (glbScene && glbReady) return glbScene;
    return null;
  }, [glbScene, glbReady]);

  // Update scene background on theme change without rebuilding the scene
  const sceneBg = getSceneBg();
  useEffect(() => {
    if (sceneData) updateSceneBackground(sceneData.scene, sceneBg);
  }, [sceneData, sceneBg]);

  // Capture the initial camera distance (only read once per scene, stored in ref)
  const baseCameraDistRef = useRef(3.2);
  useEffect(() => {
    if (sceneData) {
      baseCameraDistRef.current = sceneData.camera.position.z;
    }
  }, [sceneData]);

  // Arrow key rotation — pauses auto-spin for 1.5s, resumes from current position
  useKeyboard((key) => {
    if (!sceneData) return;
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

      // On very wide viewports, push camera back to keep model visually contained
      const MAX_ASPECT = 1.2;
      const aspect = sceneData.camera.aspect;
      const aspectScale = aspect > MAX_ASPECT ? aspect / MAX_ASPECT : 1;

      const baseDist = baseCameraDistRef.current;
      const d = dragRef.current;
      const paused = Date.now() - d.lastInteraction < PAUSE_MS;
      if (paused) d.pauseAccum += dt;
      sceneData.camera.position.z = baseDist * aspectScale + d.zoom;
      (sceneData as any).update(timeRef.current - d.pauseAccum, d.rotation);
    },
    [sceneData],
  );

  if (!monster || !species || !sceneData) {
    return (
      <box justifyContent="center" alignItems="center" flexGrow={1}>
        <text fg={t.text.muted}>No monster yet...</text>
      </box>
    );
  }

  return (
    <box flexGrow={1}>
      <threeScene
        scene={sceneData.scene}
        camera={sceneData.camera}
        autoAspect
        flexGrow={1}
        width="100%"
        renderBefore={renderBefore}
      />
    </box>
  );
}
