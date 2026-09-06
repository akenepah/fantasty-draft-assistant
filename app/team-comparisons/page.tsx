"use client";

import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, PanelCard } from "@/components/ui/SectionCard";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { FieldLabel, SmallSelect } from "@/components/ui/Fields";
import { IconButton } from "@/components/ui/Button";
import { DataTable, TableScroll, type Column } from "@/components/ui/DataTable";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { TeamBadge, TeamEmblem, teamShortName } from "@/components/ui/TeamBadge";
import { Unavailable } from "@/components/ui/Unavailable";
import { cn } from "@/components/ui/cn";
import { useAppState } from "@/components/AppStateProvider";
import { CATEGORY_BY_KEY, formatCategoryValue } from "@/lib/domain/categories";
import { scoredCategories } from "@/lib/domain/scoring";
import { assignSlots } from "@/lib/domain/roster";
import type {
  CategoryKey,
  Player,
  ProjectedTeamTotals,
  StandingRow,
} from "@/lib/domain/types";

type View = "standings" | "totals" | "ranks" | "rosters";

const ROSTER_STAT_KEYS: CategoryKey[] = ["G", "A", "PPP", "SOG", "HIT", "BLK"];

/**
 * Team Comparisons — the league-wide analytics destination, reading the same
 * live draft state as everything else. Record a pick in the Draft Room and
 * these tables move with it.
 */
