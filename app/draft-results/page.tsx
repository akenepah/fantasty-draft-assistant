"use client";

import {
  IconCalendar,
  IconChartBar,
  IconDownload,
  IconTrophy,
  IconUser,
  IconUsers,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, PanelCard } from "@/components/ui/SectionCard";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SmallSelect } from "@/components/ui/Fields";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { DataTable, TableScroll, type Column } from "@/components/ui/DataTable";
import { TeamBadge, TeamEmblem } from "@/components/ui/TeamBadge";
import { Toast, type ToastMessage } from "@/components/ui/Toast";
import { Unavailable } from "@/components/ui/Unavailable";
import { useAppState } from "@/components/AppStateProvider";
import { CATEGORY_BY_KEY, formatCategoryValue } from "@/lib/domain/categories";
import { scoredCategories } from "@/lib/domain/scoring";
import { assignSlots } from "@/lib/domain/roster";
import { postDraftWatchlist } from "@/lib/domain/recommend";
import { draftBoardCsv, draftHighlights } from "@/lib/domain/results";
import type { CategoryKey, DraftPick, Player, StandingRow } from "@/lib/domain/types";

type Tab = "overview" | "rosters" | "standings" | "totals" | "board" | "values";

const ROSTER_STATS: CategoryKey[] = ["G", "A", "PPP", "SOG", "HIT", "BLK", "PIM"];

function SummaryTile({
  icon,
  value,
  label,
  detail,
  subdetail,
}: {
  icon: ReactNode;
  value?: string;
  label: string;
  detail: string;
  subdetail?: string;
}) {
  return (
    <Card className="flex items-center gap-4 p-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-fh-control border border-fh-border bg-fh-subtle text-fh-ink-2">
        {icon}
      </span>
      <div className="min-w-0">
        {value && <p className="text-[26px] leading-8 font-bold text-fh-ink">{value}</p>}
        <p
          className={
            value ? "text-fh-compact font-semibold text-fh-ink" : "text-fh-card font-semibold text-fh-ink"
          }
        >
          {label}
        </p>
        <p className="text-fh-compact text-fh-ink-2">{detail}</p>
        {subdetail && <p className="text-fh-meta text-fh-ink-2">{subdetail}</p>}
      </div>
    </Card>
  );
}

/**
 * Draft Results — the completed-draft destination. Everything here reads the
 * same Draft object the Draft Room has been writing to, so the board, the
 * rosters and the standings are the draft that actually happened.
 */
