import * as THREE from "three";
import type { GenomeTraits } from "../models/types";
import { geneToColor, hslToHex } from "../models/genome";

/** Create the primary body material from genome traits */
export function createBodyMaterial(traits: GenomeTraits): THREE.MeshStandardMaterial {
  const color = geneToColor(traits.primaryColor);
  const hex = hslToHex(color);

  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex),
    roughness: 0.4 + (traits.bodyShape[2] / 15) * 0.4, // 0.4-0.8
    metalness: traits.special[0] > 10 ? 0.3 : 0.05,
    emissive: new THREE.Color(hex),
    emissiveIntensity: 0.05 + (traits.special[1] / 15) * 0.15,
  });
}

/** Create the secondary/accent material from genome traits */
export function createAccentMaterial(traits: GenomeTraits): THREE.MeshStandardMaterial {
  const color = geneToColor(traits.secondaryColor);
  const hex = hslToHex(color);

  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex),
    roughness: 0.5,
    metalness: 0.1,
    emissive: new THREE.Color(hex),
    emissiveIntensity: 0.03,
  });
}

/** Create an emissive eye material */
export function createEyeMaterial(traits: GenomeTraits): THREE.MeshStandardMaterial {
  // Eyes glow based on special traits
  const glowIntensity = 0.3 + (traits.eyeStyle[1] / 15) * 0.7;
  const eyeHue = traits.eyeStyle[0] * 22.5;

  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(`hsl(${eyeHue}, 90%, 70%)`),
    emissive: new THREE.Color(`hsl(${eyeHue}, 90%, 70%)`),
    emissiveIntensity: glowIntensity,
    roughness: 0.1,
    metalness: 0.0,
  });
}

/** Create egg shell material with gentle emissive glow */
export function createEggMaterial(traits: GenomeTraits): THREE.MeshStandardMaterial {
  const color = geneToColor(traits.primaryColor);
  const hex = hslToHex(color);

  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex),
    roughness: 0.3,
    metalness: 0.15,
    emissive: new THREE.Color(hex),
    emissiveIntensity: 0.15,
  });
}

/** Create particle material for ambient effects */
export function createParticleMaterial(traits: GenomeTraits): THREE.PointsMaterial {
  const color = geneToColor(traits.special);
  const hex = hslToHex(color);

  return new THREE.PointsMaterial({
    color: new THREE.Color(hex),
    size: 0.05,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
  });
}
