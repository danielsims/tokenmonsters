import { useMemo } from "react";
import { useGame } from "../../game/context";
import { decodeGenome, getPrimaryGenes, geneToColor, hslToHex } from "../../models/genome";
import { getEvolutionHistory, getTotalTokensBySource } from "../../db/queries";
import { StatusBar } from "../components/StatusBar";

const TRAIT_LABELS: Record<string, string> = {
  bodyShape: "Body Shape",
  pattern: "Pattern",
  primaryColor: "Primary Color",
  secondaryColor: "Secondary Color",
  eyeStyle: "Eye Style",
  expression: "Expression",
  features: "Features",
  special: "Special",
};

export function InfoScreen() {
  const { monster, species } = useGame();

  if (!monster || !species) {
    return (
      <box justifyContent="center" alignItems="center" flexGrow={1}>
        <text fg="#666666">No monster data.</text>
      </box>
    );
  }

  const traits = useMemo(() => decodeGenome(monster.genome), [monster.genome]);
  const primary = useMemo(() => getPrimaryGenes(traits), [traits]);
  const history = useMemo(() => getEvolutionHistory(monster.id), [monster.id]);
  const tokenTotals = useMemo(() => getTotalTokensBySource(monster.id), [monster.id]);

  const primaryColor = hslToHex(geneToColor(traits.primaryColor));
  const secondaryColor = hslToHex(geneToColor(traits.secondaryColor));

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box
        border
        borderStyle="rounded"
        borderColor="#333355"
        backgroundColor="#0d0d1a"
        paddingX={2}
        height={3}
      >
        <text>
          <strong fg="#ffffff">Monster Info</strong>
          <span fg="#666688"> - {monster.name ?? "Unnamed"}</span>
        </text>
      </box>

      <box flexDirection="row" flexGrow={1}>
        {/* Left column: Genome */}
        <box flexGrow={1} flexDirection="column" paddingX={2} paddingY={1}>
          <text fg="#aaaacc">
            <u>Genome Traits</u>
          </text>
          <text fg="#555555">ID: {monster.genome.toString("hex").slice(0, 16)}...</text>
          <box height={1} />
          {(Object.keys(TRAIT_LABELS) as (keyof typeof TRAIT_LABELS)[]).map((key) => {
            const genes = primary[key as keyof typeof primary];
            if (!genes) return null;
            return (
              <text key={key} fg="#888888">
                {TRAIT_LABELS[key].padEnd(16)}{" "}
                <span fg="#aaaacc">
                  [{genes[0]}, {genes[1]}]
                </span>
              </text>
            );
          })}
          <box height={1} />
          <box flexDirection="row" gap={2}>
            <text fg="#888888">Primary: </text>
            <text fg={primaryColor}>{"\u2588\u2588\u2588\u2588"} {primaryColor}</text>
          </box>
          <box flexDirection="row" gap={2}>
            <text fg="#888888">Secondary: </text>
            <text fg={secondaryColor}>{"\u2588\u2588\u2588\u2588"} {secondaryColor}</text>
          </box>
        </box>

        {/* Right column: History + Tokens */}
        <box flexGrow={1} flexDirection="column" paddingX={2} paddingY={1}>
          <text fg="#aaaacc">
            <u>Token Sources</u>
          </text>
          <text fg="#ff8844">Claude:   {tokenTotals.claude.toLocaleString()}</text>
          <text fg="#44bbff">Codex:    {tokenTotals.codex.toLocaleString()}</text>
          <text fg="#44ff88">OpenCode: {tokenTotals.opencode.toLocaleString()}</text>
          <box height={1} />
          <text fg="#aaaacc">
            <u>Evolution History</u>
          </text>
          {history.length === 0 ? (
            <text fg="#555555">No evolutions yet.</text>
          ) : (
            history.map((h, i) => (
              <text key={i} fg="#888888">
                {h.fromStage} {"->"} {h.toStage} at{" "}
                {new Date(h.evolvedAt).toLocaleDateString()}
              </text>
            ))
          )}
          <box height={1} />
          <text fg="#aaaacc">
            <u>Details</u>
          </text>
          <text fg="#888888">Species:   {species.name} ({species.rarity})</text>
          <text fg="#888888">Origin:    {monster.origin}</text>
          <text fg="#888888">
            Created: {new Date(monster.createdAt).toLocaleDateString()}
          </text>
          {monster.hatchedAt && (
            <text fg="#888888">
              Hatched: {new Date(monster.hatchedAt).toLocaleDateString()}
            </text>
          )}
        </box>
      </box>

      <StatusBar />
    </box>
  );
}
