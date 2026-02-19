import * as THREE from "three";

/** Standard lighting rig for all scenes — boosted for terminal rendering */
export function createLightingRig(scene: THREE.Scene): void {
  // Strong ambient so nothing is pitch black
  const ambient = new THREE.AmbientLight(0x8888aa, 1.2);
  scene.add(ambient);

  // Key light — warm, strong
  const keyLight = new THREE.DirectionalLight(0xffeedd, 2.0);
  keyLight.position.set(3, 5, 3);
  scene.add(keyLight);

  // Fill light — cool, from the left
  const fillLight = new THREE.DirectionalLight(0xaabbff, 1.0);
  fillLight.position.set(-3, 3, 1);
  scene.add(fillLight);

  // Rim light — behind and above
  const rimLight = new THREE.DirectionalLight(0xffffff, 0.8);
  rimLight.position.set(0, 3, -3);
  scene.add(rimLight);

  // Bottom fill to reduce harsh shadows on underside
  const bottomFill = new THREE.DirectionalLight(0x667788, 0.5);
  bottomFill.position.set(0, -2, 1);
  scene.add(bottomFill);
}

/** Create a standard camera — closer framing for terminal visibility */
export function createCamera(aspect: number = 1): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
  camera.position.set(0, 1.2, 3.2);
  camera.lookAt(0, 0.6, 0);
  return camera;
}

/** Create a visible ground plane with subtle glow */
export function createGround(scene: THREE.Scene, color: number = 0x1a1a2e): void {
  const geometry = new THREE.CircleGeometry(4, 48);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.7,
    metalness: 0.1,
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.15,
  });
  const ground = new THREE.Mesh(geometry, material);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  scene.add(ground);
}

/** Create small mesh-based orbiting motes (replaces Points which look bad in terminal) */
export function createOrbitingMotes(
  count: number,
  radius: number,
  color: THREE.Color,
  moteSize = 0.06,
): { group: THREE.Group; update: (time: number) => void } {
  const group = new THREE.Group();
  const geo = new THREE.SphereGeometry(moteSize, 6, 4);
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 1.5,
    roughness: 0.2,
    metalness: 0.0,
  });

  const motes: { mesh: THREE.Mesh; orbit: number; phase: number; height: number; speed: number }[] = [];

  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(geo, mat);
    const orbit = radius * (0.6 + Math.random() * 0.4);
    const phase = (i / count) * Math.PI * 2;
    const height = -0.3 + Math.random() * 1.2;
    const speed = 0.3 + Math.random() * 0.4;
    mesh.position.set(
      orbit * Math.cos(phase),
      height,
      orbit * Math.sin(phase),
    );
    group.add(mesh);
    motes.push({ mesh, orbit, phase, height, speed });
  }

  const update = (time: number) => {
    for (const m of motes) {
      const angle = time * m.speed + m.phase;
      m.mesh.position.x = m.orbit * Math.cos(angle);
      m.mesh.position.z = m.orbit * Math.sin(angle);
      m.mesh.position.y = m.height + Math.sin(time * 0.8 + m.phase) * 0.15;
    }
  };

  return { group, update };
}
