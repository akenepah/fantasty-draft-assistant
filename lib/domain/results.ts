import type { PlayerPool } from "./projections";
import type { Draft, Franchise, ProjectedStandings } from "./types";

/**
 * Post-draft summary derived from the completed Draft object — the same
 * picks the Draft Room recorded, read back rather than recalculated from a
 * parallel dataset.
 */

export type Highlight = {
  label: string;
  value: string;
  detail: string;
};

export function draftHighlights(
  draft: Draft,
  pool: PlayerPool,
  standings: ProjectedStandings | undefined,
  franchises: Franchise[],
): Highlight[] {
  const nameFor = (id: string) =>
    franchises.find((franchise) => franchise.id === id)?.name ?? "Unknown";

  const picks = Object.values(draft.picks).sort((a, b) => a.overall - b.overall);
  const resolved = picks.flatMap((pick) =>
    pick.selection.kind === "player" && pool.byId[pick.selection.playerId]
      ? [{ pick, player: pool.byId[pick.selection.playerId] }]
      : [],
  );

  const highlights: Highlight[] = [];

  const first = picks[0];
  if (first) {
    const player =
      first.selection.kind === "player" ? pool.byId[first.selection.playerId] : undefined;
    highlights.push({
      label: "1st Overall Pick",
      value: player
        ? `${player.name}${player.team ? ` (${player.team})` : ""}`
        : first.selection.kind === "unresolved"
          ? first.selection.label
          : "Unknown",
      detail: nameFor(first.franchiseId),
    });
  }

  // Value against ADP only makes sense where the source supplied an ADP.
  const withAdp = resolved.filter((entry) => entry.player.adp !== undefined);
  if (withAdp.length > 0) {
    const value = (entry: (typeof withAdp)[number]) => entry.player.adp! - entry.pick.overall;
    const steal = withAdp.reduce((best, entry) => (value(entry) > value(best) ? entry : best));
    const reach = withAdp.reduce((worst, entry) => (value(entry) < value(worst) ? entry : worst));

    highlights.push({
      label: "Biggest Steal",
      value: `${steal.player.name}${steal.player.team ? ` (${steal.player.team})` : ""}`,
      detail: `Round ${steal.pick.round}, Pick ${steal.pick.overall} · ADP ${steal.player.adp}`,
    });
    highlights.push({
      label: "Biggest Reach",
      value: `${reach.player.name}${reach.player.team ? ` (${reach.player.team})` : ""}`,
      detail: `Round ${reach.pick.round}, Pick ${reach.pick.overall} · ADP ${reach.player.adp}`,
    });
  }

  const firstGoalie = resolved.find((entry) => entry.player.eligibility.positions.includes("G"));
  if (firstGoalie) {
    highlights.push({
      label: "First Goalie Drafted",
      value: `${firstGoalie.player.name}${firstGoalie.player.team ? ` (${firstGoalie.player.team})` : ""}`,
      detail: `Round ${firstGoalie.pick.round}, Pick ${firstGoalie.pick.overall} · ${nameFor(firstGoalie.pick.franchiseId)}`,
    });
  }

  const best = standings?.rows[0];
  if (best) {
    highlights.push({
      label: "Highest Projected Roster",
      value: nameFor(best.franchiseId),
      detail: `${best.points} points`,
    });
  }

  return highlights;
}

/**
 * Every settled cell on the board, in schedule order.
 *
 * Keeper cells and recorded picks are the same kind of thing to a reader —
 * "this seat is taken, by this player, for this franchise" — so the board is
 * derived once here and every screen renders the same list. Open cells are
 * left out; the pointer is what says where the draft actually is.
 */
export type BoardCell = {
  overall: number;
  round: number;
  slotInRound: number;
  franchiseId: string;
  kind: "keeper" | "pick";
  playerId?: string;
  /** Present when the pick was recorded against a placeholder name. */
  unresolvedLabel?: string;
};

export function boardCells(
  draft: Draft,
  keeperCellByOverall: ReadonlyMap<number, string>,
): BoardCell[] {
  const cells: BoardCell[] = [];

  for (const scheduled of draft.schedule.picks) {
    const keeperPlayerId = keeperCellByOverall.get(scheduled.overall);
    if (keeperPlayerId !== undefined) {
      cells.push({
        overall: scheduled.overall,
        round: scheduled.round,
        slotInRound: scheduled.slotInRound,
        // A keeper belongs to the franchise whose cell it is, by construction.
        franchiseId: scheduled.franchiseId,
        kind: "keeper",
        playerId: keeperPlayerId,
      });
      continue;
    }

    const pick = draft.picks[scheduled.overall];
    if (!pick) continue;
    cells.push({
      overall: pick.overall,
      round: pick.round,
      slotInRound: pick.slotInRound,
      franchiseId: pick.franchiseId,
      kind: "pick",
      playerId: pick.selection.kind === "player" ? pick.selection.playerId : undefined,
      unresolvedLabel: pick.selection.kind === "unresolved" ? pick.selection.label : undefined,
    });
  }

  return cells;
}

/** A flat CSV of the board, for the Export Results button. */
export function draftBoardCsv(
  draft: Draft,
  pool: PlayerPool,
  franchises: Franchise[],
  keeperCellByOverall: ReadonlyMap<number, string> = new Map(),
): string {
  const nameFor = (id: string) =>
    franchises.find((franchise) => franchise.id === id)?.name ?? "Unknown";

  const escape = (value: string) =>
    /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

  // "How" distinguishes a keeper from a selection without changing the shape
  // of the export or the meaning of any other column.
  const header = ["Pick", "Round", "Player", "Positions", "NHL Team", "ADP", "Team", "How"];
  const lines = boardCells(draft, keeperCellByOverall).map((cell) => {
    const player = cell.playerId !== undefined ? pool.byId[cell.playerId] : undefined;
    return [
      String(cell.overall),
      String(cell.round),
      player?.name ??
        (cell.unresolvedLabel !== undefined ? `${cell.unresolvedLabel} (unresolved)` : ""),
      player?.eligibility.positions.join("/") ?? "",
      player?.team ?? "",
      player?.adp !== undefined ? String(player.adp) : "",
      nameFor(cell.franchiseId),
      cell.kind === "keeper" ? "Keeper" : "Drafted",
    ]
      .map(escape)
      .join(",");
  });

  return [header.join(","), ...lines].join("\n");
}
