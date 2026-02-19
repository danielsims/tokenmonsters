import * as THREE from "three";

/** Standard lighting rig for all scenes */
export function createLightingRig(scene: THREE.Scene): void {
  // Ambient light for base illumination
  const ambient = new THREE.AmbientLight(0x404060, 0.6);
  scene.add(ambient);

  // Key light — warm, slightly above and to the right
  const keyLight = new THREE.DirectionalLight(0xffeedd, 1.0);
  keyLight.position.set(3, 4, 2);
  scene.add(keyLight);

  // Fill light — cool, from the left
  const fillLight = new THREE.DirectionalLight(0xaabbff, 0.4);
  fillLight.position.set(-2, 2, 1);
  scene.add(fillLight);

  // Rim light — behind the subject
  const rimLight = new THREE.DirectionalLight(0xffffff, 0.3);
  rimLight.position.set(0, 2, -3);
  scene.add(rimLight);
}

/** Create a standard camera positioned to frame a creature */
export function createCamera(aspect: number = 1): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
  camera.position.set(0, 1.5, 4);
  camera.lookAt(0, 0.5, 0);
  return camera;
}

/** Create a subtle ground plane */
export function createGround(scene: THREE.Scene, color: number = 0x1a1a2e): void {
  const geometry = new THREE.CircleGeometry(3, 32);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.9,
    metalness: 0.0,
    transparent: true,
    opacity: 0.3,
  });
  const ground = new THREE.Mesh(geometry, material);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  scene.add(ground);
}
