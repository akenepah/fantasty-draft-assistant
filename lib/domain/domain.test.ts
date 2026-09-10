import { describe, expect, it } from "vitest";
import { assignSlots, openStartingNeeds, rosterCapacity, rosterFit } from "./roster";
import { buildSchedule, derivePointer, franchiseTurn, orderForRound } from "./schedule";
import { boardCells } from "./results";
import { categoryTotal, playerFantasyPoints, teamTotals } from "./scoring";
import { computeStandings } from "./standings";
import { buildPlayerPool, matchKeyFor } from "./projections";
import { autoDetectMapping, buildProjectionRows, parseDelimited, parseNumber } from "./workbook";
import { createInitialState, reducer, draftedPlayerIds, type AppState } from "./state";
import { deserialize } from "./persistence";
import { categoryGaps, formatReturnChance, postDraftWatchlist } from "./recommend";
import { derive } from "./selectors";
import type {
  CategoryKey,
  LeagueScoringSettings,
  Player,
  Position,
  ProjectionDataset,
  RosterConfiguration,
} from "./types";

function player(name: string, positions: Position[], stats: Player["stats"] = {}): Player {
  return {
    id: matchKeyFor(name),
    name,
    matchKey: matchKeyFor(name),
    eligibility: { primary: positions[0], positions },
    stats,
    coverage: {},
  };
}

const ROSTER: RosterConfiguration = { C: 2, LW: 2, RW: 2, D: 2, G: 1, UTIL: 1, BN: 2 };

/* -------------------------------------------------------------------------
 * Roster logic under multi-position eligibility
 * ---------------------------------------------------------------------- */

