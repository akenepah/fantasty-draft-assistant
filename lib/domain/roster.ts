import {
  POSITIONS,
  ROSTER_SLOT_ORDER,
  type Player,
  type Position,
  type RosterConfiguration,
  type RosterSlot,
} from "./types";

/**
 * Roster occupancy under multi-position eligibility.
 *
 * Counting players by primary position gives the wrong answer as soon as
 * anyone is dual-eligible: a team with three LW/RW wingers and three open
 * RW slots is not "short at RW". So slot occupancy is solved as a maximum
 * bipartite matching between players and individual starting slots, then
 * whatever is left over falls to the bench.
 */

/** Slots tied to one position. Filled before the flex slot, always. */
const DEDICATED_SLOTS: RosterSlot[] = ["C", "LW", "RW", "D", "G"];
const FLEX_SLOTS: RosterSlot[] = ["UTIL"];

/** Whether a player is legally allowed to occupy a given slot. */
export function slotAccepts(slot: RosterSlot, positions: Position[]): boolean {
  if (slot === "BN") return true;
  // Utility takes any skater; a goalie-only player cannot fill it.
  if (slot === "UTIL") return positions.some((position) => position !== "G");
  return positions.includes(slot);
}

/** One concrete slot opening, e.g. the second of three C slots. */
type SlotInstance = { slot: RosterSlot; index: number };

function instancesFor(config: RosterConfiguration, slots: RosterSlot[]): SlotInstance[] {
  const instances: SlotInstance[] = [];
  for (const slot of slots) {
    for (let index = 0; index < (config[slot] ?? 0); index += 1) {
      instances.push({ slot, index });
    }
  }
  return instances;
}

/** Kuhn's algorithm over a given set of candidate players and slots. */
function maximumMatching(
  playerPositions: Position[][],
  candidates: number[],
  instances: SlotInstance[],
): Map<number, number> {
  const slotToPlayer = new Map<number, number>();

  const augment = (player: number, visited: Set<number>): boolean => {
    for (let slot = 0; slot < instances.length; slot += 1) {
      if (visited.has(slot)) continue;
      if (!slotAccepts(instances[slot].slot, playerPositions[player])) continue;
      visited.add(slot);
      const occupant = slotToPlayer.get(slot);
      if (occupant === undefined || augment(occupant, visited)) {
        slotToPlayer.set(slot, player);
        return true;
      }
    }
    return false;
  };

  for (const player of candidates) {
    augment(player, new Set<number>());
  }

  return slotToPlayer;
}

/**
 * Starting-lineup assignment, in two phases.
 *
 * Dedicated slots are matched first, and only players who could not win one
 * compete for Utility. Both orders place the same *number* of players, so
 * cardinality alone cannot choose between them — but spending the flex slot
 * on a single-position player while a dedicated slot sits empty is strictly
 * worse for every pick that follows, so the phases decide it.
 */
function assignStarters(
  playerPositions: Position[][],
  config: RosterConfiguration,
): Map<number, RosterSlot> {
  const everyone = playerPositions.map((_, index) => index);

  const dedicated = instancesFor(config, DEDICATED_SLOTS);
  const dedicatedMatch = maximumMatching(playerPositions, everyone, dedicated);

  const placed = new Map<number, RosterSlot>();
  for (const [slot, player] of dedicatedMatch) placed.set(player, dedicated[slot].slot);

  const leftover = everyone.filter((player) => !placed.has(player));
  const flex = instancesFor(config, FLEX_SLOTS);
  const flexMatch = maximumMatching(playerPositions, leftover, flex);
  for (const [slot, player] of flexMatch) placed.set(player, flex[slot].slot);

  return placed;
}

export type SlottedPlayer = {
  slot: RosterSlot;
  player: Player;
  /** True when the roster has no legal opening left for this player. */
  overflow?: boolean;
};

