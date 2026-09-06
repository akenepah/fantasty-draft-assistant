"use client";

import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconChevronRight,
  IconPencil,
} from "@tabler/icons-react";
import { useCallback, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, PanelCard } from "@/components/ui/SectionCard";
import { FormField, SelectField } from "@/components/ui/Fields";
import {
  LinkButton,
  PrimaryButton,
  SecondaryButton,
  SmallButton,
} from "@/components/ui/Button";
import { PlayerSearch } from "@/components/ui/PlayerSearch";
import { RecommendationCard } from "@/components/ui/RecommendationCard";
import { RosterCapacityRow } from "@/components/ui/RosterCapacityRow";
import { StatusPill } from "@/components/ui/StatusPill";
import { Modal } from "@/components/ui/Modal";
import { DataTable, TableScroll } from "@/components/ui/DataTable";
import { Toast, type ToastMessage } from "@/components/ui/Toast";
import { Unavailable } from "@/components/ui/Unavailable";
import { CorrectionsDrawer } from "@/components/draft-room/CorrectionsDrawer";
import { useAppState } from "@/components/AppStateProvider";
import { CATEGORY_BY_KEY, ROSTER_SLOT_SHORT } from "@/lib/domain/categories";
import { openStartingNeeds } from "@/lib/domain/roster";
import type { Player } from "@/lib/domain/types";

/** A compact key/value in the draft status strip. */
function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-5 first:pl-0 last:pr-0">
      <p className="text-fh-label font-semibold text-fh-ink-2">{label}</p>
      <p className="mt-1 text-fh-card font-semibold text-fh-ink">{value}</p>
    </div>
  );
}

/**
 * Draft Room. Three columns and nothing else: record what happened on the
 * left, read the one recommendation in the middle, check the shape of your
 * roster on the right.
 *
 * Recording a pick is the job this screen must never fail at, so it is kept
 * independent of the analytics beside it: if projections break, the middle
 * and right columns say so and the left one keeps taking picks.
 */
