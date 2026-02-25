import * as THREE from "three";
import { useRef, useMemo, useCallback, useState, useEffect } from "react";
import { loadGlbTestScene, updateSceneBackground } from "../../three/glb-loader";
import { resolve } from "path";
import { existsSync } from "fs";
import type { Species } from "../../models/types";
import { t, getSceneBg } from "../theme";

const modelsRoot = resolve(import.meta.dir, "../../three/models");

interface SpeciesConfig {
  background?: number;
  targetHeight?: number;
  cameraDistance?: number;
  cameraHeight?: number;
  lookAtHeight?: number;
  yOffset?: number;
  brightness?: number;
  tint?: number;
}

function getGlbModelForForm(species: Species, formIndex: number): string | null {
  const form = species.forms[formIndex];
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
    if (formData.brightness != null) config.brightness = formData.brightness;
    if (formData.tint != null) config.tint = parseInt(String(formData.tint), 16);
    return config;
  } catch {
    return {};
  }
}

/** Darken only model meshes (inside Groups), leaving ground/lighting untouched */
function darkenScene(scene: THREE.Scene) {
  const dark = new THREE.Color(0x080810);
  for (const child of scene.children) {
    if (!(child instanceof THREE.Group)) continue;
    child.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const mat of materials) {
        if (mat.color) mat.color.copy(dark);
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

interface RegistryPreviewProps {
  species: Species | null;
  formIndex: number;
  locked?: boolean;
}

/**
 * GLB-only preview — no procedural scene fallback. Forms without a GLB
 * file show the "???" placeholder. The old procedural scenes caused a
 * visible flash on every navigation because they rendered for one frame
 * before the GLB loaded.
 */
export function RegistryPreview({ species, formIndex, locked = false }: RegistryPreviewProps) {
  const timeRef = useRef(0);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  const [glbReady, setGlbReady] = useState(false);
  // Track which scene glbReady corresponds to — prevents a stale `true`
  // from a previous form causing an incomplete scene to render.
  const readySceneRef = useRef<any>(null);

  const glbPath = useMemo(
    () => (species ? getGlbModelForForm(species, formIndex) : null),
    [species?.id, formIndex],
  );

  const currentFormName = useMemo(() => {
    if (!species) return "";
    const form = species.forms[formIndex];
    return form ? form.name.toLowerCase().replace(/\s+/g, "-") : "";
  }, [species?.id, formIndex]);

  const speciesConfig = useMemo(
    () => (currentFormName ? loadFormConfig(currentFormName) : {}),
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
    if (!glbScene) {
      setGlbReady(false);
      readySceneRef.current = null;
      return;
    }
    let cancelled = false;
    setGlbReady(false);
    readySceneRef.current = null;
    glbScene.ready.then(() => {
      if (cancelled) return;
      if (lockedRef.current) {
        try { darkenScene(glbScene.scene); } catch {}
      }
      // Pre-rotate pivot to current animation time so the model doesn't
      // flash at its default orientation before renderBefore runs.
      glbScene.update(timeRef.current, 0);
      readySceneRef.current = glbScene;
      setGlbReady(true);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [glbScene]);

  // Only returns a scene when its GLB is fully loaded
  const sceneData = useMemo(() => {
    if (glbScene && glbReady && readySceneRef.current === glbScene) return glbScene;
    return null;
  }, [glbScene, glbReady]);

  // Update scene background on theme change without rebuilding the scene
  const sceneBg = getSceneBg();
  useEffect(() => {
    if (sceneData) updateSceneBackground(sceneData.scene, sceneBg);
  }, [sceneData, sceneBg]);

  // Hold onto the last valid scene so it keeps displaying while the next loads.
  // This eliminates flicker: old GLB stays visible until new GLB is ready.
  const displayRef = useRef<any>(null);
  const baseCameraDistRef = useRef(3.2);
  if (sceneData) {
    displayRef.current = sceneData;
    baseCameraDistRef.current = sceneData.camera.position.z;
  }
  // Clear when switching to a form without a GLB model
  if (!glbPath) {
    displayRef.current = null;
  }

  const renderBefore = useCallback(
    (_buffer: any, deltaTime: number) => {
      const scene = displayRef.current;
      if (!scene) return;
      const dt = deltaTime / 1000;
      timeRef.current += dt;

      // On very wide viewports, push camera back to keep model contained
      const MAX_ASPECT = 1.2;
      const aspect = scene.camera.aspect;
      if (aspect > MAX_ASPECT) {
        scene.camera.position.z = baseCameraDistRef.current * (aspect / MAX_ASPECT);
      }

      (scene as any).update(timeRef.current, 0);
    },
    [], // reads from refs — stable callback
  );

  const display = displayRef.current;

  if (!species || !display) {
    return (
      <box justifyContent="center" alignItems="center" flexGrow={1} backgroundColor={t.bg.surface}>
        <text fg={t.text.hidden}>???</text>
      </box>
    );
  }

  return (
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
  );
}