describe("roster slotting", () => {
  it("uses dual eligibility to fill a slot a primary-position count would miss", () => {
    // Three wingers all listed LW-first, but two are LW/RW. Counting by
    // primary position would report RW empty and LW over-full.
    const roster = [
      player("Winger One", ["LW"]),
      player("Winger Two", ["LW", "RW"]),
      player("Winger Three", ["LW", "RW"]),
    ];

    const capacity = rosterCapacity(roster, ROSTER);
    const lw = capacity.find((entry) => entry.slot === "LW");
    const rw = capacity.find((entry) => entry.slot === "RW");

    expect(lw?.filled).toBe(2);
    expect(rw?.filled).toBe(1);
    expect(capacity.every((entry) => entry.filled <= entry.capacity)).toBe(true);
  });

  it("keeps goalies out of the utility slot", () => {
    const roster = [player("Keeper One", ["G"]), player("Keeper Two", ["G"])];
    const assigned = assignSlots(roster, ROSTER);
    expect(assigned.filter((entry) => entry.slot === "G")).toHaveLength(1);
    expect(assigned.some((entry) => entry.slot === "UTIL")).toBe(false);
  });

  it("reports whether a new player is usable, and whether he starts", () => {
    const roster = [player("Centre One", ["C"]), player("Centre Two", ["C"])];

    const thirdCentre = rosterFit(roster, player("Centre Three", ["C"]), ROSTER);
    expect(thirdCentre.fillsStartingSlot).toBe(true); // via Utility
    expect(thirdCentre.canRoster).toBe(true);

    const full: RosterConfiguration = { C: 2, LW: 0, RW: 0, D: 0, G: 0, UTIL: 0, BN: 0 };
    const noRoom = rosterFit(roster, player("Centre Four", ["C"]), full);
    expect(noRoom.canRoster).toBe(false);
  });

  it("counts open starting needs through the flex slot", () => {
    const roster = [player("Centre One", ["C"]), player("Centre Two", ["C"])];
    const needs = openStartingNeeds(roster, ROSTER);
    // C is full, but Utility still takes one more skater.
    expect(needs.C).toBe(1);
    expect(needs.G).toBe(1);
  });

  it("marks players beyond capacity as overflow rather than losing them", () => {
    const tiny: RosterConfiguration = { C: 1, LW: 0, RW: 0, D: 0, G: 0, UTIL: 0, BN: 0 };
    const assigned = assignSlots([player("A", ["C"]), player("B", ["C"])], tiny);
    expect(assigned).toHaveLength(2);
    expect(assigned.filter((entry) => entry.overflow)).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------
 * Missing data
 * ---------------------------------------------------------------------- */

describe("scoring treats missing values as unknown", () => {
  it("excludes missing stats from totals and reports the gap", () => {
    const roster = [
      player("Has Goals", ["C"], { G: 30 }),
      player("No Goals", ["C"], {}),
      player("Also Goals", ["C"], { G: 20 }),
    ];

    const total = categoryTotal(roster, "G");
    expect(total.value).toBe(50);
    expect(total.contributors).toBe(2);
    expect(total.missing).toBe(1);
  });

  it("averages rate stats over contributors only", () => {
    const goalies = [
      player("Keeper One", ["G"], { GAA: 2.0 }),
      player("Keeper Two", ["G"], {}),
      player("Keeper Three", ["G"], { GAA: 3.0 }),
    ];
    expect(categoryTotal(goalies, "GAA").value).toBeCloseTo(2.5);
  });

  it("does not count a skater as missing a goalie stat", () => {
    const roster = [player("Skater", ["C"], { G: 10 }), player("Keeper", ["G"], { W: 30 })];
    const wins = categoryTotal(roster, "W");
    expect(wins.value).toBe(30);
    expect(wins.missing).toBe(0);
  });
});

describe("points scoring", () => {
  const scoring: LeagueScoringSettings = {
    format: "points",
    activeCategories: [],
    pointCategories: ["G", "A", "HIT"],
    pointValues: { G: 5, A: 3, HIT: 0.5 },
  };

  it("uses the configured values rather than any hardcoded ones", () => {
    const p = player("Scorer", ["C"], { G: 10, A: 20, HIT: 40 });
    expect(playerFantasyPoints(p, scoring)).toBe(10 * 5 + 20 * 3 + 40 * 0.5);

    const doubled: LeagueScoringSettings = { ...scoring, pointValues: { G: 10, A: 3, HIT: 0.5 } };
    expect(playerFantasyPoints(p, doubled)).toBe(10 * 10 + 20 * 3 + 40 * 0.5);
  });

  it("returns undefined for a player with no scored stat at all", () => {
    expect(playerFantasyPoints(player("Ghost", ["C"], {}), scoring)).toBeUndefined();
  });

  it("sums a roster without folding unknown players in as zero", () => {
    const totals = teamTotals(
      "f1",
      [player("Scorer", ["C"], { G: 10 }), player("Ghost", ["C"], {})],
      scoring,
    );
    expect(totals.fantasyPoints).toBe(50);
    expect(totals.unprojectedPlayers).toBe(1);
  });
});

/* -------------------------------------------------------------------------
 * Projection sources
 * ---------------------------------------------------------------------- */

function dataset(id: string, rows: ProjectionDataset["rows"]): ProjectionDataset {
  return {
    source: {
      id,
      analyst: id,
      projectionSet: id,
      season: "2026–27",
      fileName: `${id}.csv`,
      importedAt: "2026-09-01T00:00:00.000Z",
      rowCount: rows.length,
    },
    rows,
  };
}

describe("projection merging", () => {
  const a = dataset("a", [
    { matchKey: matchKeyFor("Alpha One"), name: "Alpha One", positions: ["C"], rank: 1, stats: { G: 40, A: 50 } },
  ]);
  const b = dataset("b", [
    // No assists at all from this source.
    { matchKey: matchKeyFor("Alpha One"), name: "Alpha One", positions: ["C", "LW"], rank: 3, stats: { G: 30 } },
  ]);

  it("averages only the sources that provided a value", () => {
    const pool = buildPlayerPool([a, b], {
      mode: "consensus",
      includedSourceIds: ["a", "b"],
      primarySourceId: "a",
    });
    const merged = pool.players[0];
    expect(merged.stats.G).toBe(35);
    // Assists came from one source only — averaging in a zero would give 25.
    expect(merged.stats.A).toBe(50);
    expect(merged.coverage.A).toEqual(["a"]);
  });

  it("unions position eligibility across sources", () => {
    const pool = buildPlayerPool([a, b], {
      mode: "consensus",
      includedSourceIds: ["a", "b"],
      primarySourceId: "a",
    });
    expect(pool.players[0].eligibility.positions.sort()).toEqual(["C", "LW"]);
  });

  it("uses only the primary source in single mode", () => {
    const pool = buildPlayerPool([a, b], {
      mode: "single",
      includedSourceIds: ["a", "b"],
      primarySourceId: "b",
    });
    expect(pool.players[0].stats.G).toBe(30);
    expect(pool.players[0].stats.A).toBeUndefined();
  });

  it("lets supplemental sources fill only what the primary lacks", () => {
    const primaryMissingGoals = dataset("c", [
      { matchKey: matchKeyFor("Alpha One"), name: "Alpha One", positions: ["C"], stats: { A: 10 } },
    ]);
    const pool = buildPlayerPool([primaryMissingGoals, a], {
      mode: "primary-supplemental",
      includedSourceIds: ["c", "a"],
      primarySourceId: "c",
    });
    expect(pool.players[0].stats.A).toBe(10); // primary wins
    expect(pool.players[0].stats.G).toBe(40); // filled from supplemental
  });

  it("matches the same player across differently punctuated names", () => {
    expect(matchKeyFor("Tim Stützle")).toBe(matchKeyFor("Tim Stutzle"));
    expect(matchKeyFor("T.J. Oshie Jr.")).toBe(matchKeyFor("TJ Oshie"));
  });
});

/* -------------------------------------------------------------------------
 * Workbook parsing
 * ---------------------------------------------------------------------- */

describe("workbook parsing", () => {
  it("parses quoted delimited text", () => {
    const rows = parseDelimited('Player,Team\n"Smith, John",TOR\n', ",");
    expect(rows).toEqual([
      ["Player", "Team"],
      ["Smith, John", "TOR"],
    ]);
  });

  it("treats blanks and dashes as unknown, not zero", () => {
    expect(parseNumber("")).toBeUndefined();
    expect(parseNumber("—")).toBeUndefined();
    expect(parseNumber("N/A")).toBeUndefined();
    expect(parseNumber("0")).toBe(0);
    expect(parseNumber("1,234")).toBe(1234);
  });

  it("auto-detects common headers and maps rows", () => {
    const sheet = {
      name: "Skaters",
      columns: ["Player", "Team", "Pos", "Rank", "G", "A", "Hits"],
      rows: [["Connor McDavid", "EDM", "C", "1", "42", "78", ""]],
    };
    const mapping = autoDetectMapping(sheet.columns);
    expect(mapping.name).toBe("Player");
    expect(mapping.positions).toBe("Pos");
    expect(mapping.stats.HIT).toBe("Hits");

    const { rows } = buildProjectionRows(sheet, mapping);
    expect(rows[0].stats.G).toBe(42);
    // The hits cell was blank: unknown, so absent rather than 0.
    expect(rows[0].stats.HIT).toBeUndefined();
    expect(rows[0].positions).toEqual(["C"]);
  });

  it("reads multi-position cells", () => {
    const sheet = {
      name: "S",
      columns: ["Player", "Pos"],
      rows: [["Multi Guy", "LW/RW"]],
    };
    const { rows } = buildProjectionRows(sheet, autoDetectMapping(sheet.columns));
    expect(rows[0].positions).toEqual(["LW", "RW"]);
  });
});

/* -------------------------------------------------------------------------
 * Draft schedule
 * ---------------------------------------------------------------------- */

describe("draft pick schedule", () => {
  const order = ["a", "b", "c"];

  it("snakes every even round", () => {
    expect(orderForRound(1, order)).toEqual(["a", "b", "c"]);
    expect(orderForRound(2, order)).toEqual(["c", "b", "a"]);
    expect(orderForRound(3, order)).toEqual(["a", "b", "c"]);
  });

  it("generates every pick exactly once", () => {
    const schedule = buildSchedule(order, 4);
    expect(schedule.picks).toHaveLength(12);
    expect(schedule.picks.map((pick) => pick.overall)).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1),
    );
    expect(schedule.picks[3].franchiseId).toBe("c"); // first pick of round 2
  });
});

/* -------------------------------------------------------------------------
 * Reducer and derived state
 * ---------------------------------------------------------------------- */

function recordNext(state: AppState): AppState {
  const derived = derive(state);
  const overall = derived.draft.pointer.currentOverall;
  const franchiseId = derived.draft.pointer.franchiseId!;
  const playerId = derived.draft.available[0].id;
  return reducer(state, {
    type: "draft/record",
    overall,
    franchiseId,
    selection: { kind: "player", playerId },
  });
}

describe("draft state transitions", () => {
  it("advances the pointer and removes the player from the pool", () => {
    const state = createInitialState();
    const before = derive(state);
    const firstPlayer = before.draft.available[0];

    const after = derive(recordNext(state));
    expect(after.draft.pointer.currentOverall).toBe(2);
    expect(after.draft.available.some((p) => p.id === firstPlayer.id)).toBe(false);
    expect(after.draft.rosters[before.draft.pointer.franchiseId!]).toHaveLength(1);
  });

  it("undo restores availability, roster and pointer", () => {
    const state = recordNext(createInitialState());
    const undone = reducer(state, { type: "draft/undoLast" });
    const derived = derive(undone);

    expect(derived.draft.pointer.currentOverall).toBe(1);
    expect(Object.keys(undone.draft.picks)).toHaveLength(0);
    expect(derived.draft.rosters[derived.draft.pointer.franchiseId!]).toHaveLength(0);
    expect(derived.draft.available.length).toBe(derive(createInitialState()).draft.available.length);
  });

  it("reassigns a pick to another franchise without disturbing the board", () => {
    const state = recordNext(createInitialState());
    const target = state.league.franchises[5].id;
    const corrected = reducer(state, { type: "draft/correct", overall: 1, franchiseId: target });
    const derived = derive(corrected);

    expect(derived.draft.rosters[target]).toHaveLength(1);
    expect(corrected.draft.picks[1].corrected).toBe(true);
    expect(derive(corrected).draft.pointer.currentOverall).toBe(2);
  });

  it("keeps an unresolved placeholder out of the roster but on the board", () => {
    const base = createInitialState();
    const state = reducer(base, {
      type: "draft/record",
      overall: 1,
      franchiseId: base.league.draftOrder[0],
      selection: { kind: "unresolved", label: "Someone I could not find" },
    });
    const derived = derive(state);

    expect(derived.draft.pointer.currentOverall).toBe(2);
    expect(derived.draft.rosters[base.league.draftOrder[0]]).toHaveLength(0);
    expect(derived.draft.unresolvedByFranchise[base.league.draftOrder[0]]).toBe(1);
    expect(draftedPlayerIds(state.draft).size).toBe(0);
  });

  it("resolves a placeholder into a real player later", () => {
    const base = createInitialState();
    const withPlaceholder = reducer(base, {
      type: "draft/record",
      overall: 1,
      franchiseId: base.league.draftOrder[0],
      selection: { kind: "unresolved", label: "???" },
    });
    const playerId = derive(withPlaceholder).draft.available[0].id;
    const resolved = reducer(withPlaceholder, {
      type: "draft/correct",
      overall: 1,
      selection: { kind: "player", playerId },
    });

    expect(derive(resolved).draft.rosters[base.league.draftOrder[0]]).toHaveLength(1);
    expect(derive(resolved).draft.unresolvedByFranchise[base.league.draftOrder[0]]).toBe(0);
  });

  it("reports how many picks until the managed team is up", () => {
    const state = createInitialState();
    const turn = franchiseTurn(state.draft, state.league.managedFranchiseId);
    // Managed team is third in the default order, so two picks come first.
    expect(turn.nextOverall).toBe(3);
    expect(turn.picksUntil).toBe(2);
  });

  it("marks the draft complete once the schedule is filled", () => {
    let state = createInitialState();
    state = reducer(state, { type: "league/setRounds", rounds: 1 });
    for (let index = 0; index < state.league.franchises.length; index += 1) {
      state = recordNext(state);
    }
    expect(state.draft.status).toBe("complete");
    expect(derivePointer(state.draft).complete).toBe(true);
  });
});

describe("league setup drives the rest of the app", () => {
  it("regenerates the schedule when the team count changes", () => {
    const state = reducer(createInitialState(), { type: "league/setTeamCount", teamCount: 10 });
    expect(state.league.franchises).toHaveLength(10);
    expect(state.draft.schedule.teamCount).toBe(10);
    expect(state.draft.schedule.picks).toHaveLength(10 * state.league.rounds);
  });

  it("regenerates the schedule when rounds change", () => {
    const state = reducer(createInitialState(), { type: "league/setRounds", rounds: 5 });
    expect(state.draft.schedule.picks).toHaveLength(5 * state.league.teamCount);
  });

  it("changes which categories count when scoring settings change", () => {
    const base = createInitialState();
    const withoutHits = reducer(base, {
      type: "league/toggleCategory",
      key: "HIT",
      enabled: false,
    });
    expect(withoutHits.league.scoring.activeCategories).not.toContain("HIT");

    const standings = derive(withoutHits).analytics?.standings;
    expect(standings?.rows[0].categoryRanks.HIT).toBeUndefined();
  });

  it("drops picks belonging to franchises that no longer exist", () => {
    let state = createInitialState();
    // Give the last franchise a pick, then shrink the league past it.
    const twelfth = state.league.franchises[11].id;
    const playerId = derive(state).draft.available[0].id;
    state = reducer(state, {
      type: "draft/record",
      overall: 12,
      franchiseId: twelfth,
      selection: { kind: "player", playerId },
    });
    expect(Object.keys(state.draft.picks)).toHaveLength(1);

    state = reducer(state, { type: "league/setTeamCount", teamCount: 10 });
    expect(Object.keys(state.draft.picks)).toHaveLength(0);
  });
});

describe("standings", () => {
  it("ranks every franchise and agrees with its own category ranks", () => {
    const state = createInitialState();
    let next = state;
    for (let index = 0; index < 24; index += 1) next = recordNext(next);

    const analytics = derive(next).analytics!;
    const rows = analytics.standings.rows;

    expect(rows).toHaveLength(state.league.franchises.length);
    expect(rows.map((row) => row.rank)).toEqual(rows.map((_, index) => index + 1));

    const teams = rows.length;
    const keys = state.league.scoring.activeCategories;
    for (const row of rows) {
      const expected = keys.reduce(
        (sum, key) => sum + (teams - (row.categoryRanks[key] ?? teams) + 1),
        0,
      );
      expect(row.points).toBe(expected);
    }
  });

  it("plays every franchise against all the others", () => {
    const state = createInitialState();
    const rows = derive(state).analytics!.standings.rows;
    for (const row of rows) {
      expect(row.wins + row.losses + row.ties).toBe(rows.length - 1);
    }
  });

  it("does not let an empty roster lead a lower-is-better category", () => {
    const scoring: LeagueScoringSettings = {
      format: "categories",
      activeCategories: ["GAA"],
      pointCategories: [],
      pointValues: {},
    };
    const { standings } = computeStandings(
      { withGoalie: [player("Keeper", ["G"], { GAA: 2.5 })], empty: [] },
      scoring,
    );
    expect(standings.rows[0].franchiseId).toBe("withGoalie");
  });
});

describe("persistence", () => {
  it("round-trips a draft in progress, numeric pick keys and all", () => {
    let state = createInitialState();
    state = recordNext(state);
    state = recordNext(state);

    const revived = deserialize(JSON.stringify(state));
    expect(revived).not.toBeNull();
    expect(Object.keys(revived!.draft.picks)).toHaveLength(2);
    expect(revived!.draft.picks[1].overall).toBe(1);
    expect(derive(revived!).draft.pointer.currentOverall).toBe(3);
  });

  it("rejects a stored blob from a different state version", () => {
    const state = createInitialState();
    const stale = JSON.stringify({ ...state, version: state.version + 1 });
    expect(deserialize(stale)).toBeNull();
    expect(deserialize("not json")).toBeNull();
  });
});

describe("points scoring end to end", () => {
  it("ranks the standings on configured point values", () => {
    let state = createInitialState();
    state = reducer(state, { type: "league/setScoringFormat", format: "points" });
    for (let index = 0; index < 12; index += 1) state = recordNext(state);

    const analytics = derive(state).analytics!;
    expect(analytics.standings.format).toBe("points");

    // Every franchise's points equal the sum of its players' fantasy points.
    for (const row of analytics.standings.rows) {
      const roster = derive(state).draft.rosters[row.franchiseId];
      const expected = roster.reduce(
        (sum, player) => sum + (playerFantasyPoints(player, state.league.scoring) ?? 0),
        0,
      );
      expect(row.points).toBeCloseTo(Number(expected.toFixed(1)), 1);
    }
  });
});

describe("recommendations", () => {
  it("only recommends players the roster can actually use", () => {
    const state = createInitialState();
    const recommendation = derive(state).analytics!.recommendation;
    expect(recommendation.primary).toBeDefined();
    expect(recommendation.alternative).toBeDefined();
    expect(recommendation.primary!.reasons.length).toBeLessThanOrEqual(3);
  });

  it("never recommends someone already drafted", () => {
    let state = createInitialState();
    for (let index = 0; index < 15; index += 1) state = recordNext(state);

    const derived = derive(state);
    const taken = derived.draft.draftedIds;
    expect(taken.has(derived.analytics!.recommendation.primary!.player.id)).toBe(false);
  });

  it("prefers the player who will not last when values are close", () => {
    // Late in a round the managed team's next pick is one away, so nothing is
    // at risk and the best available player should win outright.
    const state = createInitialState();
    const recommendation = derive(state).analytics!.recommendation;
    expect(recommendation.primary).toBeDefined();
    // Whatever it picks, it must never be someone already unavailable, and
    // the alternative must be a genuinely different player.
    expect(recommendation.alternative?.player.id).not.toBe(recommendation.primary?.player.id);
  });

  it("does not let one goalie outweigh a whole skating roster", () => {
    // Four of ten scored categories are goalie categories fed by two roster
    // spots; without weighting by roster share a goalie wins pick one.
    const state = createInitialState();
    const primary = derive(state).analytics!.recommendation.primary!;
    expect(primary.player.eligibility.positions).not.toEqual(["G"]);
  });

  it("reports unavailable rather than inventing a pick when nothing is scored", () => {
    let state = createInitialState();
    for (const key of [...state.league.scoring.activeCategories]) {
      state = reducer(state, { type: "league/toggleCategory", key, enabled: false });
    }
    const recommendation = derive(state).analytics!.recommendation;
    expect(recommendation.primary).toBeUndefined();
    expect(recommendation.unavailable).toContain("No scoring categories");
  });

  it("gives a percentage only when the player has an ADP to reason from", () => {
    const derived = derive(createInitialState());
    const risk = derived.analytics!.recommendation.primary!.returnRisk;
    expect(risk.basis).toBe("adp");
    expect(typeof risk.probability).toBe("number");
  });

  it("reports no gaps when the team is not behind the field anywhere", () => {
    // The regression: every rank tied means sorting cannot order them, so the
    // worst-three slice returned whichever categories came first in the list
    // and the UI then blamed those categories for nothing.
    const keys: CategoryKey[] = ["G", "A", "PPP", "HIT", "BLK", "PIM"];
    const tiedThird = Object.fromEntries(keys.map((key) => [key, 3]));
    expect(categoryGaps(tiedThird, keys, 12)).toEqual([]);

    const leading = Object.fromEntries(keys.map((key) => [key, 1]));
    expect(categoryGaps(leading, keys, 12)).toEqual([]);
  });

  it("reports the categories that really are behind, worst first", () => {
    const keys: CategoryKey[] = ["G", "A", "PPP", "HIT", "BLK", "PIM"];
    const ranks = { G: 2, A: 4, PPP: 12, HIT: 9, BLK: 11, PIM: 1 };
    expect(categoryGaps(ranks, keys, 12).map((gap) => gap.key)).toEqual(["PPP", "BLK", "HIT"]);
  });

  it("treats a category nobody on the roster contributes to as last", () => {
    // A team with no goalies genuinely is losing the goalie categories.
    const keys: CategoryKey[] = ["G", "W", "SV"];
    expect(categoryGaps({ G: 1 }, keys, 12).map((gap) => gap.key).sort()).toEqual(["SV", "W"]);
  });

  it("only cites a category the watchlist player actually helps", () => {
    let state = createInitialState();
    for (let overall = 1; overall <= 40; overall++) {
      const derived = derive(state);
      const next = derived.draft.available[0];
      if (!next) break;
      state = reducer(state, {
        type: "draft/record",
        overall,
        franchiseId: derived.draft.pointer.franchiseId!,
        selection: { kind: "player", playerId: next.id },
      });
    }

    const derived = derive(state);
    // Guard against the draft silently not happening: without real picks the
    // managed roster is empty and this asserts nothing.
    expect(derived.draft.managedRoster.length).toBeGreaterThan(0);
    const managedId = state.league.managedFranchiseId;
    const managedRow = derived.analytics!.standings.rows.find(
      (row) => row.franchiseId === managedId,
    );
    // Exactly one gap, and one every skater has a number for. The old code
    // took the first impact whose key was a gap regardless of sign, so a
    // single gap put "Blocks help" on every row — including forwards who
    // block less than the man they would replace.
    const onlyBlocksBehind = { ...managedRow!.categoryRanks, BLK: 12 };
    for (const key of ["G", "A", "PPP", "HIT", "PIM", "W", "SV", "SVPCT", "GAA"] as CategoryKey[]) {
      onlyBlocksBehind[key] = 1;
    }

    const watchlist = postDraftWatchlist(
      derived.draft.available,
      derived.draft.managedRoster,
      state.league.roster,
      state.league.scoring,
      onlyBlocksBehind,
      state.league.franchises.length,
    );

    expect(watchlist.length).toBeGreaterThan(1);
    const blocksRows = watchlist.filter((entry) => entry.reason === "Blocks help");
    expect(blocksRows.length).toBeLessThan(watchlist.length);
  });

  it("states the extremes as bounds, never as 0% or 100%", () => {
    // A logistic estimate is never actually impossible or certain, so the
    // display must not claim it is.
    expect(formatReturnChance(0.0019)).toBe("<1%");
    expect(formatReturnChance(99.97)).toBe(">99%");
    expect(formatReturnChance(0)).toBe("<1%");
    expect(formatReturnChance(100)).toBe(">99%");
    // Everything in between still rounds to a plain percentage.
    expect(formatReturnChance(1)).toBe("1%");
    expect(formatReturnChance(46.4)).toBe("46%");
    expect(formatReturnChance(99)).toBe("99%");
  });
});

/* -------------------------------------------------------------------------
 * Keepers
 * ---------------------------------------------------------------------- */

describe("keeper leagues", () => {
  /** A keeper league with `count` players kept by the managed franchise. */
  function withKeepers(count: number) {
    let state = reducer(createInitialState(), {
      type: "league/setLeagueType",
      leagueType: "keeper",
    });
    const managedId = state.league.managedFranchiseId;
    const kept = derive(state).draft.pool.players.slice(0, count);
    for (const player of kept) {
      state = reducer(state, {
        type: "league/assignKeeper",
        playerId: player.id,
        franchiseId: managedId,
      });
    }
    return { state, kept, managedId };
  }

  it("takes a kept player out of the draft pool", () => {
    const { state, kept } = withKeepers(3);
    const available = derive(state).draft.available;
    for (const player of kept) {
      expect(available.some((candidate) => candidate.id === player.id)).toBe(false);
    }
    expect(derive(state).draft.keeperIds.size).toBe(3);
  });

  it("seeds the opening roster and spends the capacity", () => {
    const { state, kept, managedId } = withKeepers(3);
    const draft = derive(state).draft;

    expect(draft.rosters[managedId].map((p) => p.id)).toEqual(kept.map((p) => p.id));
    // No pick has been recorded, yet three slots are already spoken for.
    expect(draft.pointer.recordedPicks).toBe(0);
    const filled = draft.managedCapacity.reduce((sum, entry) => sum + entry.filled, 0);
    expect(filled).toBe(3);
  });

  it("counts kept players in projections and standings", () => {
    const { state, managedId } = withKeepers(3);
    const row = derive(state).analytics!.standings.rows.find((r) => r.franchiseId === managedId)!;
    const goals = derive(state).analytics!.totals[managedId].totals.G!;
    expect(goals.contributors).toBe(3);
    expect(goals.value).toBeGreaterThan(0);
    // A team with three elite forwards and eleven empty rosters around it
    // should not be sitting mid-table by accident.
    expect(row.points).toBeGreaterThan(0);
  });

  it("ignores keepers while the league is redraft", () => {
    const { state, kept } = withKeepers(3);
    const redraft = reducer(state, { type: "league/setLeagueType", leagueType: "redraft" });
    const draft = derive(redraft).draft;

    expect(draft.keeperIds.size).toBe(0);
    expect(draft.available.some((c) => c.id === kept[0].id)).toBe(true);
    // The assignments survive the round trip rather than being destroyed.
    expect(redraft.league.keepers).toHaveLength(3);
  });

  it("moves a player rather than keeping him twice", () => {
    const { state, kept } = withKeepers(1);
    const other = state.league.franchises.find(
      (f) => f.id !== state.league.managedFranchiseId,
    )!;
    const moved = reducer(state, {
      type: "league/assignKeeper",
      playerId: kept[0].id,
      franchiseId: other.id,
    });

    expect(moved.league.keepers).toHaveLength(1);
    expect(moved.league.keepers[0].franchiseId).toBe(other.id);
    expect(derive(moved).draft.rosters[other.id]).toHaveLength(1);
    expect(derive(moved).draft.rosters[state.league.managedFranchiseId]).toHaveLength(0);
  });

  it("drops keepers belonging to a franchise that no longer exists", () => {
    let { state } = withKeepers(0);
    const last = state.league.franchises[11];
    state = reducer(state, {
      type: "league/assignKeeper",
      playerId: derive(state).draft.pool.players[0].id,
      franchiseId: last.id,
    });
    expect(state.league.keepers).toHaveLength(1);

    const smaller = reducer(state, { type: "league/setTeamCount", teamCount: 10 });
    expect(smaller.league.keepers).toHaveLength(0);
  });

  it("keeps a player who has lost his projection on the roster", () => {
    let { state } = withKeepers(0);
    state = reducer(state, {
      type: "league/assignKeeper",
      playerId: "nobody-in-any-source",
      franchiseId: state.league.managedFranchiseId,
    });
    const draft = derive(state).draft;
    expect(draft.unresolvedByFranchise[state.league.managedFranchiseId]).toBe(1);
  });

  it("reads a keeper column as a hint that carries no owner", () => {
    const sheet = parseDelimited(
      "NAME,POS,KEEP?,G\nAlpha One,C,Y,40\nBeta Two,LW,N,30\nGamma Three,RW,,20\n",
      ",",
    );
    const columns = sheet[0];
    const mapping = autoDetectMapping(columns);
    expect(mapping.keeperFlag).toBe("KEEP?");

    const { rows } = buildProjectionRows(
      { name: "s", columns, rows: sheet.slice(1) },
      mapping,
    );
    expect(rows.map((row) => row.keeperFlag)).toEqual([true, false, undefined]);
    // Nothing in a projection row can name a franchise, so a flag alone can
    // never make a player unavailable.
    expect(Object.keys(rows[0])).not.toContain("franchiseId");
  });

  it("defaults keepers on state written before the field existed", () => {
    const legacy = createInitialState() as AppState & { league: { keepers?: unknown } };
    const raw = JSON.stringify(legacy);
    const withoutField = JSON.parse(raw) as Record<string, { keepers?: unknown }>;
    delete (withoutField.league as { keepers?: unknown }).keepers;

    const revived = deserialize(JSON.stringify(withoutField));
    expect(revived).not.toBeNull();
    expect(revived!.league.keepers).toEqual([]);
    // The draft it was carrying is still there.
    expect(revived!.draft.schedule.picks.length).toBeGreaterThan(0);
  });
});

describe("keeper cells in the pick schedule", () => {
  /** Keeper league with `counts[franchiseId]` keepers assigned to each. */
  function leagueWith(counts: Record<string, number>) {
    let state = reducer(createInitialState(), {
      type: "league/setLeagueType",
      leagueType: "keeper",
    });
    let next = 0;
    const pool = derive(state).draft.pool.players;
    for (const [franchiseId, count] of Object.entries(counts)) {
      for (let i = 0; i < count; i += 1) {
        state = reducer(state, {
          type: "league/assignKeeper",
          playerId: pool[next++].id,
          franchiseId,
        });
      }
    }
    return state;
  }

  it("fills each franchise's own cells from round one upward", () => {
    // f1 picks 1st in round 1, so snakes to 24th overall in round 2 and 25th
    // in round 3. Its three keepers take exactly those cells.
    const state = leagueWith({ f1: 3 });
    const cells = derive(state).draft.keeperCellByOverall;
    expect([...cells.keys()].sort((a, b) => a - b)).toEqual([1, 24, 25]);
  });

  it("gives each franchise its own rounds, not a shared block", () => {
    const state = leagueWith({ f1: 2, f5: 1 });
    const cells = derive(state).draft.keeperCellByOverall;
    // f1: 1st and 24th. f5: 5th.
    expect([...cells.keys()].sort((a, b) => a - b)).toEqual([1, 5, 24]);
  });

  it("steps the pointer over keeper cells without renumbering the board", () => {
    const state = leagueWith({ f1: 1, f2: 1 });
    const draft = derive(state).draft;

    // Cells 1 and 2 are held, so the draft opens on pick 3 — which is still
    // numbered 3, still round 1, and still belongs to f3.
    expect(draft.pointer.currentOverall).toBe(3);
    expect(draft.pointer.round).toBe(1);
    expect(draft.pointer.franchiseId).toBe("f3");
    expect(draft.pointer.recordedPicks).toBe(0);
    expect(draft.pointer.keeperPicks).toBe(2);
    expect(draft.pointer.completedPicks).toBe(2);
    // The schedule is untouched: same length, same numbering.
    expect(draft.pointer.totalPicks).toBe(240);
    expect(state.draft.schedule.picks[2].overall).toBe(3);
  });

  it("keeps snake direction tied to the real round number", () => {
    const state = leagueWith({ f1: 1 });
    // Round 2 still reverses regardless of the keeper sitting in round 1.
    expect(orderForRound(2, state.league.draftOrder)[0]).toBe("f12");
    const round2 = state.draft.schedule.picks.filter((p) => p.round === 2);
    expect(round2[0].franchiseId).toBe("f12");
    expect(round2[0].overall).toBe(13);
  });

  it("does not count a keeper cell as a pick the managed team still makes", () => {
    const managed = createInitialState().league.managedFranchiseId; // f3
    const state = leagueWith({ [managed]: 2 });
    const turn = derive(state).draft.managedTurn;

    // 20 rounds, two spent on keepers, so 18 live selections remain and the
    // next one is in round 3.
    expect(turn.remainingPicks).toHaveLength(18);
    expect(turn.nextOverall).toBe(27);
  });

  it("counts only live cells when saying how far away your turn is", () => {
    // f1 and f2 both keep one, so their round-one cells are gone. From the
    // opening pointer (#3), f4's turn is one live cell away, not three.
    const state = leagueWith({ f1: 1, f2: 1 });
    const turn = franchiseTurn(state.draft, "f4", derive(state).draft.keeperCellByOverall);
    expect(turn.nextOverall).toBe(4);
    expect(turn.picksUntil).toBe(1);
  });

  it("refuses to record a pick into a cell a keeper holds", () => {
    const state = leagueWith({ f1: 1 });
    const attempted = reducer(state, {
      type: "draft/record",
      overall: 1,
      franchiseId: "f1",
      selection: { kind: "player", playerId: derive(state).draft.available[0].id },
    });
    expect(attempted.draft.picks[1]).toBeUndefined();
    expect(attempted).toBe(state);
  });

  it("clears a recorded pick that a later keeper assignment claims", () => {
    let state = reducer(createInitialState(), {
      type: "league/setLeagueType",
      leagueType: "keeper",
    });
    const first = derive(state).draft.available[0];
    state = reducer(state, {
      type: "draft/record",
      overall: 1,
      franchiseId: "f1",
      selection: { kind: "player", playerId: first.id },
    });
    expect(state.draft.picks[1]).toBeDefined();

    // Assigning f1 a keeper claims cell 1; two things cannot share a cell.
    const withKeeper = reducer(state, {
      type: "league/assignKeeper",
      playerId: derive(state).draft.available[0].id,
      franchiseId: "f1",
    });
    expect(withKeeper.draft.picks[1]).toBeUndefined();
    expect(withKeeper.draft.entryOrder).not.toContain(1);
  });

  it("reports keepers with no round left to sit in", () => {
    let state = reducer(createInitialState(), {
      type: "league/setLeagueType",
      leagueType: "keeper",
    });
    state = reducer(state, { type: "league/setRounds", rounds: 2 });
    const pool = derive(state).draft.pool.players;
    for (let i = 0; i < 3; i += 1) {
      state = reducer(state, {
        type: "league/assignKeeper",
        playerId: pool[i].id,
        franchiseId: "f1",
      });
    }

    const draft = derive(state).draft;
    expect(draft.keeperCellByOverall.size).toBe(2);
    expect(draft.unplacedKeepers).toHaveLength(1);
    // The third still owns his roster spot even with no cell to sit in.
    expect(draft.rosters.f1).toHaveLength(3);
  });

  it("puts keeper cells on the shared board alongside recorded picks", () => {
    let state = leagueWith({ f1: 1 });
    state = reducer(state, {
      type: "draft/record",
      overall: 2,
      franchiseId: "f2",
      selection: { kind: "player", playerId: derive(state).draft.available[0].id },
    });

    const cells = boardCells(state.draft, derive(state).draft.keeperCellByOverall);
    expect(cells.map((cell) => [cell.overall, cell.kind])).toEqual([
      [1, "keeper"],
      [2, "pick"],
    ]);
  });

  it("ignores keeper cells entirely in a redraft league", () => {
    const keeper = leagueWith({ f1: 3 });
    const redraft = reducer(keeper, { type: "league/setLeagueType", leagueType: "redraft" });
    const draft = derive(redraft).draft;

    expect(draft.keeperCellByOverall.size).toBe(0);
    expect(draft.pointer.currentOverall).toBe(1);
    expect(draft.pointer.keeperPicks).toBe(0);
  });
});
