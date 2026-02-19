import * as THREE from "three";
import type { GenomeTraits } from "../../models/types";
import { createBodyMaterial, createEyeMaterial, createAccentMaterial, getSpecialColor } from "../materials";
import { createLightingRig, createGround, createCamera, createOrbitingMotes } from "../utils";
import {
  applyBob,
  applyBreathing,
} from "../animations";

export interface HatchlingScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  body: THREE.Group;
  update: (time: number) => void;
}

export function createHatchlingScene(traits: GenomeTraits, aspect = 1): HatchlingScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080818);

  createLightingRig(scene);
  createGround(scene);
  const camera = createCamera(aspect);

  const body = new THREE.Group();
  const bodyMat = createBodyMaterial(traits);
  const accentMat = createAccentMaterial(traits);
  const eyeMat = createEyeMaterial(traits);

  // Main body — round and chunky for visibility
  const bodyShape = traits.bodyShape[0];
  const bodyGeo =
    bodyShape < 5
      ? new THREE.SphereGeometry(0.65, 24, 18)
      : bodyShape < 10
        ? new THREE.CapsuleGeometry(0.4, 0.5, 12, 16)
        : new THREE.DodecahedronGeometry(0.55, 1);

  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.position.y = 0.7;
  body.add(bodyMesh);

  // Eyes — larger for terminal visibility
  const eyeSize = 0.12 + (traits.eyeStyle[0] / 15) * 0.06;
  const eyeGeo = new THREE.SphereGeometry(eyeSize, 12, 8);
  const eyeSpacing = 0.18 + (traits.eyeStyle[1] / 15) * 0.08;

  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(-eyeSpacing, 0.8, 0.5);
  body.add(leftEye);

  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(eyeSpacing, 0.8, 0.5);
  body.add(rightEye);

  // Chunkier feet
  const footGeo = new THREE.SphereGeometry(0.14, 8, 6);
  const leftFoot = new THREE.Mesh(footGeo, accentMat);
  leftFoot.position.set(-0.25, 0.1, 0.1);
  leftFoot.scale.set(1, 0.6, 1.3);
  body.add(leftFoot);

  const rightFoot = new THREE.Mesh(footGeo, accentMat);
  rightFoot.position.set(0.25, 0.1, 0.1);
  rightFoot.scale.set(1, 0.6, 1.3);
  body.add(rightFoot);

  scene.add(body);

  // Orbiting motes
  const specialColor = getSpecialColor(traits);
  const motes = createOrbitingMotes(4, 1.1, specialColor, 0.04);
  motes.group.position.y = 0.7;
  scene.add(motes.group);

  const update = (time: number) => {
    applyBob(body, time, 0.06, 1.2);
    applyBreathing(bodyMesh, time, 0.025);
    motes.update(time);
  };

  return { scene, camera, body, update };
}
