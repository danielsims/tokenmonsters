import * as THREE from "three";
import type { GenomeTraits } from "../../models/types";
import { createEggMaterial, createParticleMaterial } from "../materials";
import { createLightingRig, createGround, createCamera } from "../utils";
import {
  applyBob,
  applyRotation,
  applyWobble,
  applyEmissivePulse,
  createAmbientParticles,
  animateParticles,
} from "../animations";

export interface EggScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  egg: THREE.Mesh;
  particles: THREE.Points;
  material: THREE.MeshStandardMaterial;
  update: (time: number, wobbleIntensity: number) => void;
}

/** Create an egg scene with genome-driven appearance */
export function createEggScene(traits: GenomeTraits, aspect = 1): EggScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a1a);

  createLightingRig(scene);
  createGround(scene);
  const camera = createCamera(aspect);

  // Egg geometry — scaled sphere for oval shape
  const geometry = new THREE.SphereGeometry(0.6, 32, 24);
  geometry.scale(1, 1.3, 1); // Taller than wide

  const material = createEggMaterial(traits);
  const egg = new THREE.Mesh(geometry, material);
  egg.position.y = 0.8;
  scene.add(egg);

  // Ambient particles
  const particleMat = createParticleMaterial(traits);
  const particles = createAmbientParticles(30, 1.5, particleMat);
  particles.position.y = 0.8;
  scene.add(particles);

  const update = (time: number, wobbleIntensity: number) => {
    applyBob(egg, time, 0.08, 0.8);
    applyRotation(egg, time, 0.15);
    applyWobble(egg, time, wobbleIntensity);
    applyEmissivePulse(material, time, 0.15, 0.1 + wobbleIntensity * 0.15);
    animateParticles(particles, time, 0.15);
  };

  return { scene, camera, egg, particles, material, update };
}
