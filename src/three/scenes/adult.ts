import * as THREE from "three";
import type { GenomeTraits } from "../../models/types";
import { createBodyMaterial, createEyeMaterial, createAccentMaterial, getSpecialColor } from "../materials";
import { createLightingRig, createGround, createCamera, createOrbitingMotes } from "../utils";
import {
  applyBob,
  applyBreathing,
} from "../animations";

export interface AdultScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  body: THREE.Group;
  update: (time: number) => void;
}

export function createAdultScene(traits: GenomeTraits, aspect = 1): AdultScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080818);

  createLightingRig(scene);
  createGround(scene);
  const camera = createCamera(aspect);
  camera.position.set(0, 1.8, 4.5); // Pull back for larger creature

  const body = new THREE.Group();
  const bodyMat = createBodyMaterial(traits);
  const accentMat = createAccentMaterial(traits);
  const eyeMat = createEyeMaterial(traits);

  // Large body
  const bodyShape = traits.bodyShape[0];
  let bodyGeo: THREE.BufferGeometry;
  if (bodyShape < 5) {
    bodyGeo = new THREE.SphereGeometry(1.1, 32, 24);
    bodyGeo.scale(1, 1.2, 0.85);
  } else if (bodyShape < 10) {
    bodyGeo = new THREE.CapsuleGeometry(0.7, 0.9, 16, 24);
  } else {
    bodyGeo = new THREE.DodecahedronGeometry(0.95, 2);
  }

  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.position.y = 1.3;
  body.add(bodyMesh);

  // Head
  const headGeo = new THREE.SphereGeometry(0.5, 32, 24);
  const head = new THREE.Mesh(headGeo, bodyMat);
  head.position.y = 2.5;
  body.add(head);

  // Eyes
  const eyeSize = 0.14 + (traits.eyeStyle[0] / 15) * 0.06;
  const eyeGeo = new THREE.SphereGeometry(eyeSize, 16, 12);
  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(-0.2, 2.55, 0.4);
  body.add(leftEye);

  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(0.2, 2.55, 0.4);
  body.add(rightEye);

  // Arms
  const armGeo = new THREE.CapsuleGeometry(0.14, 0.55, 8, 12);
  const leftArm = new THREE.Mesh(armGeo, accentMat);
  leftArm.position.set(-1.0, 1.4, 0);
  leftArm.rotation.z = 0.3;
  body.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo, accentMat);
  rightArm.position.set(1.0, 1.4, 0);
  rightArm.rotation.z = -0.3;
  body.add(rightArm);

  // Legs
  const legGeo = new THREE.CapsuleGeometry(0.16, 0.55, 8, 12);
  const leftLeg = new THREE.Mesh(legGeo, accentMat);
  leftLeg.position.set(-0.4, 0.35, 0);
  body.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, accentMat);
  rightLeg.position.set(0.4, 0.35, 0);
  body.add(rightLeg);

  // Features
  if (traits.features[0] > 6) {
    const hornGeo = new THREE.ConeGeometry(0.1, 0.45, 8);
    const leftHorn = new THREE.Mesh(hornGeo, accentMat);
    leftHorn.position.set(-0.22, 2.9, 0);
    leftHorn.rotation.z = 0.25;
    body.add(leftHorn);

    const rightHorn = new THREE.Mesh(hornGeo, accentMat);
    rightHorn.position.set(0.22, 2.9, 0);
    rightHorn.rotation.z = -0.25;
    body.add(rightHorn);
  }

  let tail: THREE.Mesh | null = null;
  if (traits.features[1] > 6) {
    const tailGeo = new THREE.CapsuleGeometry(0.1, 0.8, 8, 12);
    tail = new THREE.Mesh(tailGeo, accentMat);
    tail.position.set(0, 0.9, -0.9);
    tail.rotation.x = -0.5;
    body.add(tail);
  }

  if (traits.features[2] > 10) {
    const wingGeo = new THREE.ConeGeometry(0.35, 0.6, 4);
    const leftWing = new THREE.Mesh(wingGeo, accentMat);
    leftWing.position.set(-0.8, 2.0, -0.2);
    leftWing.rotation.z = 1.2;
    body.add(leftWing);

    const rightWing = new THREE.Mesh(wingGeo, accentMat);
    rightWing.position.set(0.8, 2.0, -0.2);
    rightWing.rotation.z = -1.2;
    body.add(rightWing);
  }

  if (traits.features[3] > 12) {
    for (let i = 0; i < 3; i++) {
      const spikeGeo = new THREE.ConeGeometry(0.05, 0.25 + i * 0.06, 6);
      const spike = new THREE.Mesh(spikeGeo, accentMat);
      spike.position.set(0, 1.8 + i * 0.35, -0.45);
      spike.rotation.x = -0.3;
      body.add(spike);
    }
  }

  scene.add(body);

  // Orbiting motes
  const specialColor = getSpecialColor(traits);
  const motes = createOrbitingMotes(10, 1.8, specialColor, 0.06);
  motes.group.position.y = 1.3;
  scene.add(motes.group);

  const update = (time: number) => {
    applyBob(body, time, 0.03, 0.6);
    applyBreathing(bodyMesh, time, 0.012);
    if (tail) tail.rotation.y = Math.sin(time * 1.2) * 0.3;
    motes.update(time);
  };

  return { scene, camera, body, update };
}
