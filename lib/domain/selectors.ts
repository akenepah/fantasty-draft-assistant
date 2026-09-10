import { buildPlayerPool, type PlayerPool } from "./projections";
import { recommend, type RecommendationResult } from "./recommend";
import { assignSlots, rosterCapacity, type SlotCapacity, type SlottedPlayer } from "./roster";
import {
  derivePointer,
  draftPhase,
  franchiseTurn,
  isRosterFinishing,
  type DraftPhase,
  type DraftPointer,
  type FranchiseTurn,
} from "./schedule";
import { computeStandings } from "./standings";
import { draftedPlayerIds, type AppState } from "./state";
import type { Player, ProjectedStandings, ProjectedTeamTotals } from "./types";

/**
 * Everything the screens read is derived here, from the one state object.
 *
 * The split matters: `deriveDraft` covers the facts the app must never lose
 * — the schedule, who picked whom, what is still available — and is written
 * so it cannot throw. `deriveAnalytics` covers projections, standings and
 * recommendations, and is allowed to fail: when it does the app drops to
 * Tracking-Only Recovery rather than taking the live draft down with it.
 */

export type DraftState = {
  pool: PlayerPool;
  /** Players not yet taken, in pool order. */
  available: Player[];
  draftedIds: Set<string>;
  /** Players owned before the draft; empty outside a keeper league. */
  keeperIds: Set<string>;
  /** Resolved players by franchise, in the order they were drafted. */
  rosters: Record<string, Player[]>;
  /** Picks recorded against a placeholder, by franchise. */
  unresolvedByFranchise: Record<string, number>;
  unresolvedTotal: number;
  pointer: DraftPointer;
  managedTurn: FranchiseTurn;
  phase: DraftPhase;
  finishingMode: boolean;
  managedRoster: Player[];
  managedSlots: SlottedPlayer[];
  managedCapacity: SlotCapacity[];
};

export type AnalyticsState = {
  totals: Record<string, ProjectedTeamTotals>;
  standings: ProjectedStandings;
  recommendation: RecommendationResult;
};

export type Derived = {
  draft: DraftState;
  analytics?: AnalyticsState;
  /** Set when analytics failed; the draft keeps running regardless. */
  analyticsError?: string;
};

const cache = new WeakMap<AppState, Derived>();

export function derive(state: AppState): Derived {
  const cached = cache.get(state);
  if (cached) return cached;

  const draft = deriveDraft(state);
  let analytics: AnalyticsState | undefined;
  let analyticsError: string | undefined;

  try {
    analytics = deriveAnalytics(state, draft);
  } catch (error) {
    analyticsError =
      error instanceof Error ? error.message : "Projection analysis failed unexpectedly.";
  }

  const result: Derived = { draft, analytics, analyticsError };
  cache.set(state, result);
  return result;
}

function deriveDraft(state: AppState): DraftState {
  const pool = buildPlayerPool(state.sources, state.projectionConfig);
  const draftedIds = draftedPlayerIds(state.draft);

  // Keepers are owned before pick one, so they are opening roster state rather
  // than draft history: they fill slots, count against capacity, and are not
  // draftable. Only a keeper league has them.
  const keepers = state.league.leagueType === "keeper" ? state.league.keepers : [];
  const keeperIds = new Set(keepers.map((keeper) => keeper.playerId));

  const available = pool.players.filter(
    (player) => !draftedIds.has(player.id) && !keeperIds.has(player.id),
  );

  const rosters: Record<string, Player[]> = Object.fromEntries(
    state.league.franchises.map((franchise) => [franchise.id, [] as Player[]]),
  );
  const unresolvedByFranchise: Record<string, number> = Object.fromEntries(
    state.league.franchises.map((franchise) => [franchise.id, 0]),
  );

  // Before any pick: a kept player already occupies his spot in round one.
  for (const keeper of keepers) {
    if (!(keeper.franchiseId in rosters)) continue;
    const player = pool.byId[keeper.playerId];
    // As with a pick, a keeper can outlive the source that projected him. He
    // still holds the roster spot; he just has no numbers behind him.
    if (player) rosters[keeper.franchiseId].push(player);
    else unresolvedByFranchise[keeper.franchiseId] += 1;
  }

  const ordered = Object.values(state.draft.picks).sort((a, b) => a.overall - b.overall);
  for (const pick of ordered) {
    if (!(pick.franchiseId in rosters)) continue;
    if (pick.selection.kind === "unresolved") {
      unresolvedByFranchise[pick.franchiseId] += 1;
      continue;
    }
    const player = pool.byId[pick.selection.playerId];
    // A pick can outlive the source that named the player (a removed
    // import). It still owns a roster spot; it just has no projection.
    if (player) rosters[pick.franchiseId].push(player);
    else unresolvedByFranchise[pick.franchiseId] += 1;
  }

  const pointer = derivePointer(state.draft);
  const managedTurn = franchiseTurn(state.draft, state.league.managedFranchiseId);
  const managedRoster = rosters[state.league.managedFranchiseId] ?? [];

  return {
    pool,
    available,
    draftedIds,
    keeperIds,
    rosters,
    unresolvedByFranchise,
    unresolvedTotal: Object.values(unresolvedByFranchise).reduce((sum, n) => sum + n, 0),
    pointer,
    managedTurn,
    phase: draftPhase(managedTurn.picksUntil),
    finishingMode: isRosterFinishing(managedTurn.remainingPicks),
    managedRoster,
    managedSlots: assignSlots(managedRoster, state.league.roster),
    managedCapacity: rosterCapacity(managedRoster, state.league.roster),
  };
}

function deriveAnalytics(state: AppState, draft: DraftState): AnalyticsState {
  const { standings, totals } = computeStandings(
    draft.rosters,
    state.league.scoring,
    draft.unresolvedByFranchise,
  );

  const managedId = state.league.managedFranchiseId;
  const managedRow = standings.rows.find((row) => row.franchiseId === managedId);

  const recommendation = recommend({
    available: draft.available,
    managedRoster: draft.managedRoster,
    rosterConfig: state.league.roster,
    scoring: state.league.scoring,
    managedTotals: totals[managedId],
    categoryRanks: managedRow?.categoryRanks ?? {},
    teamCount: state.league.franchises.length,
    picksUntilTurn: draft.managedTurn.picksUntil,
    nextPickOverall: draft.managedTurn.nextOverall,
    remainingPicks: draft.managedTurn.remainingPicks.length,
  });

  return { totals, standings, recommendation };
}

/** Franchise lookup that never returns undefined, for render paths. */
export function franchiseName(state: AppState, franchiseId: string): string {
  return (
    state.league.franchises.find((franchise) => franchise.id === franchiseId)?.name ?? "Unknown"
  );
}