export default function TeamComparisonsPage() {
  const { state, derived } = useAppState();
  const { league } = state;
  const { analytics, analyticsError, draft } = derived;

  const [view, setView] = useState<View>("standings");
  const [scope, setScope] = useState<"all" | "top6">("all");
  const [detailTeam, setDetailTeam] = useState(league.managedFranchiseId);
  const [rosterTeam, setRosterTeam] = useState(league.managedFranchiseId);
  const [sort, setSort] = useState<{ key: CategoryKey | "name"; desc: boolean }>({
    key: "name",
    desc: false,
  });

  const keys = scoredCategories(league.scoring);
  const [category, setCategory] = useState<CategoryKey>(keys[0] ?? "G");
  const activeCategory = keys.includes(category) ? category : (keys[0] ?? "G");

  const nameFor = (id: string) =>
    league.franchises.find((franchise) => franchise.id === id)?.name ?? id;

  const teamOptions = league.franchises.map((franchise) => ({
    value: franchise.id,
    label: franchise.name,
  }));

  const rows = analytics?.standings.rows ?? [];
  const totals = analytics?.totals ?? {};

  const comparison = buildComparison(
    league.franchises.map((franchise) => franchise.id),
    totals,
    activeCategory,
    scope,
  );

  const comparisonMax = Math.max(...comparison.map((row) => row.total?.value ?? 0), 1);

  const strengths = keys.map((key) => ({
    key,
    top: rows
      .slice()
      .sort((a, b) => (a.categoryRanks[key] ?? 99) - (b.categoryRanks[key] ?? 99))
      .slice(0, 3)
      .map((row) => nameFor(row.franchiseId)),
  }));

  const detailRoster = draft.rosters[detailTeam] ?? [];
  const detailStanding = rows.find((row) => row.franchiseId === detailTeam);

  const rosterPlayers = useMemo(() => {
    const players = [...(draft.rosters[rosterTeam] ?? [])];
    return players.sort((a, b) => {
      if (sort.key === "name") {
        return sort.desc ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name);
      }
      const left = a.stats[sort.key] ?? -1;
      const right = b.stats[sort.key] ?? -1;
      return sort.desc ? right - left : left - right;
    });
  }, [draft.rosters, rosterTeam, sort]);

  const toggleSort = (key: CategoryKey | "name") =>
    setSort((current) =>
      current.key === key ? { key, desc: !current.desc } : { key, desc: key !== "name" },
    );

  const sortableHeader = (key: CategoryKey | "name", label: string) => (
    <button
      type="button"
      onClick={() => toggleSort(key)}
      className="text-fh-label font-semibold text-fh-ink-2 hover:text-fh-ink"
      aria-label={`Sort by ${label}`}
    >
      {label}
      {sort.key === key && <span aria-hidden>{sort.desc ? " ↓" : " ↑"}</span>}
    </button>
  );

  const standingsColumns: Column<StandingRow>[] = [
    { key: "rank", header: "#", width: "32px", cell: (row) => row.rank },
    {
      key: "team",
      header: "Team",
      cell: (row) => (
        <button
          type="button"
          onClick={() => {
            setDetailTeam(row.franchiseId);
            setRosterTeam(row.franchiseId);
          }}
          className="flex w-full items-center gap-2 text-left hover:underline"
        >
          <TeamBadge name={nameFor(row.franchiseId)} size={20} />
          <span
            className={cn(
              "truncate",
              row.franchiseId === league.managedFranchiseId && "font-semibold",
            )}
          >
            {nameFor(row.franchiseId)}
          </span>
          {row.incomplete && (
            <span className="shrink-0 text-fh-ink-muted" title="Some projections are missing">
              *
            </span>
          )}
        </button>
      ),
    },
    { key: "points", header: "Points", align: "right", width: "58px", cell: (row) => row.points },
    { key: "w", header: "W", align: "right", width: "34px", cell: (row) => row.wins },
    { key: "l", header: "L", align: "right", width: "34px", cell: (row) => row.losses },
    { key: "t", header: "T", align: "right", width: "34px", cell: (row) => row.ties },
  ];

  const matrixColumns: Column<StandingRow>[] = [
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
        if (!total || total.contributors === 0) return "—";
        if (view === "ranks") return row.categoryRanks[key] ?? "—";
        return formatCategoryValue(key, total.value);
      },
    })),
  ];

  const rosterColumns: Column<Player>[] = [
    { key: "player", header: sortableHeader("name", "Player"), cell: (p) => p.name },
    {
      key: "pos",
      header: "Pos",
      width: "62px",
      cell: (p) => p.eligibility.positions.join("/"),
    },
    { key: "team", header: "Team", width: "52px", cell: (p) => p.team ?? "—" },
    ...ROSTER_STAT_KEYS.map<Column<Player>>((key) => ({
      key,
      header: sortableHeader(key, CATEGORY_BY_KEY[key].short),
      align: "right",
      width: "50px",
      cell: (p) => p.stats[key] ?? "—",
    })),
  ];

  if (analyticsError) {
    return (
      <>
        <PageHeader
          title="Team Comparisons"
          description="Compare teams, projected category totals, and standings to see where each franchise stands."
        />
        <Unavailable title="Projection analysis is unavailable">
          {analyticsError} The Draft Room is still recording picks — this page will fill in once
          the projection data is usable again.
        </Unavailable>
      </>
    );
  }

  if (keys.length === 0) {
    return (
      <>
        <PageHeader
          title="Team Comparisons"
          description="Compare teams, projected category totals, and standings to see where each franchise stands."
        />
        <Unavailable title="Nothing is being scored">
          Enable at least one category in League Setup and these comparisons will populate.
        </Unavailable>
      </>
    );
  }

  const nothingDrafted = draft.pointer.recordedPicks === 0;

  return (
    <>
      <PageHeader
        title="Team Comparisons"
        description="Compare teams, projected category totals, and standings to see where each franchise stands."
      />

      <Card className="mb-4 flex flex-wrap items-end gap-8 px-5 py-4">
        <div>
          <FieldLabel>View</FieldLabel>
          <div className="mt-2">
            <SegmentedControl
              label="Comparison view"
              size="sm"
              value={view}
              onChange={setView}
              segments={[
                { value: "standings", label: "Standings" },
                { value: "totals", label: "Category Totals" },
                { value: "ranks", label: "Category Ranks" },
                { value: "rosters", label: "Rosters" },
              ]}
            />
          </div>
        </div>

        <div className="w-[300px]">
          <FieldLabel>Projection Set</FieldLabel>
          <p className="mt-2 truncate text-fh-compact text-fh-ink">
            {state.projectionConfig.mode === "consensus"
              ? `Consensus — ${state.projectionConfig.includedSourceIds.length} sources`
              : state.projectionConfig.mode === "single"
                ? (state.sources.find(
                    (dataset) => dataset.source.id === state.projectionConfig.primarySourceId,
                  )?.source.analyst ?? "None")
                : "Primary + supplemental"}
          </p>
        </div>

        <div className="ml-auto flex items-end gap-3">
          <div className="w-[176px]">
            <FieldLabel htmlFor="scope">Teams shown</FieldLabel>
            <div className="mt-2">
              <SmallSelect
                id="scope"
                value={scope}
                onChange={(event) => setScope(event.target.value as "all" | "top6")}
                options={[
                  { value: "all", label: "All Teams" },
                  { value: "top6", label: "Top 6 by Points" },
                ]}
              />
            </div>
          </div>
        </div>
      </Card>

      {nothingDrafted && (
        <Unavailable className="mb-4" title="No picks recorded yet">
          Every franchise starts empty, so the projected totals below are all zero. Record picks in
          the Draft Room and these numbers become meaningful.
        </Unavailable>
      )}

      {view === "standings" ? (
        <div className="mb-4 grid grid-cols-[minmax(0,1.12fr)_minmax(0,1.2fr)_minmax(0,1.05fr)] items-start gap-3">
          <PanelCard
            title="Projected Standings"
            description="Based on current rosters and active projections. Click a team to view details."
            bodyClassName="fh-scroll overflow-x-auto rounded-fh-card border border-fh-border"
          >
            <DataTable
              columns={standingsColumns}
              rows={rows}
              getRowKey={(row) => row.franchiseId}
              isHighlighted={(row) => row.franchiseId === detailTeam}
            />
          </PanelCard>

          <PanelCard
            title="Category Comparison"
            description="Projected totals for all teams."
            action={
              <div className="flex items-center gap-1">
                <div className="w-[118px]">
                  <SmallSelect
                    aria-label="Category"
                    value={activeCategory}
                    onChange={(event) => setCategory(event.target.value as CategoryKey)}
                    options={keys.map((key) => ({
                      value: key,
                      label: CATEGORY_BY_KEY[key].tableLabel,
                    }))}
                  />
                </div>
                <IconButton
                  width={28}
                  height={32}
                  aria-label="Previous category"
                  onClick={() =>
                    setCategory(keys[(keys.indexOf(activeCategory) - 1 + keys.length) % keys.length])
                  }
                >
                  <IconChevronLeft size={16} stroke={1.8} aria-hidden />
                </IconButton>
                <IconButton
                  width={28}
                  height={32}
                  aria-label="Next category"
                  onClick={() =>
                    setCategory(keys[(keys.indexOf(activeCategory) + 1) % keys.length])
                  }
                >
                  <IconChevronRight size={16} stroke={1.8} aria-hidden />
                </IconButton>
              </div>
            }
            bodyClassName="flex flex-col gap-2"
          >
            {comparison.map((row, index) => (
              <div key={row.franchiseId} className="flex items-center gap-3">
                <span
                  className={cn(
                    "w-[126px] shrink-0 truncate text-fh-compact",
                    row.franchiseId === detailTeam ? "font-semibold text-fh-ink" : "text-fh-ink-2",
                  )}
                >
                  {nameFor(row.franchiseId)}
                </span>
                <ProgressBar
                  value={row.total?.value ?? 0}
                  max={comparisonMax}
                  emphasis={index === 0 && (row.total?.contributors ?? 0) > 0}
                  label={`${nameFor(row.franchiseId)} ${row.total?.value ?? 0}`}
                  className="h-3.5 min-w-0 flex-1 rounded-[3px]"
                />
                <span className="w-[46px] shrink-0 text-right text-fh-compact text-fh-ink tabular-nums">
                  {row.total && row.total.contributors > 0
                    ? formatCategoryValue(activeCategory, row.total.value)
                    : "—"}
                </span>
              </div>
            ))}
          </PanelCard>

          <PanelCard
            title="Category Strengths"
            description="Top 3 teams in each category."
            bodyClassName="fh-scroll overflow-x-auto rounded-fh-card border border-fh-border"
          >
            <DataTable
              className="table-fixed"
              rows={strengths}
              getRowKey={(row) => row.key}
              columns={[
                {
                  key: "category",
                  header: "Category",
                  width: "36%",
                  cell: (row) => (
                    <span className="block truncate">{CATEGORY_BY_KEY[row.key].tableLabel}</span>
                  ),
                },
                ...(["1st", "2nd", "3rd"] as const).map((header, place) => ({
                  key: header,
                  header,
                  width: "21.3%",
                  cell: (row: { top: string[] }) => (
                    <span className="block truncate text-fh-meta" title={row.top[place]}>
                      {row.top[place] ? teamShortName(row.top[place]) : "—"}
                    </span>
                  ),
                })),
              ]}
            />
          </PanelCard>
        </div>
      ) : view === "rosters" ? (
        <PanelCard
          title="Rosters"
          description="Every franchise's drafted roster and projected stats."
          className="mb-4"
        >
          <TableScroll maxHeight={420}>
            <DataTable
              stickyHeader
              rows={league.franchises.flatMap((franchise) =>
                (draft.rosters[franchise.id] ?? []).map((player) => ({
                  franchiseId: franchise.id,
                  player,
                })),
              )}
              getRowKey={(entry) => `${entry.franchiseId}-${entry.player.id}`}
              emptyMessage="No picks recorded yet."
              columns={[
                {
                  key: "franchise",
                  header: "Franchise",
                  cell: (entry) => (
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <TeamBadge name={nameFor(entry.franchiseId)} size={20} />
                      {nameFor(entry.franchiseId)}
                    </span>
                  ),
                },
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
                ...ROSTER_STAT_KEYS.map((key) => ({
                  key,
                  header: CATEGORY_BY_KEY[key].short,
                  headerLabel: CATEGORY_BY_KEY[key].label,
                  align: "right" as const,
                  width: "50px",
                  cell: (entry: { player: Player }) => entry.player.stats[key] ?? "—",
                })),
              ]}
            />
          </TableScroll>
        </PanelCard>
      ) : (
        <PanelCard
          title={view === "totals" ? "Category Totals" : "Category Ranks"}
          description={
            view === "totals"
              ? "Projected season totals for every scored category. A dash means no rostered player has that stat."
              : "League rank in every scored category. 1 is best."
          }
          className="mb-4"
          bodyClassName="fh-scroll overflow-x-auto rounded-fh-card border border-fh-border"
        >
          <DataTable
            columns={matrixColumns}
            rows={rows}
            getRowKey={(row) => row.franchiseId}
            isHighlighted={(row) => row.franchiseId === detailTeam}
          />
        </PanelCard>
      )}

      <div className="grid grid-cols-[minmax(0,612fr)_minmax(0,660fr)] items-start gap-3">
        <PanelCard
          title={`Team Details — ${nameFor(detailTeam)}`}
          description="Projected totals and category ranks for the selected team."
          action={
            <div className="w-[176px]">
              <SmallSelect
                aria-label="Team details"
                value={detailTeam}
                onChange={(event) => setDetailTeam(event.target.value)}
                options={teamOptions}
              />
            </div>
          }
          bodyClassName="grid grid-cols-[minmax(0,190px)_minmax(0,1fr)] gap-4"
        >
          <div className="flex flex-col items-center pt-2 text-center">
            <TeamEmblem name={nameFor(detailTeam)} size={96} />
            <p className="mt-3 text-fh-card font-semibold text-fh-ink">{nameFor(detailTeam)}</p>
            <p className="mt-4 text-fh-label font-semibold text-fh-ink-2">
              {league.scoring.format === "points" ? "Projected Points" : "Rotisserie Points"}
            </p>
            <p className="text-[40px] leading-[46px] font-bold text-fh-ink">
              {detailStanding?.points ?? 0}
            </p>
            <p className="text-fh-meta text-fh-ink-2">
              {detailStanding
                ? `(${detailStanding.wins}-${detailStanding.losses}-${detailStanding.ties})`
                : "—"}
            </p>
            <p className="mt-2 text-fh-meta text-fh-ink-2">
              {detailRoster.length} player{detailRoster.length === 1 ? "" : "s"} drafted
            </p>
          </div>

          <div className="fh-scroll overflow-x-auto rounded-fh-card border border-fh-border">
            <DataTable
              rows={keys.map((key) => ({
                key,
                total: totals[detailTeam]?.totals[key],
                rank: detailStanding?.categoryRanks[key],
              }))}
              getRowKey={(row) => row.key}
              columns={[
                {
                  key: "category",
                  header: "Category",
                  cell: (row) => CATEGORY_BY_KEY[row.key].tableLabel,
                },
                {
                  key: "total",
                  header: "Projected Total",
                  align: "right",
                  width: "112px",
                  cell: (row) =>
                    row.total && row.total.contributors > 0
                      ? formatCategoryValue(row.key, row.total.value)
                      : "—",
                },
                {
                  key: "rank",
                  header: "League Rank",
                  align: "right",
                  width: "96px",
                  // No contributor means no standing to report.
                  cell: (row) =>
                    row.rank && row.total && row.total.contributors > 0
                      ? ordinal(row.rank)
                      : "—",
                },
              ]}
            />
          </div>
        </PanelCard>

        <PanelCard
          title={`Roster — ${nameFor(rosterTeam)}`}
          description="Projected stats for this roster. Sort by any column."
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
        >
          <TableScroll maxHeight={286}>
            <DataTable
              stickyHeader
              rows={rosterPlayers}
              getRowKey={(player) => player.id}
              emptyMessage="No players drafted yet."
              columns={rosterColumns}
            />
          </TableScroll>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-fh-meta text-fh-ink-2">
              {rosterPlayers.length} of{" "}
              {assignSlots(rosterPlayers, league.roster).length || rosterPlayers.length} rostered
              {(draft.unresolvedByFranchise[rosterTeam] ?? 0) > 0 &&
                ` · ${draft.unresolvedByFranchise[rosterTeam]} unresolved`}
            </p>
          </div>
        </PanelCard>
      </div>
    </>
  );
}

/** Franchises ordered by one category, worst-covered last. */
function buildComparison(
  franchiseIds: string[],
  totals: Record<string, ProjectedTeamTotals>,
  key: CategoryKey,
  scope: "all" | "top6",
) {
  const lowerIsBetter = CATEGORY_BY_KEY[key].lowerIsBetter === true;
  const entries = franchiseIds.map((franchiseId) => ({
    franchiseId,
    total: totals[franchiseId]?.totals[key],
  }));

  entries.sort((a, b) => {
    // A franchise with no contributor cannot lead, in either direction.
    if (!a.total?.contributors && !b.total?.contributors) return 0;
    if (!a.total?.contributors) return 1;
    if (!b.total?.contributors) return -1;
    return lowerIsBetter
      ? a.total.value - b.total.value
      : b.total.value - a.total.value;
  });

  return scope === "top6" ? entries.slice(0, 6) : entries;
}

function ordinal(value: number): string {
  const suffixes = ["th", "st", "nd", "rd"];
  const remainder = value % 100;
  return `${value}${suffixes[(remainder - 20) % 10] ?? suffixes[remainder] ?? suffixes[0]}`;
}