export default function DraftResultsPage() {
  const { state, dispatch, derived } = useAppState();
  const { league } = state;
  const { draft: draftState, analytics, analyticsError } = derived;

  const [tab, setTab] = useState<Tab>("overview");
  const [rosterTeam, setRosterTeam] = useState(league.managedFranchiseId);
  const [boardRound, setBoardRound] = useState<"all" | string>("all");
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const keys = scoredCategories(league.scoring);
  const picks = useMemo(
    () => Object.values(state.draft.picks).sort((a, b) => a.overall - b.overall),
    [state.draft.picks],
  );
  const complete = state.draft.status === "complete";

  const nameFor = (id: string) =>
    league.franchises.find((franchise) => franchise.id === id)?.name ?? id;

  const rows = analytics?.standings.rows ?? [];
  const totals = analytics?.totals ?? {};

  const highlights = useMemo(
    () => draftHighlights(state.draft, draftState.pool, analytics?.standings, league.franchises),
    [state.draft, draftState.pool, analytics?.standings, league.franchises],
  );

  const categoryLeaders = keys.map((key) => {
    const leader = rows.find((row) => row.categoryRanks[key] === 1);
    const total = leader ? totals[leader.franchiseId]?.totals[key] : undefined;
    return {
      key,
      leaderId: leader?.franchiseId,
      value: total && total.contributors > 0 ? formatCategoryValue(key, total.value) : undefined,
    };
  });

  const managedRow = rows.find((row) => row.franchiseId === league.managedFranchiseId);
  const watchlist = analytics
    ? postDraftWatchlist(
        draftState.available,
        draftState.managedRoster,
        league.roster,
        league.scoring,
        managedRow?.categoryRanks ?? {},
        league.franchises.length,
      )
    : [];

  const slotted = useMemo(
    () => assignSlots(draftState.rosters[rosterTeam] ?? [], league.roster),
    [draftState.rosters, rosterTeam, league.roster],
  );

  const boardPicks = useMemo(
    () => (boardRound === "all" ? picks : picks.filter((pick) => pick.round === Number(boardRound))),
    [picks, boardRound],
  );

  const teamOptions = league.franchises.map((franchise) => ({
    value: franchise.id,
    label: franchise.name,
  }));

  const exportCsv = () => {
    const csv = draftBoardCsv(state.draft, draftState.pool, league.franchises);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${league.name.replace(/\s+/g, "-").toLowerCase()}-draft-board.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setToast({ id: Date.now(), message: "Draft board exported as CSV." });
  };

  const standingsColumns: Column<StandingRow>[] = [
    { key: "rank", header: "#", width: "32px", cell: (row) => row.rank },
    {
      key: "team",
      header: "Team",
      cell: (row) => (
        <span className="flex items-center gap-2">
          <TeamBadge name={nameFor(row.franchiseId)} size={20} />
          <span className="truncate">{nameFor(row.franchiseId)}</span>
        </span>
      ),
    },
    {
      key: "points",
      header: league.scoring.format === "points" ? "Fantasy Points" : "Roto Points",
      align: "right",
      width: "110px",
      cell: (row) => row.points,
    },
    { key: "w", header: "W", align: "right", width: "34px", cell: (row) => row.wins },
    { key: "l", header: "L", align: "right", width: "34px", cell: (row) => row.losses },
    { key: "t", header: "T", align: "right", width: "34px", cell: (row) => row.ties },
  ];

  const rosterColumns: Column<{ slot: string; player: Player }>[] = [
    { key: "slot", header: "Pos", width: "44px", cell: (entry) => entry.slot },
    { key: "player", header: "Player", cell: (entry) => entry.player.name },
    { key: "team", header: "Team", width: "48px", cell: (entry) => entry.player.team ?? "—" },
    ...ROSTER_STATS.map<Column<{ player: Player }>>((key) => ({
      key,
      header: CATEGORY_BY_KEY[key].short,
      headerLabel: CATEGORY_BY_KEY[key].label,
      align: "right",
      width: "42px",
      cell: (entry) => entry.player.stats[key] ?? "—",
    })),
  ] as Column<{ slot: string; player: Player }>[];

  const boardColumns: Column<DraftPick>[] = [
    { key: "pick", header: "Pick", width: "52px", cell: (pick) => pick.overall },
    {
      key: "player",
      header: "Player",
      cell: (pick) =>
        pick.selection.kind === "player"
          ? (draftState.pool.byId[pick.selection.playerId]?.name ?? "Not in active source")
          : `${pick.selection.label} (unresolved)`,
    },
    {
      key: "team",
      header: "Team",
      width: "56px",
      cell: (pick) =>
        pick.selection.kind === "player"
          ? (draftState.pool.byId[pick.selection.playerId]?.team ?? "—")
          : "—",
    },
    { key: "drafted", header: "Drafted By", cell: (pick) => nameFor(pick.franchiseId) },
  ];

  if (picks.length === 0) {
    return (
      <>
        <PageHeader
          title="Draft Results"
          description="Your draft is complete. Explore the final rosters, projected standings, and key takeaways."
        />
        <Unavailable title="No draft to summarise yet">
          Record picks in the Draft Room and the final board, rosters and standings appear here.
        </Unavailable>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Draft Results"
        description={
          complete
            ? "Your draft is complete. Explore the final rosters, projected standings, and key takeaways."
            : "Draft in progress — these results update as picks are recorded."
        }
        action={
          <Card className="flex items-center gap-4 py-2.5 pr-2.5 pl-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-fh-control border border-fh-border bg-fh-subtle text-fh-ink-2">
              <IconTrophy size={20} stroke={1.7} aria-hidden />
            </span>
            <div>
              <p className="text-fh-card font-semibold text-fh-ink">
                {complete ? "Draft Complete" : "Draft In Progress"}
              </p>
              <p className="text-fh-meta text-fh-ink-2">
                {league.rounds} rounds · {league.teamCount} teams ·{" "}
                {draftState.pointer.recordedPicks}/{draftState.pointer.totalPicks} picks
              </p>
            </div>
            {!complete && (
              <SecondaryButton onClick={() => dispatch({ type: "draft/finalize" })}>
                Finalize
              </SecondaryButton>
            )}
            <PrimaryButton onClick={exportCsv}>
              <IconDownload size={18} stroke={1.8} aria-hidden />
              Export Results
            </PrimaryButton>
          </Card>
        }
      />

      <div className="mb-4">
        <SegmentedControl
          label="Results view"
          size="sm"
          value={tab}
          onChange={setTab}
          segments={[
            { value: "overview", label: "Overview" },
            { value: "rosters", label: "Final Rosters" },
            { value: "standings", label: "Projected Standings" },
            { value: "totals", label: "Category Totals" },
            { value: "board", label: "Draft Board" },
            { value: "values", label: "Top Picks & Values" },
          ]}
        />
      </div>

      {analyticsError && (
        <Unavailable className="mb-4" title="Projection analysis is unavailable">
          {analyticsError} The draft board and rosters below are still accurate.
        </Unavailable>
      )}

      {tab === "overview" && (
        <>
          <div className="mb-4 grid grid-cols-4 gap-3">
            <SummaryTile
              icon={<IconUsers size={20} stroke={1.7} aria-hidden />}
              value={String(league.teamCount)}
              label="Teams"
              detail={`${league.rounds} rounds (${draftState.pointer.totalPicks} picks)`}
            />
            <SummaryTile
              icon={<IconUser size={20} stroke={1.7} aria-hidden />}
              value={String(draftState.pointer.recordedPicks)}
              label="Players Drafted"
              detail={`${draftState.pointer.totalPicks - draftState.pointer.recordedPicks} remaining`}
              subdetail={
                draftState.unresolvedTotal > 0
                  ? `${draftState.unresolvedTotal} unresolved`
                  : undefined
              }
            />
            <SummaryTile
              icon={<IconChartBar size={20} stroke={1.7} aria-hidden />}
              label="Active Projections"
              detail={
                state.projectionConfig.mode === "consensus"
                  ? `Consensus of ${state.projectionConfig.includedSourceIds.length} sources`
                  : state.projectionConfig.mode === "single"
                    ? (state.sources.find(
                        (dataset) => dataset.source.id === state.projectionConfig.primarySourceId,
                      )?.source.analyst ?? "None")
                    : "Primary + supplemental"
              }
              subdetail={`${draftState.pool.players.length} players in pool`}
            />
            <SummaryTile
              icon={<IconCalendar size={20} stroke={1.7} aria-hidden />}
              label={complete ? "Completed" : "Status"}
              detail={
                state.draft.completedAt
                  ? new Date(state.draft.completedAt).toLocaleDateString()
                  : "In progress"
              }
              subdetail={`${league.draftType === "snake" ? "Snake" : "Linear"} draft`}
            />
          </div>

          <div className="mb-4 grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1.05fr)] items-start gap-3">
            <PanelCard
              title="Final Projected Standings"
              description="Based on current rosters and active projections."
              bodyClassName="fh-scroll overflow-x-auto rounded-fh-card border border-fh-border"
            >
              {analytics ? (
                <DataTable
                  columns={standingsColumns}
                  rows={rows}
                  getRowKey={(row) => row.franchiseId}
                  isHighlighted={(row) => row.franchiseId === league.managedFranchiseId}
                />
              ) : (
                <Unavailable title="Standings unavailable" />
              )}
            </PanelCard>

            <PanelCard
              title="Category Leaders"
              description="Top team in each scoring category."
              bodyClassName="fh-scroll overflow-x-auto rounded-fh-card border border-fh-border"
            >
              <DataTable
                className="table-fixed"
                rows={categoryLeaders}
                getRowKey={(row) => row.key}
                emptyMessage="No categories are being scored."
                columns={[
                  {
                    key: "category",
                    header: "Category",
                    width: "38%",
                    cell: (row) => (
                      <span className="block truncate">{CATEGORY_BY_KEY[row.key].tableLabel}</span>
                    ),
                  },
                  {
                    key: "team",
                    header: "Team",
                    width: "42%",
                    cell: (row) => (
                      <span className="block truncate" title={row.leaderId ? nameFor(row.leaderId) : ""}>
                        {row.leaderId ? nameFor(row.leaderId) : "—"}
                      </span>
                    ),
                  },
                  {
                    key: "total",
                    header: "Total",
                    align: "right",
                    width: "20%",
                    cell: (row) => row.value ?? "—",
                  },
                ]}
              />
            </PanelCard>

            <PanelCard
              title="Draft Highlights"
              description="Notable picks, values, and storylines."
              bodyClassName="flex flex-col"
            >
              {highlights.length === 0 ? (
                <Unavailable title="Nothing to highlight yet" />
              ) : (
                highlights.map((highlight) => (
                  <div
                    key={highlight.label}
                    className="border-b border-fh-border py-2.5 first:pt-0 last:border-b-0 last:pb-0"
                  >
                    <p className="text-fh-meta font-semibold text-fh-ink-2">{highlight.label}</p>
                    <p className="truncate text-fh-compact font-semibold text-fh-ink">
                      {highlight.value}
                    </p>
                    <p className="truncate text-fh-meta text-fh-ink-2">{highlight.detail}</p>
                  </div>
                ))
              )}
            </PanelCard>
          </div>

          <div className="mb-4 grid grid-cols-[minmax(0,1.58fr)_minmax(0,1fr)] items-start gap-3">
            <PanelCard
              title="Final Rosters"
              description="Select a team to view their complete roster and projections."
              action={
                <div className="w-[176px]">
                  <SmallSelect
                    aria-label="Roster team"
                    value={rosterTeam}
                    onChange={(event) => setRosterTeam(event.target.value)}
                    options={teamOptions}
                  />
                </div>
              }
              bodyClassName="grid grid-cols-[minmax(0,130px)_minmax(0,1fr)] gap-3"
            >
              <div className="flex flex-col items-center pt-1 text-center">
                <TeamEmblem name={nameFor(rosterTeam)} size={80} />
                <p className="mt-2 text-fh-compact font-semibold text-fh-ink">
                  {nameFor(rosterTeam)}
                </p>
                <p className="mt-3 text-fh-label font-semibold text-fh-ink-2">
                  {league.scoring.format === "points" ? "Projected Points" : "Roto Points"}
                </p>
                <p className="text-[34px] leading-10 font-bold text-fh-ink">
                  {rows.find((row) => row.franchiseId === rosterTeam)?.points ?? "—"}
                </p>
              </div>

              <div className="fh-scroll overflow-x-auto rounded-fh-card border border-fh-border">
                <DataTable
                  columns={rosterColumns}
                  rows={slotted}
                  getRowKey={(entry) => entry.player.id}
                  emptyMessage="No players drafted."
                />
              </div>
            </PanelCard>

            <PanelCard
              title="Draft Board"
              description="Every recorded pick, in order."
              action={
                <div className="w-[148px]">
                  <SmallSelect
                    aria-label="Round"
                    value={boardRound}
                    onChange={(event) => setBoardRound(event.target.value)}
                    options={[
                      { value: "all", label: "All Rounds" },
                      ...Array.from({ length: league.rounds }, (_, index) => ({
                        value: String(index + 1),
                        label: `Round ${index + 1}`,
                      })),
                    ]}
                  />
                </div>
              }
            >
              <TableScroll maxHeight={330}>
                <DataTable
                  stickyHeader
                  columns={boardColumns}
                  rows={boardPicks}
                  getRowKey={(pick) => String(pick.overall)}
                />
              </TableScroll>
            </PanelCard>
          </div>

          <PanelCard
            title="Post-Draft Free-Agent Watchlist"
            description="A snapshot of the best undrafted players against your roster's remaining gaps. Not monitored — nothing here watches an external league."
            bodyClassName="fh-scroll overflow-x-auto rounded-fh-card border border-fh-border"
          >
            <DataTable
              rows={watchlist}
              getRowKey={(entry) => entry.player.id}
              emptyMessage="No undrafted players left to watch."
              columns={[
                { key: "player", header: "Player", cell: (entry) => entry.player.name },
                {
                  key: "pos",
                  header: "Pos",
                  width: "62px",
                  cell: (entry) => entry.player.eligibility.positions.join("/"),
                },
                {
                  key: "team",
                  header: "Team",
                  width: "52px",
                  cell: (entry) => entry.player.team ?? "—",
                },
                { key: "reason", header: "Why", cell: (entry) => entry.reason },
                ...ROSTER_STATS.slice(0, 4).map((key) => ({
                  key,
                  header: CATEGORY_BY_KEY[key].short,
                  headerLabel: CATEGORY_BY_KEY[key].label,
                  align: "right" as const,
                  width: "48px",
                  cell: (entry: { player: Player }) => entry.player.stats[key] ?? "—",
                })),
              ]}
            />
          </PanelCard>
        </>
      )}

      {tab === "rosters" && (
        <PanelCard
          title="Final Rosters"
          description="Every franchise's completed roster."
          action={
            <div className="w-[176px]">
              <SmallSelect
                aria-label="Roster team"
                value={rosterTeam}
                onChange={(event) => setRosterTeam(event.target.value)}
                options={teamOptions}
              />
            </div>
          }
          bodyClassName="fh-scroll overflow-x-auto rounded-fh-card border border-fh-border"
        >
          <DataTable
            columns={rosterColumns}
            rows={slotted}
            getRowKey={(entry) => entry.player.id}
            emptyMessage="No players drafted."
          />
        </PanelCard>
      )}

      {tab === "standings" && (
        <PanelCard
          title="Projected Standings"
          description={
            league.scoring.format === "points"
              ? "Projected fantasy points from the configured point values."
              : "Rotisserie points across every scored category, plus a projected head-to-head record."
          }
          bodyClassName="fh-scroll overflow-x-auto rounded-fh-card border border-fh-border"
        >
          {analytics ? (
            <DataTable
              columns={standingsColumns}
              rows={rows}
              getRowKey={(row) => row.franchiseId}
              isHighlighted={(row) => row.franchiseId === league.managedFranchiseId}
            />
          ) : (
            <Unavailable title="Standings unavailable" />
          )}
        </PanelCard>
      )}

      {tab === "totals" && (
        <PanelCard
          title="Category Totals"
          description="Projected totals for every franchise. A dash means no rostered player has that stat."
          bodyClassName="fh-scroll overflow-x-auto rounded-fh-card border border-fh-border"
        >
          <DataTable
            rows={rows}
            getRowKey={(row) => row.franchiseId}
            isHighlighted={(row) => row.franchiseId === league.managedFranchiseId}
            emptyMessage="Nothing is being scored."
            columns={[
              {
                key: "team",
                header: "Team",
                cell: (row) => (
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <TeamBadge name={nameFor(row.franchiseId)} size={20} />
                    {nameFor(row.franchiseId)}
                  </span>
                ),
              },
              ...keys.map<Column<StandingRow>>((key) => ({
                key,
                header: CATEGORY_BY_KEY[key].short,
                headerLabel: CATEGORY_BY_KEY[key].label,
                align: "right",
                cell: (row) => {
                  const total = totals[row.franchiseId]?.totals[key];
                  return total && total.contributors > 0
                    ? formatCategoryValue(key, total.value)
                    : "—";
                },
              })),
            ]}
          />
        </PanelCard>
      )}

      {tab === "board" && (
        <PanelCard
          title="Draft Board"
          description={`${picks.length} picks recorded.`}
          action={
            <div className="w-[148px]">
              <SmallSelect
                aria-label="Round"
                value={boardRound}
                onChange={(event) => setBoardRound(event.target.value)}
                options={[
                  { value: "all", label: "All Rounds" },
                  ...Array.from({ length: league.rounds }, (_, index) => ({
                    value: String(index + 1),
                    label: `Round ${index + 1}`,
                  })),
                ]}
              />
            </div>
          }
        >
          <TableScroll maxHeight={520}>
            <DataTable
              stickyHeader
              rows={boardPicks}
              getRowKey={(pick) => String(pick.overall)}
              columns={[
                { key: "pick", header: "Pick", width: "56px", cell: (p) => p.overall },
                { key: "round", header: "Round", width: "68px", cell: (p) => p.round },
                ...boardColumns.slice(1),
              ]}
            />
          </TableScroll>
        </PanelCard>
      )}

      {tab === "values" && (
        <PanelCard
          title="Top Picks & Values"
          description="Picks measured against their average draft position. Players with no ADP in the active source are excluded."
          bodyClassName="fh-scroll overflow-x-auto rounded-fh-card border border-fh-border"
        >
          <DataTable
            rows={picks
              .flatMap((pick) => {
                if (pick.selection.kind !== "player") return [];
                const player = draftState.pool.byId[pick.selection.playerId];
                if (!player || player.adp === undefined) return [];
                return [{ pick, player, value: player.adp - pick.overall }];
              })
              .sort((a, b) => b.value - a.value)
              .slice(0, 20)}
            getRowKey={(entry) => String(entry.pick.overall)}
            emptyMessage="No picks with ADP data yet."
            columns={[
              { key: "pick", header: "Pick", width: "56px", cell: (entry) => entry.pick.overall },
              { key: "player", header: "Player", cell: (entry) => entry.player.name },
              {
                key: "pos",
                header: "Pos",
                width: "62px",
                cell: (entry) => entry.player.eligibility.positions.join("/"),
              },
              {
                key: "adp",
                header: "ADP",
                align: "right",
                width: "60px",
                cell: (entry) => entry.player.adp,
              },
              {
                key: "value",
                header: "Value",
                align: "right",
                width: "72px",
                cell: (entry) => `${entry.value > 0 ? "+" : ""}${entry.value}`,
              },
              {
                key: "drafted",
                header: "Drafted By",
                cell: (entry) => nameFor(entry.pick.franchiseId),
              },
            ]}
          />
        </PanelCard>
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
