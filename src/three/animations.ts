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

/** Create ambient particle system around an object */
export function createAmbientParticles(
  count: number,
  radius: number,
  material: THREE.PointsMaterial
): THREE.Points {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    const r = radius * (0.5 + Math.random() * 0.5);

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(geometry, material);
}

/** Animate particle positions in a drifting orbit */
export function animateParticles(particles: THREE.Points, time: number, speed = 0.2): void {
  const positions = particles.geometry.attributes.position;
  const count = positions.count;

  for (let i = 0; i < count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);

    // Gentle orbital drift
    const angle = time * speed + i * 0.1;
    const r = Math.sqrt(x * x + z * z);
    positions.setX(i, r * Math.cos(angle + i));
    positions.setY(i, y + Math.sin(time * 0.5 + i) * 0.002);
    positions.setZ(i, r * Math.sin(angle + i));
  }

  positions.needsUpdate = true;
}