/**
 * Assign every rostered player to a slot: starters by maximum matching,
 * then bench in draft order, then flagged as overflow if the roster is
 * genuinely over capacity.
 */
export function assignSlots(players: Player[], config: RosterConfiguration): SlottedPlayer[] {
  const positions = players.map((player) => player.eligibility.positions);
  const assignment = assignStarters(positions, config);

  let benchLeft = config.BN ?? 0;
  const result: SlottedPlayer[] = players.map((player, index) => {
    const starter = assignment.get(index);
    if (starter) return { slot: starter, player };
    if (benchLeft > 0) {
      benchLeft -= 1;
      return { slot: "BN" as RosterSlot, player };
    }
    return { slot: "BN" as RosterSlot, player, overflow: true };
  });

  return result.sort(
    (a, b) => ROSTER_SLOT_ORDER.indexOf(a.slot) - ROSTER_SLOT_ORDER.indexOf(b.slot),
  );
}

export type SlotCapacity = {
  slot: RosterSlot;
  filled: number;
  capacity: number;
  /** No room left in this slot. */
  full: boolean;
  /** One opening left, and at least one player already in it. */
  nearlyFull: boolean;
};

export function rosterCapacity(
  players: Player[],
  config: RosterConfiguration,
): SlotCapacity[] {
  const assigned = assignSlots(players, config);
  return ROSTER_SLOT_ORDER.map((slot) => {
    const capacity = config[slot] ?? 0;
    const filled = assigned.filter((entry) => entry.slot === slot && !entry.overflow).length;
    return {
      slot,
      filled,
      capacity,
      full: capacity > 0 && filled >= capacity,
      nearlyFull: capacity > 0 && filled > 0 && capacity - filled === 1,
    };
  });
}

/** How many starting slots the current roster actually occupies. */
function startersFilled(players: Player[], config: RosterConfiguration): number {
  return assignStarters(
    players.map((player) => player.eligibility.positions),
    config,
  ).size;
}

export type RosterFit = {
  /** The roster has a legal opening for this player, bench included. */
  canRoster: boolean;
  /** Adding the player would fill a starting slot rather than a bench spot. */
  fillsStartingSlot: boolean;
  /** Bench spots left after the current roster is placed. */
  benchOpen: boolean;
};

/**
 * Whether a newly drafted player is usable — the question the Draft Room
 * needs answered before it recommends anyone.
 */
export function rosterFit(
  players: Player[],
  candidate: Player,
  config: RosterConfiguration,
): RosterFit {
  const before = startersFilled(players, config);
  const after = startersFilled([...players, candidate], config);
  const fillsStartingSlot = after > before;

  const benchUsed = Math.max(0, players.length - before);
  const benchOpen = benchUsed < (config.BN ?? 0);

  return { canRoster: fillsStartingSlot || benchOpen, fillsStartingSlot, benchOpen };
}

/**
 * How many more players of each position the starting lineup could still
 * absorb. This is the honest version of "open needs" under flex: adding a
 * winger may open nothing if Utility is already spoken for.
 */
export function openStartingNeeds(
  players: Player[],
  config: RosterConfiguration,
): Record<Position, number> {
  const needs = {} as Record<Position, number>;

  for (const position of POSITIONS) {
    const hypothetical: Player[] = [...players];
    let added = 0;
    // Add phantom players at this position until none of them fit a starter.
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const before = startersFilled(hypothetical, config);
      const phantom = phantomPlayer(position, attempt);
      hypothetical.push(phantom);
      if (startersFilled(hypothetical, config) > before) added += 1;
      else {
        hypothetical.pop();
        break;
      }
    }
    needs[position] = added;
  }

  return needs;
}

function phantomPlayer(position: Position, index: number): Player {
  return {
    id: `__phantom-${position}-${index}`,
    name: "",
    matchKey: "",
    eligibility: { primary: position, positions: [position] },
    stats: {},
    coverage: {},
  };
}
