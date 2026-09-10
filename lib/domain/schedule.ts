import type { Draft, DraftPickSchedule, KeeperAssignment, ScheduledPick } from "./types";

/**
 * The frozen draft pick schedule.
 *
 * Round one runs in the configured order; every even round reverses it. The
 * schedule is generated once from League Setup and then treated as fact —
 * the pointer, "picks until your turn", and every correction are read off
 * it rather than recomputed ad hoc.
 */

export function orderForRound(round: number, order: string[]): string[] {
  return round % 2 === 1 ? order : [...order].reverse();
}

export function buildSchedule(order: string[], rounds: number): DraftPickSchedule {
  const teamCount = order.length;
  const picks: ScheduledPick[] = [];

  for (let round = 1; round <= rounds; round += 1) {
    const roundOrder = orderForRound(round, order);
    for (let slotInRound = 1; slotInRound <= teamCount; slotInRound += 1) {
      picks.push({
        overall: (round - 1) * teamCount + slotInRound,
        round,
        slotInRound,
        franchiseId: roundOrder[slotInRound - 1],
      });
    }
  }

  return { picks, rounds, teamCount };
}

export function scheduledPick(
  schedule: DraftPickSchedule,
  overall: number,
): ScheduledPick | undefined {
  return schedule.picks[overall - 1];
}

/**
 * Which scheduled cells a league's keepers occupy.
 *
 * A keeper is nobody's live selection, but it does spend one of that
 * franchise's rounds — so it is placed on the franchise's own picks in round
 * order: first keeper on its Round 1 cell, second on its Round 2 cell, and so
 * on. The cell keeps its overall number and its seat in the frozen schedule
 * and is simply already complete, so nothing collapses or renumbers and the
 * snake still turns on the real round number.
 *
 * Returns overall number → the kept player's id. A franchise with more
 * keepers than rounds has extras with no cell to sit in; they still hold
 * roster capacity, and `unplacedKeepers` reports them rather than silently
 * dropping them.
 */
export function keeperCells(
  schedule: DraftPickSchedule,
  keepers: KeeperAssignment[],
): { byOverall: Map<number, string>; unplacedKeepers: KeeperAssignment[] } {
  const byFranchise = new Map<string, KeeperAssignment[]>();
  for (const keeper of keepers) {
    const list = byFranchise.get(keeper.franchiseId);
    if (list) list.push(keeper);
    else byFranchise.set(keeper.franchiseId, [keeper]);
  }

  const byOverall = new Map<number, string>();
  const unplacedKeepers: KeeperAssignment[] = [];

  for (const [franchiseId, owned] of byFranchise) {
    // Ascending overall is round order for a given franchise, snake included.
    const cells = schedule.picks.filter((pick) => pick.franchiseId === franchiseId);
    owned.forEach((keeper, index) => {
      const cell = cells[index];
      if (cell) byOverall.set(cell.overall, keeper.playerId);
      else unplacedKeepers.push(keeper);
    });
  }

  return { byOverall, unplacedKeepers };
}

/**
 * Anything that can answer "is this cell already taken" — a Set of overall
 * numbers, or the keeper map itself. The schedule never needs more than that.
 */
export type OccupiedCells = { has(overall: number): boolean };

export type DraftPointer = {
  /** Overall number of the next pick with no recording against it. */
  currentOverall: number;
  round: number;
  slotInRound: number;
  /** Franchise the schedule says is selecting now. */
  franchiseId?: string;
  /** Every scheduled cell is complete — recorded or held by a keeper. */
  complete: boolean;
  totalPicks: number;
  recordedPicks: number;
  /** Cells already complete because a keeper sits in them. */
  keeperPicks: number;
  /** Recorded plus keeper cells: how much of the board is settled. */
  completedPicks: number;
};

/**
 * The pointer is derived, never stored: it is the first scheduled cell with
 * nothing in it. That keeps it correct after an undo, an out-of-order entry,
 * or a correction to a pick in the middle of the board.
 *
 * A keeper cell counts as complete, so the pointer steps straight over it —
 * without the cell leaving the schedule or anything after it renumbering.
 */
export function derivePointer(
  draft: Draft,
  keeperOveralls: OccupiedCells = new Set<number>(),
): DraftPointer {
  const total = draft.schedule.picks.length;
  const recorded = Object.keys(draft.picks).length;
  const keeperPicks = draft.schedule.picks.filter((pick) =>
    keeperOveralls.has(pick.overall),
  ).length;

  const counts = {
    totalPicks: total,
    recordedPicks: recorded,
    keeperPicks,
    completedPicks: recorded + keeperPicks,
  };

  for (const scheduled of draft.schedule.picks) {
    if (draft.picks[scheduled.overall] || keeperOveralls.has(scheduled.overall)) continue;
    return {
      currentOverall: scheduled.overall,
      round: scheduled.round,
      slotInRound: scheduled.slotInRound,
      franchiseId: scheduled.franchiseId,
      complete: false,
      ...counts,
    };
  }

  const last = draft.schedule.picks[total - 1];
  return {
    currentOverall: total + 1,
    round: last?.round ?? 0,
    slotInRound: last?.slotInRound ?? 0,
    complete: true,
    ...counts,
  };
}

export type FranchiseTurn = {
  /** Overall number of this franchise's next unrecorded pick. */
  nextOverall?: number;
  /** Scheduled picks between now and then. 0 means they are on the clock. */
  picksUntil?: number;
  /** Every remaining unrecorded pick belonging to this franchise. */
  remainingPicks: number[];
};

export function franchiseTurn(
  draft: Draft,
  franchiseId: string,
  keeperOveralls: OccupiedCells = new Set<number>(),
): FranchiseTurn {
  // A cell held by a keeper is not a selection anyone still makes, so it is
  // neither one of this franchise's remaining picks nor a pick to wait through.
  const settled = (overall: number) =>
    Boolean(draft.picks[overall]) || keeperOveralls.has(overall);

  const pointer = derivePointer(draft, keeperOveralls);
  const remaining = draft.schedule.picks
    .filter(
      (scheduled) =>
        scheduled.franchiseId === franchiseId &&
        !settled(scheduled.overall) &&
        scheduled.overall >= pointer.currentOverall,
    )
    .map((scheduled) => scheduled.overall);

  if (remaining.length === 0) return { remainingPicks: [] };

  const nextOverall = remaining[0];
  // Count only cells that are still live between here and their turn.
  const picksUntil = draft.schedule.picks.filter(
    (scheduled) =>
      scheduled.overall >= pointer.currentOverall &&
      scheduled.overall < nextOverall &&
      !settled(scheduled.overall),
  ).length;

  return { nextOverall, picksUntil, remainingPicks: remaining };
}

/**
 * How close the managed team is to selecting. Drives the Draft Room's
 * anticipation behaviour without changing its layout.
 */
export type DraftPhase = "on-clock" | "imminent" | "approaching" | "between" | "done";

export function draftPhase(picksUntil: number | undefined): DraftPhase {
  if (picksUntil === undefined) return "done";
  if (picksUntil === 0) return "on-clock";
  if (picksUntil <= 2) return "imminent";
  if (picksUntil <= 5) return "approaching";
  return "between";
}

/** Roster Finishing Mode starts when three live selections remain. */
export function isRosterFinishing(remainingPicks: number[]): boolean {
  return remainingPicks.length > 0 && remainingPicks.length <= 3;
}
