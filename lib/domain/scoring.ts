import { CATEGORY_BY_KEY, categoryAppliesTo } from "./categories";
import type {
  CategoryKey,
  CategoryTotal,
  LeagueScoringSettings,
  Player,
  ProjectedTeamTotals,
} from "./types";

/**
 * Category and points scoring.
 *
 * The one rule that shapes all of it: a stat a source did not provide is
 * unknown, not zero. Unknown values are excluded from sums and averages and
 * reported as missing coverage, so a half-projected roster never looks like
 * a fully projected weak one.
 */

/** Stats that actually count, given the league's scoring settings. */
export function scoredCategories(scoring: LeagueScoringSettings): CategoryKey[] {
  return scoring.format === "points" ? scoring.pointCategories : scoring.activeCategories;
}

/**
 * One category total across a set of players. Rate stats (SV%, GAA) are
 * averaged over the players who have a value; counting stats are summed.
 */
export function categoryTotal(players: Player[], key: CategoryKey): CategoryTotal {
  const definition = CATEGORY_BY_KEY[key];
  let sum = 0;
  let contributors = 0;
  let missing = 0;

  for (const player of players) {
    if (!categoryAppliesTo(key, player.eligibility.positions)) continue;
    const value = player.stats[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      sum += value;
      contributors += 1;
    } else {
      missing += 1;
    }
  }

  const value = definition.rate ? (contributors > 0 ? sum / contributors : 0) : sum;
  return { key, value, contributors, missing };
}

/**
 * Projected fantasy points for one player under points scoring. Returns
 * `undefined` when the player has no scored stat at all — that is an
 * unknown, and the caller must not fold it in as a zero.
 */
export function playerFantasyPoints(
  player: Player,
  scoring: LeagueScoringSettings,
): number | undefined {
  let total = 0;
  let counted = 0;

  for (const key of scoring.pointCategories) {
    const definition = CATEGORY_BY_KEY[key];
    // Rate stats have no per-event value; points leagues do not score them.
    if (definition.rate) continue;
    if (!categoryAppliesTo(key, player.eligibility.positions)) continue;

    const value = player.stats[key];
    const pointValue = scoring.pointValues[key];
    if (typeof value !== "number" || typeof pointValue !== "number") continue;

    total += value * pointValue;
    counted += 1;
  }

  return counted > 0 ? Number(total.toFixed(1)) : undefined;
}

/** Every projected total for one franchise, under the active scoring rules. */
export function teamTotals(
  franchiseId: string,
  players: Player[],
  scoring: LeagueScoringSettings,
  unresolvedPicks = 0,
): ProjectedTeamTotals {
  const keys = scoredCategories(scoring);
  const totals: Partial<Record<CategoryKey, CategoryTotal>> = {};

  for (const key of keys) {
    totals[key] = categoryTotal(players, key);
  }

  let fantasyPoints: number | undefined;
  if (scoring.format === "points") {
    const values = players
      .map((player) => playerFantasyPoints(player, scoring))
      .filter((value): value is number => typeof value === "number");
    fantasyPoints = values.length > 0 ? Number(values.reduce((a, b) => a + b, 0).toFixed(1)) : 0;
  }

  const unprojectedPlayers = players.filter(
    (player) => Object.keys(player.stats).length === 0,
  ).length;

  return { franchiseId, totals, fantasyPoints, unprojectedPlayers, unresolvedPicks };
}
