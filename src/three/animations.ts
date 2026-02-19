import * as THREE from "three";

/** Floating bob animation — gentle up/down motion */
export function applyBob(object: THREE.Object3D, time: number, amplitude = 0.1, speed = 1): void {
  object.position.y = Math.sin(time * speed) * amplitude;
}

/** Slow rotation around Y axis */
export function applyRotation(object: THREE.Object3D, time: number, speed = 0.3): void {
  object.rotation.y = time * speed;
}

/** Wobble animation — tilting side to side, intensity 0-1 */
export function applyWobble(object: THREE.Object3D, time: number, intensity = 0.5): void {
  const wobbleSpeed = 3 + intensity * 8;
  const wobbleAmount = 0.02 + intensity * 0.15;
  object.rotation.z = Math.sin(time * wobbleSpeed) * wobbleAmount;
  object.rotation.x = Math.cos(time * wobbleSpeed * 0.7) * wobbleAmount * 0.5;
}

/** Breathing/pulsing scale animation */
export function applyBreathing(object: THREE.Object3D, time: number, amount = 0.03): void {
  const scale = 1 + Math.sin(time * 1.5) * amount;
  object.scale.set(scale, scale, scale);
}

/** Emissive pulse on a material */
export function applyEmissivePulse(
  material: THREE.MeshStandardMaterial,
  time: number,
  baseIntensity = 0.1,
  pulseAmount = 0.1
): void {
  material.emissiveIntensity = baseIntensity + Math.sin(time * 2) * pulseAmount;
}
