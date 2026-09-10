import { buildSchedule, keeperCells } from "./schedule";
import { sampleDatasets } from "./sample";
import type {
  CategoryKey,
  Draft,
  DraftPick,
  Franchise,
  League,
  PickSelection,
  ProjectionConfiguration,
  ProjectionDataset,
  RosterSlot,
  ScoringFormat,
} from "./types";

/**
 * The single authoritative application state.
 *
 * Every screen reads from this object and writes to it through the reducer
 * below — no page keeps its own copy of the league, the draft or the
 * player pool. One recorded pick is one state transition, and rosters,
 * availability, standings and recommendations all fall out of it.
 *
 * The whole shape is JSON-serialisable so it can be persisted and resumed
 * verbatim.
 */

export const STATE_VERSION = 1;

export type AppState = {
  version: number;
  league: League;
  /** Every imported source, kept independent of one another. */
  sources: ProjectionDataset[];
  projectionConfig: ProjectionConfiguration;
  draft: Draft;
};

const DEFAULT_FRANCHISE_NAMES = [
  "Arctic Wolves",
  "The Breakaways",
  "Puck Luck Club",
  "Hat Trick Heroes",
  "Sin Bin Citizens",
  "Ice Cold Takes",
  "Slapshot Society",
  "Blue Line Bandits",
  "Net Front Presence",
  "Offside Legends",
  "Frozen Assets",
  "Zamboni Crew",
];

export const DEFAULT_ROSTER = {
  C: 3,
  LW: 3,
  RW: 3,
  D: 4,
  G: 2,
  UTIL: 1,
  BN: 4,
} satisfies League["roster"];

export function totalRosterSpots(roster: League["roster"]): number {
  return (Object.keys(roster) as RosterSlot[]).reduce((sum, slot) => sum + roster[slot], 0);
}

export const SEASONS = ["2026–27", "2025–26", "2024–25"];

function defaultFranchises(count: number): Franchise[] {
  return DEFAULT_FRANCHISE_NAMES.slice(0, count).map((name, index) => ({
    id: `f${index + 1}`,
    name,
  }));
}

export function createInitialState(): AppState {
  const franchises = defaultFranchises(12);
  const draftOrder = franchises.map((franchise) => franchise.id);
  const roster = { ...DEFAULT_ROSTER };
  // One round per roster spot, so a completed draft fills the roster exactly.
  const rounds = totalRosterSpots(roster);

  const league: League = {
    id: "league-1",
    name: "Benchwarmers League",
    teamCount: 12,
    franchises,
    managedFranchiseId: "f3",
    roster,
    scoring: {
      format: "categories",
      activeCategories: ["G", "A", "PPP", "HIT", "BLK", "PIM", "W", "SV", "SVPCT", "GAA"],
      pointCategories: ["G", "A", "PPP", "SOG", "HIT", "BLK", "PIM", "W", "SV", "SO"],
      pointValues: {
        G: 5,
        A: 3,
        PPP: 2,
        SOG: 0.2,
        HIT: 0.5,
        BLK: 0.5,
        PIM: 0.2,
        FOW: 0.1,
        PM: 0.5,
        W: 5,
        SV: 0.2,
        SO: 3,
      },
    },
    draftType: "snake",
    leagueType: "redraft",
    keepers: [],
    rounds,
    draftOrder,
  };

  const sources = sampleDatasets();

  return {
    version: STATE_VERSION,
    league,
    sources,
    projectionConfig: {
      mode: "consensus",
      includedSourceIds: sources.map((dataset) => dataset.source.id),
      primarySourceId: sources[0]?.source.id,
    },
    draft: {
      id: "draft-1",
      status: "not-started",
      schedule: buildSchedule(draftOrder, rounds),
      picks: {},
      entryOrder: [],
    },
  };
}

/* -------------------------------------------------------------------------
 * Actions
 * ---------------------------------------------------------------------- */

