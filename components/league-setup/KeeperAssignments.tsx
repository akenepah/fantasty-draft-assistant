"use client";

import { IconAlertTriangle, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { FormField, SelectField } from "../ui/Fields";
import { SecondaryButton, IconButton, LinkButton } from "../ui/Button";
import { PlayerSearch } from "../ui/PlayerSearch";
import { StatusPill } from "../ui/StatusPill";
import { useAppState } from "../AppStateProvider";
import { totalRosterSpots } from "@/lib/domain/state";
import type { Player } from "@/lib/domain/types";

/**
 * Keeper Assignments — opening roster state for a keeper league.
 *
 * A kept player is owned before pick one, so he fills a roster slot, counts
 * against capacity, feeds projections and standings, and never appears in the
 * draft pool. All of that follows from one assignment because the selectors
 * seed rosters from these before any pick is read.
 *
 * Ownership is entered by hand. A projection file can flag a player as kept,
 * but it does not say *whose* keeper he is — so the flag only ever raises a
 * suggestion here, and nothing is assigned until a franchise is chosen.
 */
export function KeeperAssignments() {
  const { state, dispatch, derived } = useAppState();
  const { league } = state;
  const [player, setPlayer] = useState<Player | null>(null);
  const [franchiseId, setFranchiseId] = useState(league.franchises[0]?.id ?? "");

  const pool = derived.draft.pool;
  const assignedIds = new Set(league.keepers.map((keeper) => keeper.playerId));

  // A player already drafted cannot also be a keeper.
  const selectable = pool.players.filter(
    (candidate) => !assignedIds.has(candidate.id) && !derived.draft.draftedIds.has(candidate.id),
  );

  const spots = totalRosterSpots(league.roster);
  const byFranchise = league.franchises.map((franchise) => ({
    franchise,
    players: league.keepers
      .filter((keeper) => keeper.franchiseId === franchise.id)
      .map((keeper) => ({ keeper, player: pool.byId[keeper.playerId] })),
  }));

  const overCapacity = byFranchise.filter((entry) => entry.players.length > spots);
  const most = Math.max(0, ...byFranchise.map((entry) => entry.players.length));
  const openSpots = spots - most;

  const assign = () => {
    if (!player || !franchiseId) return;
    dispatch({ type: "league/assignKeeper", playerId: player.id, franchiseId });
    setPlayer(null);
  };

  // Players a source marked as kept but nobody has assigned yet. Suggestion
  // only — each still needs a franchise before it means anything.
  const suggestions = pool.players
    .filter((candidate) => candidate.keeperFlag && !assignedIds.has(candidate.id))
    .slice(0, 12);

  return (
    <div className="col-span-2 border-t border-fh-border pt-4">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-fh-compact font-semibold text-fh-ink">Keeper Assignments</h3>
        {league.keepers.length > 0 && (
          <LinkButton onClick={() => dispatch({ type: "league/clearKeepers" })}>
            Clear all
          </LinkButton>
        )}
      </div>
      <p className="mt-1 text-fh-meta text-fh-ink-2">
        Assign each kept player to the franchise that owns him. Keepers fill roster slots before
        the draft starts and are removed from the draft pool.
      </p>

      <div className="mt-3 flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <FormField label="Player" htmlFor="keeper-player">
            <PlayerSearch
              // The search box owns its query text, so clearing the selection
              // is not enough to clear the field — remount it once the
              // assignment lands, the same way the Draft Room does per pick.
              key={league.keepers.length}
              id="keeper-player"
              players={selectable}
              selected={player}
              onSelect={setPlayer}
              onSubmit={assign}
              placeholder="Search players…"
            />
          </FormField>
        </div>
        <div className="w-[220px] shrink-0">
          <FormField label="Kept By" htmlFor="keeper-franchise">
            <SelectField
              id="keeper-franchise"
              value={franchiseId}
              onChange={(event) => setFranchiseId(event.target.value)}
              options={league.franchises.map((franchise) => ({
                value: franchise.id,
                label: franchise.name,
              }))}
            />
          </FormField>
        </div>
        <SecondaryButton onClick={assign} disabled={!player || !franchiseId}>
          Assign Keeper
        </SecondaryButton>
      </div>

      <p className="mt-2.5 text-fh-meta text-fh-ink-2">
        {league.keepers.length === 0
          ? `No keepers assigned. Every roster opens with all ${spots} spots free.`
          : `${league.keepers.length} keeper${league.keepers.length === 1 ? "" : "s"} assigned. ` +
            `The fullest roster holds ${most} of ${spots} spots, leaving ${openSpots} to draft.`}
        {league.keepers.length > 0 && league.rounds > openSpots && (
          <> Rounds is set to {league.rounds}, which is more than that roster can still take.</>
        )}
      </p>

      {overCapacity.length > 0 && (
        <div className="mt-3 flex gap-2.5 rounded-fh-card border border-fh-border bg-fh-subtle p-3">
          <IconAlertTriangle
            size={18}
            stroke={1.7}
            aria-hidden
            className="mt-px shrink-0 text-fh-ink-2"
          />
          <p className="text-fh-meta text-fh-ink-2">
            {overCapacity.map((entry) => entry.franchise.name).join(", ")} has more keepers than
            the {spots} configured roster spots. The extra players are carried as overflow and will
            not be slotted.
          </p>
        </div>
      )}

      {league.keepers.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-x-4 gap-y-3">
          {byFranchise
            .filter((entry) => entry.players.length > 0)
            .map(({ franchise, players }) => (
              <li key={franchise.id}>
                <div className="flex items-center gap-2">
                  <span className="truncate text-fh-label font-semibold text-fh-ink">
                    {franchise.name}
                  </span>
                  <StatusPill size="sm" tone={players.length > spots ? "medium" : "quiet"}>
                    {players.length} of {spots}
                  </StatusPill>
                </div>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {players.map(({ keeper, player: kept }) => (
                    <li
                      key={keeper.playerId}
                      className="flex items-center justify-between gap-2 rounded-fh-control border border-fh-border bg-fh-surface py-1 pr-1 pl-2.5"
                    >
                      <span className="min-w-0 truncate text-fh-meta text-fh-ink">
                        {kept ? (
                          <>
                            {kept.name}
                            <span className="text-fh-ink-2">
                              {" · "}
                              {kept.eligibility.positions.join("/")}
                            </span>
                          </>
                        ) : (
                          /* The projection source that named him is gone; he
                             still owns the spot. */
                          <span className="text-fh-ink-2">
                            {keeper.playerId} — no projection
                          </span>
                        )}
                      </span>
                      <IconButton
                        width={22}
                        height={22}
                        aria-label={`Remove ${kept?.name ?? keeper.playerId} from ${franchise.name}`}
                        onClick={() =>
                          dispatch({ type: "league/removeKeeper", playerId: keeper.playerId })
                        }
                      >
                        <IconX size={13} stroke={2} aria-hidden />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
        </ul>
      )}

      {suggestions.length > 0 && (
        <div className="mt-4 rounded-fh-card border border-fh-border bg-fh-subtle p-3">
          <p className="text-fh-label font-semibold text-fh-ink">Flagged as kept in your import</p>
          <p className="mt-1 text-fh-meta text-fh-ink-2">
            Your projection file marks these players as keepers but does not say who owns them.
            Choose one to load it above, then pick the franchise.
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {suggestions.map((candidate) => (
              <li key={candidate.id}>
                <button
                  type="button"
                  onClick={() => setPlayer(candidate)}
                  className="rounded-fh-control border border-fh-border-strong bg-fh-surface px-2 py-1 text-fh-meta text-fh-ink transition-colors hover:bg-fh-selected"
                >
                  {candidate.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
