/**
 * Domain vocabulary for the Fantasy Hockey Draft Assistant.
 *
 * Two rules run through every type here:
 *
 *  1. A missing projection is `undefined`, never `0`. Unknown and zero are
 *     different facts about a player, and conflating them silently corrupts
 *     every total, rank and recommendation downstream.
 *  2. Positions are a *set*. A player eligible at LW and RW can fill either
 *     slot, and the roster logic must decide which — counting by primary
 *     position gives the wrong answer.
 */

export type Position = "C" | "LW" | "RW" | "D" | "G";

export const POSITIONS: Position[] = ["C", "LW", "RW", "D", "G"];

/** Every stat the app understands. Skaters use the first nine, goalies the rest. */
export type CategoryKey =
  | "G"
  | "A"
  | "PPP"
  | "SOG"
  | "HIT"
  | "BLK"
  | "PIM"
  | "FOW"
  | "PM"
  | "W"
  | "SV"
  | "SVPCT"
  | "GAA"
  | "SO";

export type CategoryDefinition = {
  key: CategoryKey;
  label: string;
  short: string;
  /** Compact name for dense tables, e.g. "Save % (SV%)". */
  tableLabel: string;
  group: "skater" | "goalie";
  /** True when a lower total is better (GAA). */
  lowerIsBetter?: boolean;
  /** Rate stats are averaged across a roster rather than summed. */
  rate?: boolean;
  precision?: number;
};

/** A projection line. An absent key means "not provided by this source". */
export type StatLine = Partial<Record<CategoryKey, number>>;

/* -------------------------------------------------------------------------
 * Players
 * ---------------------------------------------------------------------- */

export type PlayerEligibility = {
  /** The position a player is listed at first; used only for display. */
  primary: Position;
  /** Every slot the player may legally fill. Always includes `primary`. */
  positions: Position[];
};

export type Player = {
  id: string;
  name: string;
  /** Normalised name used to match the same player across sources. */
  matchKey: string;
  /** NHL club abbreviation, when a source provides one. */
  team?: string;
  eligibility: PlayerEligibility;
  /** Consensus overall rank under the active projection configuration. */
  rank?: number;
  /** Average draft position, when a source provides one. */
  adp?: number;
  gamesPlayed?: number;
  /**
   * At least one source marked this player as kept. Used only to suggest
   * candidates on the Keeper Assignments screen — it carries no franchise, so
   * it never makes a player unavailable on its own.
   */
  keeperFlag?: boolean;
  stats: StatLine;
  /** Which sources contributed to each stat, for coverage reporting. */
  coverage: Partial<Record<CategoryKey, string[]>>;
};

/* -------------------------------------------------------------------------
 * League configuration
 * ---------------------------------------------------------------------- */

export type RosterSlot = "C" | "LW" | "RW" | "D" | "G" | "UTIL" | "BN";

export const ROSTER_SLOT_ORDER: RosterSlot[] = ["C", "LW", "RW", "D", "G", "UTIL", "BN"];

export type RosterConfiguration = Record<RosterSlot, number>;

export type ScoringFormat = "categories" | "points";

export type LeagueScoringSettings = {
  format: ScoringFormat;
  /** Categories that count in `categories` mode. */
  activeCategories: CategoryKey[];
  /** Point value per unit of a stat in `points` mode. */
  pointValues: Partial<Record<CategoryKey, number>>;
  /** Stats that score in `points` mode. */
  pointCategories: CategoryKey[];
};

export type Franchise = {
  id: string;
  name: string;
};

/**
 * A player already owned by a franchise before the draft opens.
 *
 * Ownership is only ever what the user confirmed. A projection file may mark a
 * player as a keeper, but it does not know *whose* keeper he is — a flag alone
 * can never put a player on a roster, so this is written by hand and nothing
 * infers it from an import.
 */
export type KeeperAssignment = {
  playerId: string;
  franchiseId: string;
};

export type League = {
  id: string;
  name: string;
  teamCount: 10 | 12;
  franchises: Franchise[];
  /** The one franchise this app is managing. */
  managedFranchiseId: string;
  roster: RosterConfiguration;
  scoring: LeagueScoringSettings;
  draftType: "snake";
  leagueType: "redraft" | "keeper";
  /**
   * Opening roster state for a keeper league: owned before pick one, never in
   * the draft pool. Ignored while the league type is redraft.
   */
  keepers: KeeperAssignment[];
  rounds: number;
  /** Franchise ids in round-one order; later rounds snake from this. */
  draftOrder: string[];
};

