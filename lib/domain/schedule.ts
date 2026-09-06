import type { Draft, DraftPickSchedule, ScheduledPick } from "./types";

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

export type DraftPointer = {
  /** Overall number of the next pick with no recording against it. */
  currentOverall: number;
  round: number;
  slotInRound: number;
  /** Franchise the schedule says is selecting now. */
  franchiseId?: string;
  /** Every scheduled pick has been recorded. */
  complete: boolean;
  totalPicks: number;
  recordedPicks: number;
};

/**
 * The pointer is derived, never stored: it is the first scheduled pick with
 * nothing recorded against it. That keeps it correct after an undo, an
 * out-of-order entry, or a correction to a pick in the middle of the board.
 */
export function derivePointer(draft: Draft): DraftPointer {
  const total = draft.schedule.picks.length;
  const recorded = Object.keys(draft.picks).length;

  for (const scheduled of draft.schedule.picks) {
    if (!draft.picks[scheduled.overall]) {
      return {
        currentOverall: scheduled.overall,
        round: scheduled.round,
        slotInRound: scheduled.slotInRound,
        franchiseId: scheduled.franchiseId,
        complete: false,
        totalPicks: total,
        recordedPicks: recorded,
      };
    }
  }

  const last = draft.schedule.picks[total - 1];
  return {
    currentOverall: total + 1,
    round: last?.round ?? 0,
    slotInRound: last?.slotInRound ?? 0,
    complete: true,
    totalPicks: total,
    recordedPicks: recorded,
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

export function franchiseTurn(draft: Draft, franchiseId: string): FranchiseTurn {
  const pointer = derivePointer(draft);
  const remaining = draft.schedule.picks
    .filter(
      (scheduled) =>
        scheduled.franchiseId === franchiseId &&
        !draft.picks[scheduled.overall] &&
        scheduled.overall >= pointer.currentOverall,
    )
    .map((scheduled) => scheduled.overall);

  if (remaining.length === 0) return { remainingPicks: [] };

  const nextOverall = remaining[0];
  // Count only picks that are still open between here and their turn.
  const picksUntil = draft.schedule.picks.filter(
    (scheduled) =>
      scheduled.overall >= pointer.currentOverall &&
      scheduled.overall < nextOverall &&
      !draft.picks[scheduled.overall],
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
