import * as THREE from "three";
import type { GenomeTraits } from "../../models/types";
import { createEggMaterial, getTraitColor, getSpecialColor } from "../materials";
import { createLightingRig, createGround, createCamera, createOrbitingMotes } from "../utils";
import {
  applyBob,
  applyRotation,
  applyWobble,
  applyEmissivePulse,
} from "../animations";

export interface EggScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  egg: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  update: (time: number, wobbleIntensity: number) => void;
}

/** Create an egg scene with genome-driven appearance */
export function createEggScene(traits: GenomeTraits, aspect = 1): EggScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080818);

  createLightingRig(scene);
  createGround(scene);
  const camera = createCamera(aspect);

  const primaryColor = getTraitColor(traits);
  const specialColor = getSpecialColor(traits);

  // Egg geometry — large oval
  const geometry = new THREE.SphereGeometry(0.85, 32, 24);
  geometry.scale(1, 1.35, 1);

  const material = createEggMaterial(traits);
  const egg = new THREE.Mesh(geometry, material);
  egg.position.y = 0.95;
  scene.add(egg);

  // Glow ring around the egg base (replaces particles — reads well in terminal)
  const ringGeo = new THREE.TorusGeometry(1.0, 0.06, 8, 48);
  const ringMat = new THREE.MeshStandardMaterial({
    color: specialColor,
    emissive: specialColor,
    emissiveIntensity: 1.0,
    roughness: 0.1,
    metalness: 0.0,
    transparent: true,
    opacity: 0.7,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  scene.add(ring);

  // Small orbiting motes (mesh-based, not Points)
  const motes = createOrbitingMotes(6, 1.3, specialColor, 0.05);
  motes.group.position.y = 0.8;
  scene.add(motes.group);

  // Point light inside the egg for inner glow
  const innerGlow = new THREE.PointLight(primaryColor, 1.5, 3);
  innerGlow.position.set(0, 0.95, 0);
  scene.add(innerGlow);

  const update = (time: number, wobbleIntensity: number) => {
    applyBob(egg, time, 0.1, 0.8);
    applyRotation(egg, time, 0.2);
    applyWobble(egg, time, wobbleIntensity);
    applyEmissivePulse(material, time, 0.5, 0.3 + wobbleIntensity * 0.4);

    // Ring pulses gently
    ringMat.emissiveIntensity = 0.8 + Math.sin(time * 1.5) * 0.4;
    ring.scale.setScalar(1 + Math.sin(time * 1.2) * 0.03);

    // Inner glow pulses
    innerGlow.intensity = 1.5 + Math.sin(time * 2) * 0.5 + wobbleIntensity * 1.0;

    motes.update(time);
  };

  return { scene, camera, egg, material, update };
}
