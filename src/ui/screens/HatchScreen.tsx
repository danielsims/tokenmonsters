import * as THREE from "three";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useGame } from "../../game/context";
import { getCurrentForm } from "../../models/evolution";
import { loadGlbTestScene, disposeScene } from "../../three/glb-loader";
import { playSound } from "../../audio/player";
import { resolve } from "path";
import { existsSync } from "fs";
import type { Species, Stage } from "../../models/types";
import { t, getSceneBg } from "../theme";

const modelsRoot = resolve(import.meta.dir, "../../three/models");

type Phase = "show-egg" | "flicker" | "reveal" | "complete";

interface SpeciesConfig {
  targetHeight?: number;
  cameraDistance?: number;
  cameraHeight?: number;
  lookAtHeight?: number;
  yOffset?: number;
}

function getGlbPath(species: Species, stage: Stage): string | null {
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
    const config: SpeciesConfig = {};
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

/** Turn all model meshes white and strip textures */
function whitenScene(scene: THREE.Scene) {
  const white = new THREE.Color(0xffffff);
  for (const child of scene.children) {
    if (!(child instanceof THREE.Group)) continue;
    child.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const mat of materials) {
        if (mat.color) mat.color.copy(white);
        if (mat.map) {
          mat.map = null;
          mat.needsUpdate = true;
        }
        if (mat.emissive) mat.emissive.setScalar(0);
        if (mat.emissiveMap) {
          mat.emissiveMap = null;
          mat.needsUpdate = true;
        }
      }
    });
  }
}

function loadScene(species: Species, stage: Stage, whiten: boolean) {
  const glbPath = getGlbPath(species, stage);
  if (!glbPath) return null;

  const form = species.forms.find((f) => f.stage === stage);
  const formName = form ? form.name.toLowerCase().replace(/\s+/g, "-") : "";
  const config = formName ? loadFormConfig(formName) : {};

  const scene = loadGlbTestScene(glbPath, {
    targetHeight: 1.4,
    cameraDistance: 3.2,
    orbitSpeed: 0.3,
    ...config,
    background: getSceneBg(),
  });

  if (whiten) {
    scene.ready = scene.ready.then(() => {
      whitenScene(scene.scene);
    });
  }

  return scene;
}