export type Action =
  // League
  | { type: "league/rename"; name: string }
  | { type: "league/setTeamCount"; teamCount: 10 | 12 }
  | { type: "league/renameFranchise"; franchiseId: string; name: string }
  | { type: "league/setManagedFranchise"; franchiseId: string }
  | { type: "league/setRosterSlot"; slot: RosterSlot; value: number }
  | { type: "league/setScoringFormat"; format: ScoringFormat }
  | { type: "league/toggleCategory"; key: CategoryKey; enabled: boolean }
  | { type: "league/setPointValue"; key: CategoryKey; value: number }
  | { type: "league/setLeagueType"; leagueType: "redraft" | "keeper" }
  | { type: "league/assignKeeper"; playerId: string; franchiseId: string }
  | { type: "league/removeKeeper"; playerId: string }
  | { type: "league/clearKeepers" }
  | { type: "league/setRounds"; rounds: number }
  | { type: "league/setDraftOrder"; order: string[] }
  | { type: "league/reset" }
  // Projections
  | { type: "sources/add"; dataset: ProjectionDataset }
  | { type: "sources/remove"; sourceId: string }
  | { type: "sources/setConfig"; config: ProjectionConfiguration }
  // Draft
  | { type: "draft/record"; overall: number; franchiseId: string; selection: PickSelection }
  | { type: "draft/undoLast" }
  | { type: "draft/removePick"; overall: number }
  | {
      type: "draft/correct";
      overall: number;
      franchiseId?: string;
      selection?: PickSelection;
    }
  | { type: "draft/reset" }
  | { type: "draft/finalize" }
  | { type: "state/replace"; state: AppState };

/* -------------------------------------------------------------------------
 * Reducer
 * ---------------------------------------------------------------------- */

/**
 * Apply a keeper change and clear any recorded pick it collides with.
 *
 * Keepers are meant to be set before pick one, but nothing stops a user from
 * adding one mid-draft. When that claims a cell a pick already sits in, the
 * pick loses — the same rule `withSchedule` uses for picks that no longer fit
 * the board, and far better than leaving two things in one cell.
 */
function withKeepers(state: AppState, league: League): AppState {
  if (league.leagueType !== "keeper") return { ...state, league };

  const { byOverall } = keeperCells(state.draft.schedule, league.keepers);
  const picks: Record<number, DraftPick> = {};
  for (const [key, pick] of Object.entries(state.draft.picks)) {
    const overall = Number(key);
    if (byOverall.has(overall)) continue;
    picks[overall] = pick;
  }

  if (Object.keys(picks).length === Object.keys(state.draft.picks).length) {
    return { ...state, league };
  }

  return {
    ...state,
    league,
    draft: {
      ...state.draft,
      picks,
      entryOrder: state.draft.entryOrder.filter((overall) => picks[overall] !== undefined),
    },
  };
}

/** True when a keeper already holds this cell, so nothing may be written to it. */
function lockedByKeeper(state: AppState, overall: number): boolean {
  if (state.league.leagueType !== "keeper") return false;
  return keeperCells(state.draft.schedule, state.league.keepers).byOverall.has(overall);
}

/** Rebuild the frozen schedule and drop anything it can no longer hold. */
function withSchedule(state: AppState, league: League): AppState {
  const schedule = buildSchedule(league.draftOrder, league.rounds);
  const valid = new Set(league.franchises.map((franchise) => franchise.id));

  // A keeper assigned to a franchise that no longer exists would otherwise
  // hold a roster spot nobody can see or clear.
  const keepers = league.keepers.filter((keeper) => valid.has(keeper.franchiseId));
  if (keepers.length !== league.keepers.length) league = { ...league, keepers };

  // Changing rounds or order moves the keeper cells, so re-apply the same
  // rule: a pick sharing a cell with a keeper loses it.
  const keeperOveralls =
    league.leagueType === "keeper" ? keeperCells(schedule, keepers).byOverall : new Map();

  const picks: Record<number, DraftPick> = {};
  for (const [key, pick] of Object.entries(state.draft.picks)) {
    const overall = Number(key);
    if (overall > schedule.picks.length) continue;
    if (!valid.has(pick.franchiseId)) continue;
    if (keeperOveralls.has(overall)) continue;
    picks[overall] = pick;
  }

  return {
    ...state,
    league,
    draft: {
      ...state.draft,
      schedule,
      picks,
      entryOrder: state.draft.entryOrder.filter((overall) => picks[overall] !== undefined),
      status: Object.keys(picks).length === 0 ? "not-started" : state.draft.status,
    },
  };
}