export default function DraftRoomPage() {
  const { state, dispatch, derived } = useAppState();
  const { draft: draftState, analytics, analyticsError } = derived;
  const { league } = state;

  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [query, setQuery] = useState("");
  const [overrideTeam, setOverrideTeam] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [showAllPicks, setShowAllPicks] = useState(false);
  const [showCorrections, setShowCorrections] = useState(false);
  const [showReasoning, setShowReasoning] = useState(false);

  const pointer = draftState.pointer;
  const managedName =
    league.franchises.find((franchise) => franchise.id === league.managedFranchiseId)?.name ??
    "Your team";
  const draftingTeamId = overrideTeam ?? pointer.franchiseId ?? league.franchises[0].id;

  const nameFor = useCallback(
    (id: string) => league.franchises.find((franchise) => franchise.id === id)?.name ?? id,
    [league.franchises],
  );

  const record = useCallback(
    (selection: { kind: "player"; playerId: string } | { kind: "unresolved"; label: string }) => {
      if (pointer.complete) return;
      const overall = pointer.currentOverall;
      const franchiseId = draftingTeamId;

      dispatch({ type: "draft/record", overall, franchiseId, selection });

      const label =
        selection.kind === "player"
          ? (draftState.pool.byId[selection.playerId]?.name ?? "Player")
          : `${selection.label} (unresolved)`;

      setSelectedPlayer(null);
      setQuery("");
      setOverrideTeam(null);
      setToast({
        id: Date.now(),
        message: `Pick recorded — ${label} → ${nameFor(franchiseId)}`,
        onUndo: () => dispatch({ type: "draft/removePick", overall }),
      });
    },
    [pointer, draftingTeamId, dispatch, draftState.pool, nameFor],
  );

  const undoLast = () => {
    const last = state.draft.entryOrder[state.draft.entryOrder.length - 1];
    if (last === undefined) return;
    const pick = state.draft.picks[last];
    dispatch({ type: "draft/undoLast" });
    setToast({
      id: Date.now(),
      message: `Undid pick #${pick.overall} — ${
        pick.selection.kind === "player"
          ? (draftState.pool.byId[pick.selection.playerId]?.name ?? "player")
          : pick.selection.label
      }`,
    });
  };

  const recentPicks = useMemo(
    () =>
      Object.values(state.draft.picks)
        .sort((a, b) => b.overall - a.overall)
        .slice(0, 5),
    [state.draft.picks],
  );

  const openNeeds = useMemo(
    () => openStartingNeeds(draftState.managedRoster, league.roster),
    [draftState.managedRoster, league.roster],
  );

  const gaps = analytics?.recommendation.gaps ?? [];
  const openSlots = draftState.managedCapacity.filter(
    (entry) => entry.slot !== "BN" && entry.filled < entry.capacity,
  );

  const targetNext = [
    ...Object.entries(openNeeds)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([position]) => (position === "G" ? "starting goalie" : `${position} depth`)),
    ...gaps.slice(0, 1).map((gap) => `${gap.label.toLowerCase()} volume`),
  ].join(" · ");

  const phaseNote =
    pointer.complete
      ? "Every scheduled pick has been recorded."
      : draftState.phase === "on-clock"
        ? `${managedName} is on the clock.`
        : draftState.phase === "imminent"
          ? "You are up shortly — the shortlist is narrowing."
          : draftState.phase === "approaching"
            ? "Your turn is close; watch the players most at risk."
            : "Recording picks as they happen.";

  return (
    <>
      {analyticsError && (
        <div className="mb-4 flex gap-3 rounded-fh-card border border-fh-border-strong bg-fh-selected px-4 py-3">
          <IconAlertTriangle size={18} stroke={1.8} aria-hidden className="mt-0.5 shrink-0" />
          <div>
            <p className="text-fh-compact font-semibold text-fh-ink">
              Tracking-only recovery mode
            </p>
            <p className="mt-1 text-fh-meta text-fh-ink-2">
              Projection analysis is unavailable ({analyticsError}). Pick recording, rosters,
              corrections and history all keep working — recommendations and standings will return
              once the projection data is usable.
            </p>
          </div>
        </div>
      )}

      <PageHeader
        title="Draft Room"
        description={phaseNote}
        action={
          <div className="flex gap-3">
            <SecondaryButton onClick={undoLast} disabled={state.draft.entryOrder.length === 0}>
              <IconArrowBackUp size={18} stroke={1.8} aria-hidden />
              Undo Last Pick
            </SecondaryButton>
            <SecondaryButton onClick={() => setShowCorrections(true)}>
              <IconPencil size={18} stroke={1.8} aria-hidden />
              Corrections
            </SecondaryButton>
          </div>
        }
      />

      <Card className="mb-4 flex items-center divide-x divide-fh-border px-5 py-3">
        <StatusItem
          label="Current Round"
          value={pointer.complete ? "Complete" : `${pointer.round} of ${league.rounds}`}
        />
        <StatusItem
          label="Current Pick"
          value={pointer.complete ? `${pointer.totalPicks} of ${pointer.totalPicks}` : `#${pointer.currentOverall}`}
        />
        <StatusItem
          label="On the Clock"
          value={pointer.franchiseId ? nameFor(pointer.franchiseId) : "—"}
        />
        <StatusItem
          label="Your Next Pick"
          value={
            draftState.managedTurn.nextOverall ? `#${draftState.managedTurn.nextOverall}` : "None left"
          }
        />
        <StatusItem
          label="Picks Until Your Turn"
          value={
            draftState.managedTurn.picksUntil === undefined
              ? "—"
              : draftState.managedTurn.picksUntil === 0
                ? "You're up"
                : String(draftState.managedTurn.picksUntil)
          }
        />
      </Card>

      <div className="grid grid-cols-[minmax(0,336px)_minmax(0,1fr)_minmax(0,344px)] items-start gap-4">
        {/* ---------------- Record pick ---------------- */}
        <PanelCard
          title="Record Pick"
          description="Log each selection from your live draft."
          bodyClassName="flex flex-col gap-3"
        >
          {pointer.complete ? (
            <Unavailable title="Draft complete">
              Every pick in the schedule has been recorded. Use Corrections to change one.
            </Unavailable>
          ) : (
            <>
              <FormField label="Player" htmlFor="pick-player">
                <PlayerSearch
                  key={pointer.currentOverall}
                  id="pick-player"
                  players={draftState.available}
                  selected={selectedPlayer}
                  onSelect={setSelectedPlayer}
                  onQueryChange={setQuery}
                  onSubmit={() => {
                    if (selectedPlayer) record({ kind: "player", playerId: selectedPlayer.id });
                  }}
                />
              </FormField>

              <FormField
                label="Drafting Team"
                htmlFor="pick-team"
                hint={`Inferred from the draft order — pick #${pointer.currentOverall}.`}
              >
                <SelectField
                  id="pick-team"
                  value={draftingTeamId}
                  onChange={(event) => setOverrideTeam(event.target.value)}
                  options={league.franchises.map((franchise) => ({
                    value: franchise.id,
                    label: franchise.name,
                  }))}
                />
              </FormField>

              <PrimaryButton
                className="w-full"
                disabled={!selectedPlayer}
                onClick={() => {
                  if (selectedPlayer) record({ kind: "player", playerId: selectedPlayer.id });
                }}
              >
                Record Pick
              </PrimaryButton>

              {!selectedPlayer && query.trim().length > 1 && (
                <SmallButton
                  className="w-full"
                  onClick={() => record({ kind: "unresolved", label: query.trim() })}
                >
                  Record “{query.trim()}” as unresolved
                </SmallButton>
              )}
            </>
          )}

          <div className="mt-2 border-t border-fh-border pt-3">
            <div className="flex items-center justify-between">
              <h3 className="text-fh-compact font-semibold text-fh-ink">Recent Picks</h3>
              <LinkButton onClick={() => setShowAllPicks(true)}>View All</LinkButton>
            </div>
            <ul className="mt-2 flex flex-col">
              {recentPicks.map((pick) => {
                const player =
                  pick.selection.kind === "player"
                    ? draftState.pool.byId[pick.selection.playerId]
                    : undefined;
                return (
                  <li
                    key={pick.overall}
                    className="flex items-center gap-3 border-b border-fh-border py-2 last:border-b-0"
                  >
                    <span className="w-8 shrink-0 text-fh-meta text-fh-ink-muted tabular-nums">
                      #{pick.overall}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-fh-compact text-fh-ink">
                        {player?.name ??
                          (pick.selection.kind === "unresolved"
                            ? pick.selection.label
                            : "Unknown player")}
                      </span>
                      <span className="block truncate text-fh-meta text-fh-ink-2">
                        {player
                          ? `${player.eligibility.positions.join("/")}${player.team ? ` · ${player.team}` : ""} → `
                          : "Unresolved → "}
                        {nameFor(pick.franchiseId)}
                      </span>
                    </span>
                  </li>
                );
              })}
              {recentPicks.length === 0 && (
                <li className="py-3 text-fh-compact text-fh-ink-muted">No picks recorded yet.</li>
              )}
            </ul>
          </div>
        </PanelCard>

        {/* ---------------- Recommendation ---------------- */}
        <PanelCard
          title="Who Should I Draft?"
          description="One recommendation, refreshed after every recorded pick."
        >
          {!analytics ? (
            <Unavailable title="Recommendations unavailable">
              Projection analysis is not running. Pick recording is unaffected.
            </Unavailable>
          ) : analytics.recommendation.unavailable ? (
            <Unavailable title="Nothing to recommend">
              {analytics.recommendation.unavailable}
            </Unavailable>
          ) : analytics.recommendation.primary ? (
            <>
              {analytics.recommendation.finishingMode && (
                <div className="mb-3">
                  <StatusPill tone="medium">
                    Roster finishing · {draftState.managedTurn.remainingPicks.length} picks left
                  </StatusPill>
                </div>
              )}

              <RecommendationCard
                recommendation={analytics.recommendation.primary}
                picksUntilTurn={draftState.managedTurn.picksUntil}
                finishingMode={analytics.recommendation.finishingMode}
              />

              {analytics.recommendation.alternative && (
                <div className="mt-5 border-t border-fh-border pt-4">
                  <p className="text-fh-label font-semibold text-fh-ink-2">Alternative</p>
                  <div className="mt-2 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-fh-card font-semibold text-fh-ink">
                        {analytics.recommendation.alternative.player.name}
                      </p>
                      <p className="mt-0.5 text-fh-compact text-fh-ink-2">
                        {analytics.recommendation.alternative.player.eligibility.positions.join("/")}
                        {analytics.recommendation.alternative.player.team
                          ? ` · ${analytics.recommendation.alternative.player.team}`
                          : ""}
                        {" · "}
                        {analytics.recommendation.alternative.reasons[0] ??
                          analytics.recommendation.alternative.strategy}
                      </p>
                    </div>
                    <StatusPill
                      tone={
                        analytics.recommendation.alternative.urgency === "draft-now"
                          ? "strong"
                          : "quiet"
                      }
                    >
                      {analytics.recommendation.alternative.returnRisk.label}
                    </StatusPill>
                  </div>
                </div>
              )}

              <div className="mt-4 border-t border-fh-border pt-3">
                <LinkButton onClick={() => setShowReasoning(true)}>
                  Why this pick?
                  <IconChevronRight size={14} stroke={1.8} aria-hidden />
                </LinkButton>
              </div>
            </>
          ) : (
            <Unavailable title="Nothing to recommend">
              No available player fits an open roster slot.
            </Unavailable>
          )}
        </PanelCard>

        {/* ---------------- My team & needs ---------------- */}
        <PanelCard
          title="My Team & Needs"
          description={managedName}
          bodyClassName="flex flex-col gap-4"
        >
          <div>
            <h3 className="text-fh-label font-semibold text-fh-ink">Roster Summary</h3>
            <div className="mt-2 flex flex-col gap-2">
              {draftState.managedCapacity.map((capacity) => (
                <RosterCapacityRow key={capacity.slot} capacity={capacity} />
              ))}
            </div>
          </div>

          <div className="border-t border-fh-border pt-3">
            <h3 className="text-fh-label font-semibold text-fh-ink">Open Needs</h3>
            <p className="mt-1.5 text-fh-compact text-fh-ink-2">
              {openSlots.length === 0
                ? "All starting slots are filled."
                : openSlots
                    .map(
                      (entry) =>
                        `${ROSTER_SLOT_SHORT[entry.slot]} ×${entry.capacity - entry.filled}`,
                    )
                    .join(" · ")}
            </p>
            {draftState.unresolvedByFranchise[league.managedFranchiseId] > 0 && (
              <p className="mt-1.5 text-fh-meta text-fh-ink-2">
                {draftState.unresolvedByFranchise[league.managedFranchiseId]} unresolved pick(s) not
                yet counted against these slots.
              </p>
            )}
          </div>

          <div className="border-t border-fh-border pt-3">
            <h3 className="text-fh-label font-semibold text-fh-ink">Category Focus</h3>
            {!analytics ? (
              <p className="mt-1.5 text-fh-meta text-fh-ink-2">
                Category standing is unavailable until projections and scoring settings are in
                place.
              </p>
            ) : gaps.length === 0 ? (
              /* No gaps is a real result, not missing data: the team is not
                 behind the field in any scored category. */
              <p className="mt-1.5 text-fh-meta text-fh-ink-2">
                Not behind the field in any category.
              </p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5">
                {gaps.map((gap) => (
                  <li key={gap.key} className="flex items-center justify-between gap-3">
                    <span className="text-fh-compact text-fh-ink">{gap.label}</span>
                    <span className="text-fh-meta text-fh-ink-2">
                      {gap.rank} of {gap.teams}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-fh-card border border-fh-border bg-fh-subtle px-3 py-2.5">
            <p className="text-fh-label font-semibold text-fh-ink">Target Next</p>
            <p className="mt-1 text-fh-compact text-fh-ink-2">
              {targetNext || "Best available — the starting lineup is complete."}
            </p>
          </div>
        </PanelCard>
      </div>

      {/* ---------------- Progressive disclosure ---------------- */}
      <Modal
        open={showAllPicks}
        title="All Recorded Picks"
        description={`${pointer.recordedPicks} of ${pointer.totalPicks} scheduled picks recorded.`}
        onClose={() => setShowAllPicks(false)}
        width={760}
      >
        <TableScroll maxHeight={440}>
          <DataTable
            stickyHeader
            rows={Object.values(state.draft.picks).sort((a, b) => b.overall - a.overall)}
            getRowKey={(pick) => String(pick.overall)}
            columns={[
              { key: "pick", header: "Pick", width: "64px", cell: (p) => `#${p.overall}` },
              { key: "round", header: "Round", width: "72px", cell: (p) => p.round },
              {
                key: "player",
                header: "Player",
                cell: (p) =>
                  p.selection.kind === "player"
                    ? (draftState.pool.byId[p.selection.playerId]?.name ?? "Not in active source")
                    : `${p.selection.label} (unresolved)`,
              },
              {
                key: "pos",
                header: "Pos",
                width: "72px",
                cell: (p) =>
                  p.selection.kind === "player"
                    ? (draftState.pool.byId[p.selection.playerId]?.eligibility.positions.join("/") ??
                      "—")
                    : "—",
              },
              { key: "team", header: "Drafted By", cell: (p) => nameFor(p.franchiseId) },
              {
                key: "state",
                header: "",
                width: "76px",
                cell: (p) =>
                  p.corrected ? (
                    <StatusPill tone="quiet" size="sm">
                      Edited
                    </StatusPill>
                  ) : null,
              },
            ]}
          />
        </TableScroll>
      </Modal>

      <CorrectionsDrawer open={showCorrections} onClose={() => setShowCorrections(false)} />

      <Modal
        open={showReasoning && Boolean(analytics?.recommendation.primary)}
        title="Why this pick?"
        description={
          analytics?.recommendation.primary
            ? `${analytics.recommendation.primary.player.name} — ${analytics.recommendation.primary.strategy}`
            : undefined
        }
        onClose={() => setShowReasoning(false)}
        width={560}
      >
        {analytics?.recommendation.primary && (
          <dl className="flex flex-col gap-3 text-fh-compact">
            <Detail
              term={`Value over replacement${
                analytics.recommendation.primary.detail.replacementName
                  ? ` (vs ${analytics.recommendation.primary.detail.replacementName})`
                  : ""
              }`}
              value={String(analytics.recommendation.primary.detail.valueOverReplacement)}
            />
            <Detail
              term="Value after weighting your category needs"
              value={String(analytics.recommendation.primary.detail.needWeightedValue)}
            />
            <Detail
              term="Startable players left at the position"
              value={String(analytics.recommendation.primary.detail.positionalScarcity)}
            />
            <Detail
              term="Score margin over the next candidate"
              value={String(analytics.recommendation.primary.detail.scoreMargin)}
            />
            <Detail
              term="Fills a starting slot"
              value={analytics.recommendation.primary.detail.fillsStartingSlot ? "Yes" : "Bench only"}
            />
            <Detail
              term="Yahoo ADP"
              value={
                analytics.recommendation.primary.player.adp !== undefined
                  ? String(analytics.recommendation.primary.player.adp)
                  : "Not provided by the active source"
              }
            />
            {analytics.recommendation.primary.detail.fantasyPoints !== undefined && (
              <Detail
                term="Projected fantasy points"
                value={String(analytics.recommendation.primary.detail.fantasyPoints)}
              />
            )}
            <div className="border-t border-fh-border pt-3">
              <dt className="text-fh-ink-2">Category standing being addressed</dt>
              <dd className="mt-1.5 flex flex-col gap-1">
                {gaps.length === 0 ? (
                  <span className="text-fh-ink">
                    None — the roster is not behind the field in any category.
                  </span>
                ) : (
                  gaps.map((gap) => (
                    <span key={gap.key} className="text-fh-ink">
                      {CATEGORY_BY_KEY[gap.key].label} — {gap.rank} of {gap.teams}
                    </span>
                  ))
                )}
              </dd>
            </div>
          </dl>
        )}
      </Modal>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}

function Detail({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex justify-between gap-6">
      <dt className="text-fh-ink-2">{term}</dt>
      <dd className="shrink-0 font-semibold text-fh-ink">{value}</dd>
    </div>
  );
}