export function HatchScreen({ onComplete }: { onComplete: () => void }) {
  const { monster, species } = useGame();
  const [phase, setPhase] = useState<Phase>("show-egg");
  const [dots, setDots] = useState(0);
  const [flickerShow, setFlickerShow] = useState<"egg" | "hatchling">("egg");
  const timeRef = useRef(0);

  const toStage: Stage = "hatchling";

  // Load 4 scenes: textured egg, white egg, white hatchling, textured hatchling
  const eggFull = useMemo(
    () => species ? loadScene(species, "egg", false) : null,
    [species?.id],
  );
  const eggWhite = useMemo(
    () => species ? loadScene(species, "egg", true) : null,
    [species?.id],
  );
  const hatchWhite = useMemo(
    () => species ? loadScene(species, toStage, true) : null,
    [species?.id],
  );
  const hatchFull = useMemo(
    () => species ? loadScene(species, toStage, false) : null,
    [species?.id],
  );

  // Track readiness
  const [eggFullReady, setEggFullReady] = useState(false);
  const [eggWhiteReady, setEggWhiteReady] = useState(false);
  const [hatchWhiteReady, setHatchWhiteReady] = useState(false);
  const [hatchFullReady, setHatchFullReady] = useState(false);

  useEffect(() => {
    if (!eggFull) return;
    let cancelled = false;
    eggFull.ready.then(() => { if (!cancelled) setEggFullReady(true); }).catch(() => {});
    return () => { cancelled = true; disposeScene(eggFull.scene); };
  }, [eggFull]);

  useEffect(() => {
    if (!eggWhite) return;
    let cancelled = false;
    eggWhite.ready.then(() => { if (!cancelled) setEggWhiteReady(true); }).catch(() => {});
    return () => { cancelled = true; disposeScene(eggWhite.scene); };
  }, [eggWhite]);

  useEffect(() => {
    if (!hatchWhite) return;
    let cancelled = false;
    hatchWhite.ready.then(() => { if (!cancelled) setHatchWhiteReady(true); }).catch(() => {});
    return () => { cancelled = true; disposeScene(hatchWhite.scene); };
  }, [hatchWhite]);

  useEffect(() => {
    if (!hatchFull) return;
    let cancelled = false;
    hatchFull.ready.then(() => { if (!cancelled) setHatchFullReady(true); }).catch(() => {});
    return () => { cancelled = true; disposeScene(hatchFull.scene); };
  }, [hatchFull]);

  // Animation state machine — starts once textured egg is ready
  useEffect(() => {
    if (!eggFullReady) return;

    const dotInterval = setInterval(() => setDots((d) => (d + 1) % 4), 400);

    // Show textured egg for 2s, then flicker
    const flickerTimer = setTimeout(() => setPhase("flicker"), 2000);

    const revealTimer = setTimeout(() => {
      setPhase("reveal");
      playSound("evolve-complete");
    }, 4500);

    const completeTimer = setTimeout(() => setPhase("complete"), 4500);

    const doneTimer = setTimeout(onComplete, 7000);

    return () => {
      clearInterval(dotInterval);
      clearTimeout(flickerTimer);
      clearTimeout(revealTimer);
      clearTimeout(completeTimer);
      clearTimeout(doneTimer);
    };
  }, [eggFullReady, onComplete]);

  // Flicker effect — accelerating frequency
  useEffect(() => {
    if (phase !== "flicker") return;

    const startTime = Date.now();
    let timeout: ReturnType<typeof setTimeout>;

    function tick() {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / 2500);
      const interval = 400 - progress * 320;

      setFlickerShow((prev) => (prev === "egg" ? "hatchling" : "egg"));
      timeout = setTimeout(tick, interval);
    }

    timeout = setTimeout(tick, 400);
    return () => clearTimeout(timeout);
  }, [phase]);

  // Determine which scene to display
  const displayScene = useMemo(() => {
    if (phase === "show-egg") return eggFullReady ? eggFull : null;
    if (phase === "flicker") {
      if (flickerShow === "egg") return eggWhiteReady ? eggWhite : (eggFullReady ? eggFull : null);
      return hatchWhiteReady ? hatchWhite : (eggWhiteReady ? eggWhite : null);
    }
    // reveal / complete
    return hatchFullReady ? hatchFull : (hatchWhiteReady ? hatchWhite : null);
  }, [phase, flickerShow, eggFull, eggWhite, hatchWhite, hatchFull, eggFullReady, eggWhiteReady, hatchWhiteReady, hatchFullReady]);

  const displayRef = useRef<typeof displayScene>(null);
  if (displayScene) displayRef.current = displayScene;

  const renderBefore = useCallback(
    (_buffer: any, deltaTime: number) => {
      const scene = displayRef.current;
      if (!scene) return;
      const dt = deltaTime / 1000;
      timeRef.current += dt;

      const MAX_ASPECT = 1.2;
      const aspect = scene.camera.aspect;
      if (aspect > MAX_ASPECT) {
        scene.camera.position.z = 3.2 * (aspect / MAX_ASPECT);
      }

      scene.update(timeRef.current, 0);
    },
    [],
  );

  const hatchForm = species ? getCurrentForm(species, toStage) : null;
  const formName = hatchForm?.name ?? "new creature";
  const eggForm = species?.forms.find((f) => f.stage === "egg") ?? null;
  const eggName = eggForm?.name ?? "Your egg";
  const dotStr = ".".repeat(dots);

  const display = displayRef.current;

  if (!display) {
    return (
      <box
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        width="100%"
        height="100%"
        backgroundColor={t.bg.base}
      >
        <text fg={t.text.muted}>Preparing...</text>
      </box>
    );
  }

  return (
    <box flexDirection="column" width="100%" height="100%" backgroundColor={t.bg.base}>
      {/* Text overlay */}
      <box height={3} justifyContent="center" alignItems="center">
        {(phase === "show-egg" || phase === "flicker") && (
          <text fg={t.accent.primary}>
            <strong>{eggName} is hatching{dotStr}</strong>
          </text>
        )}
        {(phase === "reveal" || phase === "complete") && (
          <text fg={t.text.secondary}>
            A <strong fg={t.accent.primary}>{formName}</strong> has emerged!
          </text>
        )}
      </box>

      {/* 3D scene */}
      <box flexGrow={1}>
        <threeScene
          scene={display.scene}
          camera={display.camera}
          autoAspect
          flexGrow={1}
          width="100%"
          renderBefore={renderBefore}
        />
      </box>
    </box>
  );
}
