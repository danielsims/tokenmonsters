import * as THREE from "three";
import type { GenomeTraits } from "../../models/types";
import { createBodyMaterial, createEyeMaterial, createAccentMaterial, createParticleMaterial } from "../materials";
import { createLightingRig, createGround, createCamera } from "../utils";
import {
  applyBob,
  applyBreathing,
  applyRotation,
  createAmbientParticles,
  animateParticles,
} from "../animations";

export interface HatchlingScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  body: THREE.Group;
  update: (time: number) => void;
}

export function createHatchlingScene(traits: GenomeTraits, aspect = 1): HatchlingScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a1a);

  createLightingRig(scene);
  createGround(scene);
  const camera = createCamera(aspect);

  const body = new THREE.Group();
  const bodyMat = createBodyMaterial(traits);
  const accentMat = createAccentMaterial(traits);
  const eyeMat = createEyeMaterial(traits);

  // Main body — small, round
  const bodyShape = traits.bodyShape[0];
  const bodyGeo =
    bodyShape < 5
      ? new THREE.SphereGeometry(0.5, 24, 18) // Round
      : bodyShape < 10
        ? new THREE.CapsuleGeometry(0.3, 0.4, 12, 16) // Elongated
        : new THREE.DodecahedronGeometry(0.45, 1); // Geometric

  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.position.y = 0.6;
  body.add(bodyMesh);

  // Eyes
  const eyeSize = 0.08 + (traits.eyeStyle[0] / 15) * 0.06;
  const eyeGeo = new THREE.SphereGeometry(eyeSize, 12, 8);
  const eyeSpacing = 0.15 + (traits.eyeStyle[1] / 15) * 0.1;

  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(-eyeSpacing, 0.7, 0.4);
  body.add(leftEye);

  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(eyeSpacing, 0.7, 0.4);
  body.add(rightEye);

  // Small feet
  const footGeo = new THREE.SphereGeometry(0.1, 8, 6);
  const leftFoot = new THREE.Mesh(footGeo, accentMat);
  leftFoot.position.set(-0.2, 0.1, 0.1);
  leftFoot.scale.set(1, 0.6, 1.2);
  body.add(leftFoot);

  const rightFoot = new THREE.Mesh(footGeo, accentMat);
  rightFoot.position.set(0.2, 0.1, 0.1);
  rightFoot.scale.set(1, 0.6, 1.2);
  body.add(rightFoot);

  scene.add(body);

  // Particles
  const particleMat = createParticleMaterial(traits);
  const particles = createAmbientParticles(20, 1.2, particleMat);
  particles.position.y = 0.6;
  scene.add(particles);

  const update = (time: number) => {
    applyBob(body, time, 0.05, 1.2);
    applyBreathing(bodyMesh, time, 0.02);
    animateParticles(particles, time, 0.2);
  };

  return { scene, camera, body, update };
}
