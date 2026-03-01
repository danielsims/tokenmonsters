import { test, expect, describe } from "bun:test";
import { buildMetadata, buildNftName, validateMetadata } from "../src/chain/metadata";
import type { Monster, Species } from "../src/models/types";

// --- Test fixtures ---

function makeMonster(overrides: Partial<Monster> = {}): Monster {
  return {
    id: "test-id-001",
    name: null,
    speciesId: 1,
    genome: Buffer.from("a3f8bc12de4567890123456789abcdef0011223344556677", "hex").subarray(0, 32),
    stage: "egg",
    hunger: 100,
    happiness: 100,
    energy: 100,
    experience: 0,
    createdAt: 1700000000000,
    hatchedAt: null,
    lastFedAt: null,
    lastInteractionAt: null,
    evolvedAt: null,
    checksum: "fake-checksum",
    origin: "generated",
    originFrom: "mint:devnet",
    mintAddress: null,
    mintNetwork: null,
    claimedBy: null,
    tampered: false,
    ...overrides,
  };
}

// Pad to exactly 32 bytes
function makeGenome(hex: string): Buffer {
  return Buffer.from(hex.padEnd(64, "0"), "hex");
}

const testSpecies: Species = {
  id: 1,
  description: "An open-source crustacean.",
  rarity: "common",
  baseHungerRate: 3.5,
  baseHappinessRate: 2.0,
  forms: [
    { stage: "egg", name: "Molting Egg", description: "An egg.", evolvesAtLevel: null, hatchXp: 5_000_000 },
    { stage: "hatchling", name: "Pinchy", description: "A small crab.", evolvesAtLevel: 16 },
    { stage: "prime", name: "Viceclaw", description: "Fiercely loyal.", evolvesAtLevel: 36 },
    { stage: "apex", name: "Gigaclaw", description: "A colossal siege crab.", evolvesAtLevel: null },
  ],
};

const creatorAddress = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";

// ---------------------------------------------------------------------------
// Metadata Builder
// ---------------------------------------------------------------------------

describe("buildMetadata", () => {
  test("produces valid metadata for an egg", () => {
    const monster = makeMonster({ genome: makeGenome("a3f8bc12de4567890123456789abcdef") });
    const meta = buildMetadata(monster, testSpecies, creatorAddress);

    expect(meta.name).toBe("Molting Egg #a3f8");
    expect(meta.symbol).toBe("TMON");
    expect(meta.description).toBe("A Token Monsters creature raised on AI tokens.");
    expect(meta.attributes).toHaveLength(5);
    expect(meta.properties.creators).toHaveLength(1);
    expect(meta.properties.creators[0].share).toBe(100);
  });

  test("uses the correct form name for each stage", () => {
    const egg = buildMetadata(makeMonster({ stage: "egg" }), testSpecies, creatorAddress);
    expect(egg.attributes.find((a) => a.trait_type === "Form")?.value).toBe("Molting Egg");

    const hatchling = buildMetadata(makeMonster({ stage: "hatchling" }), testSpecies, creatorAddress);
    expect(hatchling.attributes.find((a) => a.trait_type === "Form")?.value).toBe("Pinchy");

    const prime = buildMetadata(makeMonster({ stage: "prime" }), testSpecies, creatorAddress);
    expect(prime.attributes.find((a) => a.trait_type === "Form")?.value).toBe("Viceclaw");

    const apex = buildMetadata(makeMonster({ stage: "apex" }), testSpecies, creatorAddress);
    expect(apex.attributes.find((a) => a.trait_type === "Form")?.value).toBe("Gigaclaw");
  });

  test("genome attribute is 64-char lowercase hex", () => {
    const genome = makeGenome("deadbeefcafebabe1122334455667788");
    const meta = buildMetadata(makeMonster({ genome }), testSpecies, creatorAddress);
    const genomeAttr = meta.attributes.find((a) => a.trait_type === "Genome");
    expect(genomeAttr).toBeDefined();
    expect(genomeAttr!.value).toHaveLength(64);
    expect(genomeAttr!.value).toMatch(/^[0-9a-f]{64}$/);
  });

  test("species attribute uses egg form name", () => {
    const meta = buildMetadata(makeMonster({ stage: "prime" }), testSpecies, creatorAddress);
    expect(meta.attributes.find((a) => a.trait_type === "Species")?.value).toBe("Molting Egg");
  });

  test("rarity attribute matches species", () => {
    const meta = buildMetadata(makeMonster(), testSpecies, creatorAddress);
    expect(meta.attributes.find((a) => a.trait_type === "Rarity")?.value).toBe("common");
  });

  test("creator address is passed through exactly", () => {
    const addr = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
    const meta = buildMetadata(makeMonster(), testSpecies, addr);
    expect(meta.properties.creators[0].address).toBe(addr);
  });
});

