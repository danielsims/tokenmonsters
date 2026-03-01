import type { Monster, Species } from "../models/types";
import { NFT_SYMBOL, SELLER_FEE_BASIS_POINTS } from "./config";

/** Metaplex-standard off-chain metadata JSON */
export interface MetaplexMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  attributes: { trait_type: string; value: string }[];
  properties: {
    category: string;
    creators: { address: string; share: number }[];
  };
}

/** Max name length enforced by Metaplex Token Metadata program */
const MAX_NAME_LENGTH = 32;
const MAX_SYMBOL_LENGTH = 10;

/**
 * Build Metaplex-standard off-chain metadata JSON from a monster + species.
 * This is the JSON that would live at the NFT's URI (Arweave/IPFS/server).
 */
export function buildMetadata(
  monster: Monster,
  species: Species,
  creatorAddress: string,
): MetaplexMetadata {
  const genomeHex = monster.genome.toString("hex");
  const formName = getFormName(monster, species);
  const eggName = species.forms[0]?.name || "Unknown";

  return {
    name: buildNftName(monster, species),
    symbol: NFT_SYMBOL,
    description: "A Token Monsters creature raised on AI tokens.",
    image: "", // Metadata server TBD
    attributes: [
      { trait_type: "Species", value: eggName },
      { trait_type: "Form", value: formName },
      { trait_type: "Stage", value: monster.stage },
      { trait_type: "Rarity", value: species.rarity },
      { trait_type: "Genome", value: genomeHex },
    ],
    properties: {
      category: "image",
      creators: [{ address: creatorAddress, share: 100 }],
    },
  };
}

/**
 * Build the on-chain NFT name. Metaplex enforces a 32-char limit.
 * Format: "FormName #abcd" where abcd is the first 4 hex chars of the genome.
 */
export function buildNftName(monster: Monster, species: Species): string {
  const formName = getFormName(monster, species);
  const shortGenome = monster.genome.toString("hex").slice(0, 4);
  const name = `${formName} #${shortGenome}`;
  return name.slice(0, MAX_NAME_LENGTH);
}

/** Get the current form name for a monster */
function getFormName(monster: Monster, species: Species): string {
  const form = species.forms.find((f) => f.stage === monster.stage);
  return form?.name || species.forms[0]?.name || "Unknown";
}

/** Validate metadata meets Metaplex requirements */
export function validateMetadata(metadata: MetaplexMetadata): string[] {
  const errors: string[] = [];

  if (!metadata.name || metadata.name.length > MAX_NAME_LENGTH) {
    errors.push(`Name must be 1-${MAX_NAME_LENGTH} characters`);
  }
  if (!metadata.symbol || metadata.symbol.length > MAX_SYMBOL_LENGTH) {
    errors.push(`Symbol must be 1-${MAX_SYMBOL_LENGTH} characters`);
  }
  if (!metadata.attributes || metadata.attributes.length === 0) {
    errors.push("Attributes are required");
  }

  const genome = metadata.attributes.find((a) => a.trait_type === "Genome");
  if (!genome || genome.value.length !== 64 || !/^[0-9a-f]+$/.test(genome.value)) {
    errors.push("Genome must be a 64-char hex string");
  }

  if (!metadata.properties?.creators?.length) {
    errors.push("At least one creator is required");
  } else {
    const totalShare = metadata.properties.creators.reduce((sum, c) => sum + c.share, 0);
    if (totalShare !== 100) {
      errors.push("Creator shares must total 100");
    }
  }

  return errors;
}