/* -------------------------------------------------------------------------
 * Projections
 * ---------------------------------------------------------------------- */

export type ProjectionSource = {
  id: string;
  /** Analyst or publication the file came from. */
  analyst: string;
  projectionSet: string;
  season: string;
  fileName: string;
  sheetName?: string;
  importedAt: string;
  /** True for the bundled sample set, so the UI can label it honestly. */
  sample?: boolean;
  rowCount: number;
};

/** One player's row as normalised from a single source. */
export type ProjectionRow = {
  matchKey: string;
  name: string;
  team?: string;
  positions: Position[];
  rank?: number;
  adp?: number;
  gamesPlayed?: number;
  /**
   * The source marked this player as kept. A hint for the Keeper Assignments
   * screen only — it says nothing about *which* franchise keeps him, so it can
   * never put him on a roster by itself.
   */
  keeperFlag?: boolean;
  stats: StatLine;
};

export type ProjectionDataset = {
  source: ProjectionSource;
  rows: ProjectionRow[];
};

export type ProjectionMode = "single" | "consensus" | "primary-supplemental";

export type ProjectionConfiguration = {
  mode: ProjectionMode;
  /** Source ids included in the active pool. */
  includedSourceIds: string[];
  /** The primary source for `single` and `primary-supplemental`. */
  primarySourceId?: string;
};

/* -------------------------------------------------------------------------
 * Draft
 * ---------------------------------------------------------------------- */

export type ScheduledPick = {
  overall: number;
  round: number;
  /** 1-based position within the round. */
  slotInRound: number;
  franchiseId: string;
};

export type DraftPickSchedule = {
  picks: ScheduledPick[];
  rounds: number;
  teamCount: number;
};

/**
 * What a recorded pick points at. An `unresolved` selection keeps the draft
 * moving when a name can't be matched to a known player yet.
 */
export type PickSelection =
  | { kind: "player"; playerId: string }
  | { kind: "unresolved"; label: string };

export type DraftPick = {
  overall: number;
  round: number;
  slotInRound: number;
  /** Which franchise ended up with the player — editable via corrections. */
  franchiseId: string;
  selection: PickSelection;
  /** ISO timestamp of when the pick was entered, not when it happened. */
  recordedAt: string;
  /** Set once a pick has been edited after its original entry. */
  corrected?: boolean;
};

export type DraftStatus = "not-started" | "in-progress" | "complete";

export type Draft = {
  id: string;
  status: DraftStatus;
  schedule: DraftPickSchedule;
  /** Recorded picks keyed by overall pick number; sparse until filled. */
  picks: Record<number, DraftPick>;
  /** Overall pick numbers in the order they were entered. */
  entryOrder: number[];
  completedAt?: string;
};

/* -------------------------------------------------------------------------
 * Derived analysis
 * ---------------------------------------------------------------------- */

/**
 * A category total plus how much of the roster it actually covers. A total
 * of 120 goals from 8 of 12 players is a different claim than 120 from all
 * 12, and the UI says so rather than pretending.
 */
export type CategoryTotal = {
  key: CategoryKey;
  value: number;
  /** Players who contributed a known value. */
  contributors: number;
  /** Rostered players eligible for this stat with no known value. */
  missing: number;
};

export type ProjectedTeamTotals = {
  franchiseId: string;
  totals: Partial<Record<CategoryKey, CategoryTotal>>;
  /** Total projected fantasy points, in `points` scoring. */
  fantasyPoints?: number;
  /** Roster players with no projection at all under the active config. */
  unprojectedPlayers: number;
  /** Picks recorded for this franchise that are still unresolved. */
  unresolvedPicks: number;
};

export type StandingRow = {
  franchiseId: string;
  rank: number;
  /** Rotisserie points in category mode; projected fantasy points otherwise. */
  points: number;
  /** Category rank per scored category, 1 = best. */
  categoryRanks: Partial<Record<CategoryKey, number>>;
  wins: number;
  losses: number;
  ties: number;
  /** True when any input to this row was missing or unresolved. */
  incomplete: boolean;
};

export type ProjectedStandings = {
  rows: StandingRow[];
  /** Scoring mode the standings were computed under. */
  format: ScoringFormat;
};