// ---------------------------------------------------------------------------
// NFT Name Builder
// ---------------------------------------------------------------------------

describe("buildNftName", () => {
  test("formats as 'FormName #xxxx'", () => {
    const genome = makeGenome("abcd1234");
    const name = buildNftName(makeMonster({ genome, stage: "egg" }), testSpecies);
    expect(name).toBe("Molting Egg #abcd");
  });

  test("uses hatchling form name", () => {
    const name = buildNftName(makeMonster({ stage: "hatchling" }), testSpecies);
    expect(name).toStartWith("Pinchy #");
  });

  test("truncates to 32 chars max", () => {
    // Species with a very long form name
    const longSpecies: Species = {
      ...testSpecies,
      forms: [{ stage: "egg", name: "Extraordinarily Long Monster Name", description: "", evolvesAtLevel: null }],
    };
    const name = buildNftName(makeMonster(), longSpecies);
    expect(name.length).toBeLessThanOrEqual(32);
  });
});

// ---------------------------------------------------------------------------
// Metadata Validation
// ---------------------------------------------------------------------------

describe("validateMetadata", () => {
  test("valid metadata passes with no errors", () => {
    const meta = buildMetadata(makeMonster({ genome: makeGenome("a3f8bc12") }), testSpecies, creatorAddress);
    expect(validateMetadata(meta)).toEqual([]);
  });

  test("rejects empty name", () => {
    const meta = buildMetadata(makeMonster(), testSpecies, creatorAddress);
    meta.name = "";
    const errors = validateMetadata(meta);
    expect(errors.some((e) => e.includes("Name"))).toBe(true);
  });

  test("rejects name over 32 chars", () => {
    const meta = buildMetadata(makeMonster(), testSpecies, creatorAddress);
    meta.name = "A".repeat(33);
    const errors = validateMetadata(meta);
    expect(errors.some((e) => e.includes("Name"))).toBe(true);
  });

  test("rejects missing genome attribute", () => {
    const meta = buildMetadata(makeMonster(), testSpecies, creatorAddress);
    meta.attributes = meta.attributes.filter((a) => a.trait_type !== "Genome");
    const errors = validateMetadata(meta);
    expect(errors.some((e) => e.includes("Genome"))).toBe(true);
  });

  test("rejects invalid genome hex", () => {
    const meta = buildMetadata(makeMonster(), testSpecies, creatorAddress);
    const genomeAttr = meta.attributes.find((a) => a.trait_type === "Genome")!;
    genomeAttr.value = "not-hex-at-all";
    const errors = validateMetadata(meta);
    expect(errors.some((e) => e.includes("Genome"))).toBe(true);
  });

  test("rejects missing creators", () => {
    const meta = buildMetadata(makeMonster(), testSpecies, creatorAddress);
    meta.properties.creators = [];
    const errors = validateMetadata(meta);
    expect(errors.some((e) => e.includes("creator"))).toBe(true);
  });

  test("rejects creator shares not totaling 100", () => {
    const meta = buildMetadata(makeMonster(), testSpecies, creatorAddress);
    meta.properties.creators = [
      { address: creatorAddress, share: 50 },
      { address: "other", share: 30 },
    ];
    const errors = validateMetadata(meta);
    expect(errors.some((e) => e.includes("shares"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Genome Encoding Roundtrip
// ---------------------------------------------------------------------------

describe("genome hex encoding", () => {
  test("32-byte buffer produces 64-char hex string", () => {
    const genome = Buffer.alloc(32);
    for (let i = 0; i < 32; i++) genome[i] = i;
    expect(genome.toString("hex")).toHaveLength(64);
  });

  test("hex roundtrip preserves bytes", () => {
    const original = Buffer.from("a3f8bc12de4567890123456789abcdef00112233445566778899aabbccddeeff", "hex");
    const hex = original.toString("hex");
    const restored = Buffer.from(hex, "hex");
    expect(restored).toEqual(original);
  });

  test("different genomes produce different names", () => {
    const m1 = makeMonster({ genome: makeGenome("aaaa1111") });
    const m2 = makeMonster({ genome: makeGenome("bbbb2222") });
    const name1 = buildNftName(m1, testSpecies);
    const name2 = buildNftName(m2, testSpecies);
    expect(name1).not.toBe(name2);
  });
});
