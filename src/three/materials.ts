import * as THREE from "three";
import type { GenomeTraits } from "../models/types";
import { geneToColor, hslToHex } from "../models/genome";

/** Create the primary body material — bright enough for terminal rendering */
export function createBodyMaterial(traits: GenomeTraits): THREE.MeshStandardMaterial {
  const color = geneToColor(traits.primaryColor);
  // Push lightness up so it reads well in terminal
  const boosted = { ...color, l: Math.max(color.l, 50) };
  const hex = hslToHex(boosted);

  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex),
    roughness: 0.3 + (traits.bodyShape[2] / 15) * 0.3,
    metalness: traits.special[0] > 10 ? 0.4 : 0.1,
    emissive: new THREE.Color(hex),
    emissiveIntensity: 0.3 + (traits.special[1] / 15) * 0.3,
  });
}

/** Create the secondary/accent material */
export function createAccentMaterial(traits: GenomeTraits): THREE.MeshStandardMaterial {
  const color = geneToColor(traits.secondaryColor);
  const boosted = { ...color, l: Math.max(color.l, 45) };
  const hex = hslToHex(boosted);

  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex),
    roughness: 0.4,
    metalness: 0.15,
    emissive: new THREE.Color(hex),
    emissiveIntensity: 0.2,
  });
}

/** Create an emissive eye material — bright glowing eyes */
export function createEyeMaterial(traits: GenomeTraits): THREE.MeshStandardMaterial {
  const glowIntensity = 0.8 + (traits.eyeStyle[1] / 15) * 1.2;
  const eyeHue = traits.eyeStyle[0] * 22.5;

  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(`hsl(${eyeHue}, 90%, 75%)`),
    emissive: new THREE.Color(`hsl(${eyeHue}, 90%, 75%)`),
    emissiveIntensity: glowIntensity,
    roughness: 0.1,
    metalness: 0.0,
  });
}

/** Create egg shell material — strong glow for terminal visibility */
export function createEggMaterial(traits: GenomeTraits): THREE.MeshStandardMaterial {
  const color = geneToColor(traits.primaryColor);
  const boosted = { ...color, s: Math.max(color.s, 50), l: Math.max(color.l, 55) };
  const hex = hslToHex(boosted);

  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex),
    roughness: 0.2,
    metalness: 0.2,
    emissive: new THREE.Color(hex),
    emissiveIntensity: 0.5,
  });
}

/** Get the genome-driven primary color as a THREE.Color */
export function getTraitColor(traits: GenomeTraits): THREE.Color {
  const color = geneToColor(traits.primaryColor);
  const boosted = { ...color, l: Math.max(color.l, 55) };
  return new THREE.Color(hslToHex(boosted));
}

/** Get the genome-driven secondary/special color as a THREE.Color */
export function getSpecialColor(traits: GenomeTraits): THREE.Color {
  const color = geneToColor(traits.special);
  const boosted = { ...color, l: Math.max(color.l, 60) };
  return new THREE.Color(hslToHex(boosted));
}
