import { useMemo } from "react";
import { useGame } from "../../game/context";
import { decodeGenome, getPrimaryGenes, geneToColor, hslToHex } from "../../models/genome";
import { getEvolutionHistory, getTotalTokensBySource } from "../../db/queries";
import { getCurrentForm, getDisplayName } from "../../models/evolution";
import { getLevel } from "../../models/level";
import { StatusBar } from "../components/StatusBar";
import { t } from "../theme";

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
        <text fg={t.text.muted}>No monster data.</text>
      </box>
    );
  }

  const traits = useMemo(() => decodeGenome(monster.genome), [monster.genome]);
  const primary = useMemo(() => getPrimaryGenes(traits), [traits]);
  const history = useMemo(() => getEvolutionHistory(monster.id), [monster.id]);
  const tokenTotals = useMemo(() => getTotalTokensBySource(monster.id), [monster.id]);

  const primaryColor = hslToHex(geneToColor(traits.primaryColor));
  const secondaryColor = hslToHex(geneToColor(traits.secondaryColor));
  const displayName = getDisplayName(monster, species);
  const level = getLevel(monster.experience);

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box
        border
        borderStyle="rounded"
        borderColor={t.border.muted}
        backgroundColor={t.bg.base}
        paddingX={2}
        height={3}
      >
        <text>
          <strong fg={t.text.primary}>Monster Info</strong>
          <span fg={t.text.dim}> - {displayName}</span>
          <span fg={t.accent.primary}> Lv.{level}</span>
        </text>
      </box>

      <box flexDirection="row" flexGrow={1}>
        {/* Left column: Genome + Evolution Line */}
        <box flexGrow={1} flexDirection="column" paddingX={2} paddingY={1}>
          <text fg={t.text.secondary}>
            <u>Genome Traits</u>
          </text>
          <text fg={t.text.dim}>ID: {monster.genome.toString("hex").slice(0, 16)}...</text>
          <box height={1} />
          {(Object.keys(TRAIT_LABELS) as (keyof typeof TRAIT_LABELS)[]).map((key) => {
            const genes = primary[key as keyof typeof primary];
            if (!genes) return null;
            return (
              <text key={key} fg={t.text.muted}>
                {TRAIT_LABELS[key].padEnd(16)}{" "}
                <span fg={t.text.secondary}>
                  [{genes[0]}, {genes[1]}]
                </span>
              </text>
            );
          })}
          <box height={1} />
          <box flexDirection="row" gap={2}>
            <text fg={t.text.muted}>Primary: </text>
            <text fg={primaryColor}>{"\u2588\u2588\u2588\u2588"} {primaryColor}</text>
          </box>
          <box flexDirection="row" gap={2}>
            <text fg={t.text.muted}>Secondary: </text>
            <text fg={secondaryColor}>{"\u2588\u2588\u2588\u2588"} {secondaryColor}</text>
          </box>
          <box height={1} />
          <text fg={t.text.secondary}>
            <u>Evolution Line</u>
          </text>
          {species.forms.map((form, i) => {
            const isCurrent = form.stage === monster.stage;
            const color = isCurrent ? t.accent.primary : t.text.dim;
            const marker = isCurrent ? ">" : " ";
            return (
              <text key={i} fg={color}>
                {marker} {form.name}{form.evolvesAtLevel !== null ? ` (Lv.${form.evolvesAtLevel})` : " (Final)"}
              </text>
            );
          })}
        </box>

        {/* Right column: History + Tokens */}
        <box flexGrow={1} flexDirection="column" paddingX={2} paddingY={1}>
          <text fg={t.text.secondary}>
            <u>Token Sources</u>
          </text>
          <text fg={t.source.claude}>Claude:   {tokenTotals.claude.toLocaleString()}</text>
          <text fg={t.source.codex}>Codex:    {tokenTotals.codex.toLocaleString()}</text>
          <text fg={t.source.opencode}>OpenCode: {tokenTotals.opencode.toLocaleString()}</text>
          <box height={1} />
          <text fg={t.text.secondary}>
            <u>Evolution History</u>
          </text>
          {history.length === 0 ? (
            <text fg={t.text.dim}>No evolutions yet.</text>
          ) : (
            history.map((h, i) => (
              <text key={i} fg={t.text.muted}>
                {h.fromStage} {"->"} {h.toStage} at{" "}
                {new Date(h.evolvedAt).toLocaleDateString()}
              </text>
            ))
          )}
          <box height={1} />
          <text fg={t.text.secondary}>
            <u>Details</u>
          </text>
          <text fg={t.text.muted}>Species:   {species.id} ({species.rarity})</text>
          <text fg={t.text.muted}>Origin:    {monster.origin}</text>
          <text fg={t.text.muted}>
            Created: {new Date(monster.createdAt).toLocaleDateString()}
          </text>
          {monster.hatchedAt && (
            <text fg={t.text.muted}>
              Hatched: {new Date(monster.hatchedAt).toLocaleDateString()}
            </text>
          )}
        </box>
      </box>

      <StatusBar />
    </box>
  );
}
