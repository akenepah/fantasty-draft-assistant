import { CATEGORY_BY_KEY } from "./categories";
import { scoredCategories, teamTotals } from "./scoring";
import type {
  CategoryKey,
  LeagueScoringSettings,
  Player,
  ProjectedStandings,
  ProjectedTeamTotals,
  StandingRow,
} from "./types";

/**
 * League-wide projected standings.
 *
 * Every franchise is evaluated, not just the managed team, and both Team
 * Comparisons and Draft Results read these same rows — there is no second
 * standings calculation anywhere in the app.
 *
 *   category mode — rotisserie: each scored category is ranked across the
 *     league and awards (teams − rank + 1) points.
 *   points mode   — franchises are ranked directly on projected fantasy
 *     points.
 *
 * The head-to-head record is a projection: each franchise is played against
 * every other, category by category, and the majority takes the matchup.
 */

export type RosterMap = Record<string, Player[]>;

export function computeTeamTotals(
  rosters: RosterMap,
  scoring: LeagueScoringSettings,
  unresolvedByFranchise: Record<string, number> = {},
): Record<string, ProjectedTeamTotals> {
  return Object.fromEntries(
    Object.entries(rosters).map(([franchiseId, players]) => [
      franchiseId,
      teamTotals(franchiseId, players, scoring, unresolvedByFranchise[franchiseId] ?? 0),
    ]),
  );
}

/** 1 = best. Ties share the better rank, matching how roto leagues read. */
export function categoryRanks(
  totals: Record<string, ProjectedTeamTotals>,
  key: CategoryKey,
): Record<string, number> {
  const lowerIsBetter = CATEGORY_BY_KEY[key].lowerIsBetter === true;
  const entries = Object.entries(totals).map(([franchiseId, team]) => ({
    franchiseId,
    value: team.totals[key]?.value ?? 0,
    contributors: team.totals[key]?.contributors ?? 0,
  }));

  // A franchise with no contributor in a category cannot lead it; sort those
  // last regardless of direction rather than letting a 0.00 GAA "win".
  entries.sort((a, b) => {
    if (a.contributors === 0 && b.contributors === 0) return 0;
    if (a.contributors === 0) return 1;
    if (b.contributors === 0) return -1;
    return lowerIsBetter ? a.value - b.value : b.value - a.value;
  });

  const ranks: Record<string, number> = {};
  entries.forEach((entry, index) => {
    ranks[entry.franchiseId] = index + 1;
  });
  return ranks;
}

export function computeStandings(
  rosters: RosterMap,
  scoring: LeagueScoringSettings,
  unresolvedByFranchise: Record<string, number> = {},
): { standings: ProjectedStandings; totals: Record<string, ProjectedTeamTotals> } {
  const totals = computeTeamTotals(rosters, scoring, unresolvedByFranchise);
  const franchiseIds = Object.keys(rosters);
  const keys = scoredCategories(scoring);
  const teams = franchiseIds.length;

  const ranksByCategory = Object.fromEntries(
    keys.map((key) => [key, categoryRanks(totals, key)]),
  ) as Record<CategoryKey, Record<string, number>>;

  const beats = (a: string, b: string, key: CategoryKey): number => {
    const lowerIsBetter = CATEGORY_BY_KEY[key].lowerIsBetter === true;
    const left = totals[a].totals[key];
    const right = totals[b].totals[key];
    // No data on either side is not a win for anyone.
    if (!left?.contributors && !right?.contributors) return 0;
    if (!left?.contributors) return -1;
    if (!right?.contributors) return 1;
    if (left.value === right.value) return 0;
    return (lowerIsBetter ? left.value < right.value : left.value > right.value) ? 1 : -1;
  };

  const rows: StandingRow[] = franchiseIds.map((franchiseId) => {
    const points =
      scoring.format === "points"
        ? (totals[franchiseId].fantasyPoints ?? 0)
        : keys.reduce((sum, key) => sum + (teams - ranksByCategory[key][franchiseId] + 1), 0);

    let wins = 0;
    let losses = 0;
    let ties = 0;
    for (const opponent of franchiseIds) {
      if (opponent === franchiseId) continue;
      if (scoring.format === "points") {
        const mine = totals[franchiseId].fantasyPoints ?? 0;
        const theirs = totals[opponent].fantasyPoints ?? 0;
        if (mine > theirs) wins += 1;
        else if (mine < theirs) losses += 1;
        else ties += 1;
      } else {
        const won = keys.filter((key) => beats(franchiseId, opponent, key) > 0).length;
        const lost = keys.filter((key) => beats(franchiseId, opponent, key) < 0).length;
        if (won > lost) wins += 1;
        else if (won < lost) losses += 1;
        else ties += 1;
      }
    }

    const team = totals[franchiseId];
    const incomplete =
      team.unresolvedPicks > 0 ||
      team.unprojectedPlayers > 0 ||
      keys.some((key) => (team.totals[key]?.missing ?? 0) > 0);

    return {
      franchiseId,
      rank: 0,
      points: Number(points.toFixed(1)),
      categoryRanks: Object.fromEntries(keys.map((key) => [key, ranksByCategory[key][franchiseId]])),
      wins,
      losses,
      ties,
      incomplete,
    };
  });

  rows.sort((a, b) => b.points - a.points || b.wins - a.wins);
  rows.forEach((row, index) => {
    row.rank = index + 1;
  });

  return { standings: { rows, format: scoring.format }, totals };
}
