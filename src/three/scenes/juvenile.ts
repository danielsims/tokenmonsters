import * as THREE from "three";
import type { GenomeTraits } from "../../models/types";
import { createBodyMaterial, createEyeMaterial, createAccentMaterial, getSpecialColor } from "../materials";
import { createLightingRig, createGround, createCamera, createOrbitingMotes } from "../utils";
import {
  applyBob,
  applyBreathing,
} from "../animations";

export interface JuvenileScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  body: THREE.Group;
  update: (time: number) => void;
}

export function createJuvenileScene(traits: GenomeTraits, aspect = 1): JuvenileScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080818);

  createLightingRig(scene);
  createGround(scene);
  const camera = createCamera(aspect);

  const body = new THREE.Group();
  const bodyMat = createBodyMaterial(traits);
  const accentMat = createAccentMaterial(traits);
  const eyeMat = createEyeMaterial(traits);

  // Larger body
  const bodyShape = traits.bodyShape[0];
  let bodyGeo: THREE.BufferGeometry;
  if (bodyShape < 5) {
    bodyGeo = new THREE.SphereGeometry(0.8, 32, 24);
    bodyGeo.scale(1, 1.1, 0.9);
  } else if (bodyShape < 10) {
    bodyGeo = new THREE.CapsuleGeometry(0.5, 0.7, 16, 20);
  } else {
    bodyGeo = new THREE.DodecahedronGeometry(0.7, 2);
  }

  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.position.y = 1.0;
  body.add(bodyMesh);

  // Head
  const headGeo = new THREE.SphereGeometry(0.4, 24, 18);
  const head = new THREE.Mesh(headGeo, bodyMat);
  head.position.y = 1.75;
  body.add(head);

  // Eyes on head
  const eyeSize = 0.12 + (traits.eyeStyle[0] / 15) * 0.05;
  const eyeGeo = new THREE.SphereGeometry(eyeSize, 12, 8);
  const eyeSpacing = 0.14;

  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(-eyeSpacing, 1.8, 0.34);
  body.add(leftEye);

  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(eyeSpacing, 1.8, 0.34);
  body.add(rightEye);

  // Arms
  const limbGeo = new THREE.CapsuleGeometry(0.1, 0.35, 8, 8);
  const leftArm = new THREE.Mesh(limbGeo, accentMat);
  leftArm.position.set(-0.7, 1.0, 0);
  leftArm.rotation.z = 0.4;
  body.add(leftArm);

  const rightArm = new THREE.Mesh(limbGeo, accentMat);
  rightArm.position.set(0.7, 1.0, 0);
  rightArm.rotation.z = -0.4;
  body.add(rightArm);

  // Legs
  const legGeo = new THREE.CapsuleGeometry(0.12, 0.35, 8, 8);
  const leftLeg = new THREE.Mesh(legGeo, accentMat);
  leftLeg.position.set(-0.3, 0.25, 0);
  body.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, accentMat);
  rightLeg.position.set(0.3, 0.25, 0);
  body.add(rightLeg);

  // Features based on genome
  if (traits.features[0] > 8) {
    const hornGeo = new THREE.ConeGeometry(0.07, 0.3, 8);
    const leftHorn = new THREE.Mesh(hornGeo, accentMat);
    leftHorn.position.set(-0.18, 2.1, 0);
    leftHorn.rotation.z = 0.2;
    body.add(leftHorn);

    const rightHorn = new THREE.Mesh(hornGeo, accentMat);
    rightHorn.position.set(0.18, 2.1, 0);
    rightHorn.rotation.z = -0.2;
    body.add(rightHorn);
  }

  if (traits.features[1] > 10) {
    const tailGeo = new THREE.CapsuleGeometry(0.06, 0.45, 8, 8);
    const tail = new THREE.Mesh(tailGeo, accentMat);
    tail.position.set(0, 0.6, -0.55);
    tail.rotation.x = -0.6;
    body.add(tail);
  }

  scene.add(body);

  // Orbiting motes
  const specialColor = getSpecialColor(traits);
  const motes = createOrbitingMotes(8, 1.5, specialColor, 0.05);
  motes.group.position.y = 1.0;
  scene.add(motes.group);

  const update = (time: number) => {
    applyBob(body, time, 0.04, 0.8);
    applyBreathing(bodyMesh, time, 0.018);
    // Arm swing
    leftArm.rotation.x = Math.sin(time * 1.5) * 0.15;
    rightArm.rotation.x = -Math.sin(time * 1.5) * 0.15;
    motes.update(time);
  };

  return { scene, camera, body, update };
}
