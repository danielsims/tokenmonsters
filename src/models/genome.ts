import type { GenomeTraits, GenomeColor } from "./types";

/** Total genome size: 256 bits = 32 bytes */
const GENOME_SIZE = 32;

/** Trait categories, each occupying 4 bytes (32 bits = 8 genes x 4 bits) */
const TRAIT_OFFSETS = {
  bodyShape: 0,
  pattern: 4,
  primaryColor: 8,
  secondaryColor: 12,
  eyeStyle: 16,
  expression: 20,
  features: 24,
  special: 28,
} as const;

/** Generate a random 256-bit genome */
export function generateGenome(): Buffer {
  const buf = Buffer.alloc(GENOME_SIZE);
  for (let i = 0; i < GENOME_SIZE; i++) {
    buf[i] = Math.floor(Math.random() * 256);
  }
  return buf;
}

/** Extract 8 gene values (each 0-15) from a 4-byte trait block */
function extractGenes(genome: Buffer, offset: number): number[] {
  const genes: number[] = [];
  for (let i = 0; i < 4; i++) {
    const byte = genome[offset + i];
    genes.push((byte >> 4) & 0x0f); // High nibble
    genes.push(byte & 0x0f); // Low nibble
  }
  return genes;
}

/** Decode full genome into trait categories */
export function decodeGenome(genome: Buffer): GenomeTraits {
  if (genome.length !== GENOME_SIZE) {
    throw new Error(`Invalid genome size: expected ${GENOME_SIZE}, got ${genome.length}`);
  }
  return {
    bodyShape: extractGenes(genome, TRAIT_OFFSETS.bodyShape),
    pattern: extractGenes(genome, TRAIT_OFFSETS.pattern),
    primaryColor: extractGenes(genome, TRAIT_OFFSETS.primaryColor),
    secondaryColor: extractGenes(genome, TRAIT_OFFSETS.secondaryColor),
    eyeStyle: extractGenes(genome, TRAIT_OFFSETS.eyeStyle),
    expression: extractGenes(genome, TRAIT_OFFSETS.expression),
    features: extractGenes(genome, TRAIT_OFFSETS.features),
    special: extractGenes(genome, TRAIT_OFFSETS.special),
  };
}

/** Get the primary (visible) genes — first 2 per trait block */
export function getPrimaryGenes(traits: GenomeTraits): Record<keyof GenomeTraits, [number, number]> {
  const result = {} as Record<keyof GenomeTraits, [number, number]>;
  for (const key of Object.keys(traits) as (keyof GenomeTraits)[]) {
    result[key] = [traits[key][0], traits[key][1]];
  }
  return result;
}

/** Map a gene value (0-15) to an HSL color */
export function geneToColor(genes: number[]): GenomeColor {
  const hue = genes[0] * 22.5; // 0-337.5, covers full spectrum
  const saturation = 50 + genes[1] * 3; // 50-95%
  const lightness = 40 + genes[1] * 2; // 40-70%
  return { h: hue, s: saturation, l: lightness };
}

/** Convert HSL to hex string for terminal rendering */
export function hslToHex(color: GenomeColor): string {
  const { h, s, l } = color;
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lN - c / 2;

  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const toHex = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Get the primary color hex from a genome */
export function getGenomePrimaryColor(genome: Buffer): string {
  const traits = decodeGenome(genome);
  return hslToHex(geneToColor(traits.primaryColor));
}

/** Get the secondary color hex from a genome */
export function getGenomeSecondaryColor(genome: Buffer): string {
  const traits = decodeGenome(genome);
  return hslToHex(geneToColor(traits.secondaryColor));
}

/** Encode trait values back into a genome buffer (for testing/breeding) */
export function encodeTraits(traits: GenomeTraits): Buffer {
  const buf = Buffer.alloc(GENOME_SIZE);
  const traitKeys = Object.keys(TRAIT_OFFSETS) as (keyof typeof TRAIT_OFFSETS)[];

  for (const key of traitKeys) {
    const offset = TRAIT_OFFSETS[key];
    const genes = traits[key];
    for (let i = 0; i < 4; i++) {
      buf[offset + i] = ((genes[i * 2] & 0x0f) << 4) | (genes[i * 2 + 1] & 0x0f);
    }
  }
  return buf;
}