function recordedStatus(draft: Draft): Draft["status"] {
  const recorded = Object.keys(draft.picks).length;
  if (recorded === 0) return "not-started";
  if (recorded >= draft.schedule.picks.length) return "complete";
  return "in-progress";
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "state/replace":
      return action.state;

    case "league/rename":
      return { ...state, league: { ...state.league, name: action.name } };

    case "league/setTeamCount": {
      const franchises = defaultFranchises(action.teamCount).map((franchise, index) => ({
        ...franchise,
        // Keep any name the user already typed for this slot.
        name: state.league.franchises[index]?.name ?? franchise.name,
      }));
      const ids = new Set(franchises.map((franchise) => franchise.id));
      const draftOrder = state.league.draftOrder.filter((id) => ids.has(id));
      for (const franchise of franchises) {
        if (!draftOrder.includes(franchise.id)) draftOrder.push(franchise.id);
      }
      const managedFranchiseId = ids.has(state.league.managedFranchiseId)
        ? state.league.managedFranchiseId
        : franchises[0].id;

      return withSchedule(state, {
        ...state.league,
        teamCount: action.teamCount,
        franchises,
        draftOrder,
        managedFranchiseId,
      });
    }

    case "league/renameFranchise":
      return {
        ...state,
        league: {
          ...state.league,
          franchises: state.league.franchises.map((franchise) =>
            franchise.id === action.franchiseId ? { ...franchise, name: action.name } : franchise,
          ),
        },
      };

    case "league/setManagedFranchise":
      return { ...state, league: { ...state.league, managedFranchiseId: action.franchiseId } };

    case "league/setRosterSlot":
      return withSchedule(state, {
        ...state.league,
        roster: { ...state.league.roster, [action.slot]: Math.max(0, action.value) },
      });

    case "league/setScoringFormat":
      return {
        ...state,
        league: {
          ...state.league,
          scoring: { ...state.league.scoring, format: action.format },
        },
      };

    case "league/toggleCategory": {
      const scoring = state.league.scoring;
      const field = scoring.format === "points" ? "pointCategories" : "activeCategories";
      const current = scoring[field];
      const next = action.enabled
        ? [...new Set([...current, action.key])]
        : current.filter((key) => key !== action.key);
      return {
        ...state,
        league: { ...state.league, scoring: { ...scoring, [field]: next } },
      };
    }

    case "league/setPointValue":
      return {
        ...state,
        league: {
          ...state.league,
          scoring: {
            ...state.league.scoring,
            pointValues: { ...state.league.scoring.pointValues, [action.key]: action.value },
          },
        },
      };

    case "league/setLeagueType":
      // Switching back to redraft keeps the assignments rather than deleting
      // them: selectors ignore keepers outside a keeper league, so flipping
      // the type twice by accident does not destroy the work of entering them.
      return withKeepers(state, { ...state.league, leagueType: action.leagueType });

    case "league/assignKeeper": {
      if (!state.league.franchises.some((f) => f.id === action.franchiseId)) return state;
      // A player is kept by exactly one franchise; re-assigning moves him.
      const keepers = state.league.keepers.filter(
        (keeper) => keeper.playerId !== action.playerId,
      );
      keepers.push({ playerId: action.playerId, franchiseId: action.franchiseId });
      return withKeepers(state, { ...state.league, keepers });
    }

    case "league/removeKeeper":
      // Freeing a cell can never collide with a pick, so no reconciliation.
      return {
        ...state,
        league: {
          ...state.league,
          keepers: state.league.keepers.filter((keeper) => keeper.playerId !== action.playerId),
        },
      };

    case "league/clearKeepers":
      return { ...state, league: { ...state.league, keepers: [] } };

    case "league/setRounds":
      return withSchedule(state, {
        ...state.league,
        rounds: Math.max(1, Math.min(40, action.rounds)),
      });

    case "league/setDraftOrder":
      return withSchedule(state, { ...state.league, draftOrder: action.order });

    case "league/reset": {
      const fresh = createInitialState();
      return { ...fresh, sources: state.sources, projectionConfig: state.projectionConfig };
    }

    case "sources/add": {
      const sources = [
        ...state.sources.filter((dataset) => dataset.source.id !== action.dataset.source.id),
        action.dataset,
      ];
      return {
        ...state,
        sources,
        projectionConfig: {
          ...state.projectionConfig,
          includedSourceIds: [
            ...new Set([...state.projectionConfig.includedSourceIds, action.dataset.source.id]),
          ],
          primarySourceId: state.projectionConfig.primarySourceId ?? action.dataset.source.id,
        },
      };
    }

    case "sources/remove": {
      const sources = state.sources.filter((dataset) => dataset.source.id !== action.sourceId);
      const includedSourceIds = state.projectionConfig.includedSourceIds.filter(
        (id) => id !== action.sourceId,
      );
      return {
        ...state,
        sources,
        projectionConfig: {
          ...state.projectionConfig,
          includedSourceIds,
          primarySourceId:
            state.projectionConfig.primarySourceId === action.sourceId
              ? includedSourceIds[0]
              : state.projectionConfig.primarySourceId,
        },
      };
    }

    case "sources/setConfig":
      return { ...state, projectionConfig: action.config };

    case "draft/record": {
      const scheduled = state.draft.schedule.picks[action.overall - 1];
      if (!scheduled || state.draft.picks[action.overall]) return state;
      // A keeper cell is already complete. The pointer never lands on one, but
      // a correction or an out-of-order entry could still aim at it.
      if (lockedByKeeper(state, action.overall)) return state;

      const pick: DraftPick = {
        overall: action.overall,
        round: scheduled.round,
        slotInRound: scheduled.slotInRound,
        franchiseId: action.franchiseId,
        selection: action.selection,
        recordedAt: new Date().toISOString(),
      };

      const draft: Draft = {
        ...state.draft,
        picks: { ...state.draft.picks, [action.overall]: pick },
        entryOrder: [...state.draft.entryOrder, action.overall],
      };
      return { ...state, draft: { ...draft, status: recordedStatus(draft) } };
    }

    case "draft/undoLast": {
      const last = state.draft.entryOrder[state.draft.entryOrder.length - 1];
      if (last === undefined) return state;
      return reducer(state, { type: "draft/removePick", overall: last });
    }

    case "draft/removePick": {
      if (!state.draft.picks[action.overall]) return state;
      const picks = { ...state.draft.picks };
      delete picks[action.overall];
      const draft: Draft = {
        ...state.draft,
        picks,
        entryOrder: state.draft.entryOrder.filter((overall) => overall !== action.overall),
        completedAt: undefined,
      };
      return { ...state, draft: { ...draft, status: recordedStatus(draft) } };
    }

    case "draft/correct": {
      const existing = state.draft.picks[action.overall];
      if (!existing) return state;
      const picks = {
        ...state.draft.picks,
        [action.overall]: {
          ...existing,
          franchiseId: action.franchiseId ?? existing.franchiseId,
          selection: action.selection ?? existing.selection,
          corrected: true,
        },
      };
      return { ...state, draft: { ...state.draft, picks } };
    }

    case "draft/reset":
      return {
        ...state,
        draft: {
          ...state.draft,
          status: "not-started",
          picks: {},
          entryOrder: [],
          completedAt: undefined,
          schedule: buildSchedule(state.league.draftOrder, state.league.rounds),
        },
      };

    case "draft/finalize":
      return {
        ...state,
        draft: {
          ...state.draft,
          status: "complete",
          completedAt: state.draft.completedAt ?? new Date().toISOString(),
        },
      };

    default:
      return state;
  }
}

/** Player ids already taken, so the pool can exclude them. */
export function draftedPlayerIds(draft: Draft): Set<string> {
  const ids = new Set<string>();
  for (const pick of Object.values(draft.picks)) {
    if (pick.selection.kind === "player") ids.add(pick.selection.playerId);
  }
  return ids;
}
