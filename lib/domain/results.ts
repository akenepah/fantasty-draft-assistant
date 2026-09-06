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

/** A flat CSV of the board, for the Export Results button. */
export function draftBoardCsv(
  draft: Draft,
  pool: PlayerPool,
  franchises: Franchise[],
): string {
  const nameFor = (id: string) =>
    franchises.find((franchise) => franchise.id === id)?.name ?? "Unknown";

  const escape = (value: string) =>
    /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

  const header = ["Pick", "Round", "Player", "Positions", "NHL Team", "ADP", "Drafted By"];
  const lines = Object.values(draft.picks)
    .sort((a, b) => a.overall - b.overall)
    .map((pick) => {
      const player =
        pick.selection.kind === "player" ? pool.byId[pick.selection.playerId] : undefined;
      return [
        String(pick.overall),
        String(pick.round),
        player?.name ??
          (pick.selection.kind === "unresolved" ? `${pick.selection.label} (unresolved)` : ""),
        player?.eligibility.positions.join("/") ?? "",
        player?.team ?? "",
        player?.adp !== undefined ? String(player.adp) : "",
        nameFor(pick.franchiseId),
      ]
        .map(escape)
        .join(",");
    });

  return [header.join(","), ...lines].join("\n");
}
