import type { CategoryDefinition, CategoryKey, Position, RosterSlot } from "./types";

export const CATEGORY_DEFINITIONS: CategoryDefinition[] = [
  { key: "G", label: "Goals", short: "G", tableLabel: "Goals (G)", group: "skater" },
  { key: "A", label: "Assists", short: "A", tableLabel: "Assists (A)", group: "skater" },
  { key: "PPP", label: "Power-Play Points", short: "PPP", tableLabel: "PPP", group: "skater" },
  { key: "SOG", label: "Shots on Goal", short: "SOG", tableLabel: "Shots (SOG)", group: "skater" },
  { key: "HIT", label: "Hits", short: "HIT", tableLabel: "Hits (HIT)", group: "skater" },
  { key: "BLK", label: "Blocks", short: "BLK", tableLabel: "Blocks (BLK)", group: "skater" },
  { key: "PIM", label: "Penalty Minutes", short: "PIM", tableLabel: "PIM", group: "skater" },
  { key: "FOW", label: "Faceoffs Won", short: "FOW", tableLabel: "Faceoffs (FOW)", group: "skater" },
  { key: "PM", label: "Plus/Minus", short: "+/-", tableLabel: "Plus/Minus (+/-)", group: "skater" },
  { key: "W", label: "Wins", short: "W", tableLabel: "Wins (W)", group: "goalie" },
  { key: "SV", label: "Saves", short: "SV", tableLabel: "Saves (SV)", group: "goalie" },
  {
    key: "SVPCT",
    label: "Save Percentage",
    short: "SV%",
    tableLabel: "Save % (SV%)",
    group: "goalie",
    rate: true,
    precision: 3,
  },
  {
    key: "GAA",
    label: "Goals Against Average",
    short: "GAA",
    tableLabel: "GAA",
    group: "goalie",
    rate: true,
    lowerIsBetter: true,
    precision: 2,
  },
  { key: "SO", label: "Shutouts", short: "SO", tableLabel: "Shutouts (SO)", group: "goalie" },
];

export const CATEGORY_BY_KEY: Record<CategoryKey, CategoryDefinition> = Object.fromEntries(
  CATEGORY_DEFINITIONS.map((definition) => [definition.key, definition]),
) as Record<CategoryKey, CategoryDefinition>;

export const SKATER_CATEGORIES = CATEGORY_DEFINITIONS.filter((c) => c.group === "skater");
export const GOALIE_CATEGORIES = CATEGORY_DEFINITIONS.filter((c) => c.group === "goalie");

/**
 * Whether a stat is even applicable to a player. A skater with no `W` is not
 * missing data — wins simply do not apply — so coverage reporting must not
 * count it against them.
 */
export function categoryAppliesTo(key: CategoryKey, positions: Position[]): boolean {
  const isGoalie = positions.includes("G");
  return CATEGORY_BY_KEY[key].group === "goalie" ? isGoalie : !isGoalie;
}

export const ROSTER_SLOT_LABELS: Record<RosterSlot, string> = {
  C: "Centers (C)",
  LW: "Left Wings (LW)",
  RW: "Right Wings (RW)",
  D: "Defensemen (D)",
  G: "Goalies (G)",
  UTIL: "Utility (UTIL)",
  BN: "Bench (BN)",
};

export const ROSTER_SLOT_SHORT: Record<RosterSlot, string> = {
  C: "C",
  LW: "LW",
  RW: "RW",
  D: "D",
  G: "G",
  UTIL: "UTIL",
  BN: "Bench",
};

/** Format a category total for display, honouring rate stats. */
export function formatCategoryValue(key: CategoryKey, value: number): string {
  const definition = CATEGORY_BY_KEY[key];
  if (definition.rate) return value.toFixed(definition.precision ?? 2);
  return Math.round(value).toLocaleString();
}
