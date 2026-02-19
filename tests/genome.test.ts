import { test, expect, describe } from "bun:test";
import {
  generateGenome,
  decodeGenome,
  encodeTraits,
  getPrimaryGenes,
  geneToColor,
  hslToHex,
  getGenomePrimaryColor,
} from "../src/models/genome";

describe("Genome", () => {
  test("generateGenome creates a 32-byte buffer", () => {
    const genome = generateGenome();
    expect(genome.length).toBe(32);
    expect(Buffer.isBuffer(genome)).toBe(true);
  });

  test("decodeGenome extracts 8 trait categories", () => {
    const genome = generateGenome();
    const traits = decodeGenome(genome);

    expect(Object.keys(traits)).toEqual([
      "bodyShape",
      "pattern",
      "primaryColor",
      "secondaryColor",
      "eyeStyle",
      "expression",
      "features",
      "special",
    ]);

    // Each category should have 8 genes
    for (const genes of Object.values(traits)) {
      expect(genes.length).toBe(8);
      for (const gene of genes) {
        expect(gene).toBeGreaterThanOrEqual(0);
        expect(gene).toBeLessThanOrEqual(15);
      }
    }
  });

  test("encode/decode roundtrip preserves traits", () => {
    const genome = generateGenome();
    const traits = decodeGenome(genome);
    const reencoded = encodeTraits(traits);
    const redecoded = decodeGenome(reencoded);

    expect(redecoded).toEqual(traits);
  });

  test("getPrimaryGenes returns first 2 genes per category", () => {
    const genome = generateGenome();
    const traits = decodeGenome(genome);
    const primary = getPrimaryGenes(traits);

    for (const key of Object.keys(primary) as (keyof typeof primary)[]) {
      expect(primary[key].length).toBe(2);
      expect(primary[key][0]).toBe(traits[key][0]);
      expect(primary[key][1]).toBe(traits[key][1]);
    }
  });

  test("geneToColor returns valid HSL values", () => {
    for (let i = 0; i <= 15; i++) {
      const color = geneToColor([i, i, 0, 0, 0, 0, 0, 0]);
      expect(color.h).toBeGreaterThanOrEqual(0);
      expect(color.h).toBeLessThanOrEqual(360);
      expect(color.s).toBeGreaterThanOrEqual(50);
      expect(color.s).toBeLessThanOrEqual(95);
      expect(color.l).toBeGreaterThanOrEqual(40);
      expect(color.l).toBeLessThanOrEqual(70);
    }
  });

  test("hslToHex returns valid hex color strings", () => {
    const color = { h: 180, s: 70, l: 55 };
    const hex = hslToHex(color);
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  test("getGenomePrimaryColor returns hex string", () => {
    const genome = generateGenome();
    const color = getGenomePrimaryColor(genome);
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  test("same genome always produces same colors (deterministic)", () => {
    const genome = generateGenome();
    const color1 = getGenomePrimaryColor(genome);
    const color2 = getGenomePrimaryColor(genome);
    expect(color1).toBe(color2);
  });

  test("decodeGenome rejects wrong size", () => {
    expect(() => decodeGenome(Buffer.alloc(16))).toThrow("Invalid genome size");
  });
});
