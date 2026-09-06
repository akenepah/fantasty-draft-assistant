import { CATEGORY_DEFINITIONS } from "./categories";
import type {
  CategoryKey,
  Player,
  Position,
  ProjectionConfiguration,
  ProjectionDataset,
  ProjectionRow,
  StatLine,
} from "./types";

/**
 * Turning one or more imported analyst files into the draft-relevant player
 * pool.
 *
 * Each source stays independent; this module only decides how their values
 * combine when the league asks for a single number. The rule that matters:
 * a source that did not provide a stat contributes nothing to it — it is
 * never averaged in as a zero, which would quietly punish players whose
 * coverage happens to be thinner.
 */

const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"]);

/**
 * Normalised identity used to match the same human across files: accents
 * folded, punctuation dropped, generational suffixes removed.
 */
export function matchKeyFor(name: string): string {
  const cleaned = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // Periods and apostrophes join ("T.J." -> "tj"); other punctuation and
    // hyphens separate ("Pierre-Luc" -> "pierre luc").
    .replace(/['\u2019.]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((part) => !NAME_SUFFIXES.has(part));
  return cleaned.join(" ");
}

/** Which datasets feed the pool, in priority order, for a given config. */
export function activeDatasets(
  datasets: ProjectionDataset[],
  config: ProjectionConfiguration,
): { primary?: ProjectionDataset; included: ProjectionDataset[] } {
  const byId = new Map(datasets.map((dataset) => [dataset.source.id, dataset]));
  const included = config.includedSourceIds
    .map((id) => byId.get(id))
    .filter((dataset): dataset is ProjectionDataset => dataset !== undefined);

  const primary = config.primarySourceId ? byId.get(config.primarySourceId) : undefined;

  if (config.mode === "single") {
    const only = primary ?? included[0];
    return { primary: only, included: only ? [only] : [] };
  }

  return { primary: primary ?? included[0], included };
}

type MergedField = { value?: number; sources: string[] };

/** Mean of the values actually present. No value at all stays undefined. */
function mergeNumbers(values: { value: number; sourceId: string }[]): MergedField {
  if (values.length === 0) return { sources: [] };
  const sum = values.reduce((total, entry) => total + entry.value, 0);
  return {
    value: sum / values.length,
    sources: values.map((entry) => entry.sourceId),
  };
}

const ALL_KEYS: CategoryKey[] = CATEGORY_DEFINITIONS.map((definition) => definition.key);

function roundForKey(key: CategoryKey, value: number): number {
  const definition = CATEGORY_DEFINITIONS.find((candidate) => candidate.key === key);
  if (definition?.rate) return Number(value.toFixed(definition.precision ?? 3));
  return Math.round(value);
}

/**
 * Combine one player's rows from several sources into a single line.
 *
 *  single               — only the primary source contributes.
 *  consensus            — every included source that has a value is averaged.
 *  primary-supplemental — the primary's value wins; supplemental sources
 *                         fill only the fields the primary leaves empty.
 */
function mergeStats(
  rows: { row: ProjectionRow; sourceId: string }[],
  mode: ProjectionConfiguration["mode"],
  primarySourceId: string | undefined,
): { stats: StatLine; coverage: Partial<Record<CategoryKey, string[]>> } {
  const stats: StatLine = {};
  const coverage: Partial<Record<CategoryKey, string[]>> = {};

  for (const key of ALL_KEYS) {
    const available = rows
      .map(({ row, sourceId }) => ({ value: row.stats[key], sourceId }))
      .filter((entry): entry is { value: number; sourceId: string } =>
        typeof entry.value === "number" && Number.isFinite(entry.value),
      );

    if (available.length === 0) continue;

    let merged: MergedField;
    if (mode === "primary-supplemental" && primarySourceId) {
      const fromPrimary = available.filter((entry) => entry.sourceId === primarySourceId);
      merged = mergeNumbers(fromPrimary.length > 0 ? fromPrimary : available);
    } else {
      merged = mergeNumbers(available);
    }

    if (merged.value !== undefined) {
      stats[key] = roundForKey(key, merged.value);
      coverage[key] = merged.sources;
    }
  }

  return { stats, coverage };
}

function mergeScalar(
  rows: { row: ProjectionRow; sourceId: string }[],
  pick: (row: ProjectionRow) => number | undefined,
  mode: ProjectionConfiguration["mode"],
  primarySourceId: string | undefined,
): number | undefined {
  const available = rows
    .map(({ row, sourceId }) => ({ value: pick(row), sourceId }))
    .filter((entry): entry is { value: number; sourceId: string } =>
      typeof entry.value === "number" && Number.isFinite(entry.value),
    );
  if (available.length === 0) return undefined;

  if (mode === "primary-supplemental" && primarySourceId) {
    const fromPrimary = available.filter((entry) => entry.sourceId === primarySourceId);
    if (fromPrimary.length > 0) return mergeNumbers(fromPrimary).value;
  }
  return mergeNumbers(available).value;
}

export type PlayerPool = {
  players: Player[];
  byId: Record<string, Player>;
  /** Sources that actually contributed at least one row. */
  contributingSourceIds: string[];
};

/**
 * Build the draft-relevant player pool from the imported sources under the
 * active configuration. Ordering is by merged rank, falling back to ADP;
 * players with neither sort last and keep no rank at all.
 */
export function buildPlayerPool(
  datasets: ProjectionDataset[],
  config: ProjectionConfiguration,
): PlayerPool {
  const { primary, included } = activeDatasets(datasets, config);
  const primaryId = primary?.source.id;

  const grouped = new Map<string, { row: ProjectionRow; sourceId: string }[]>();
  for (const dataset of included) {
    for (const row of dataset.rows) {
      const existing = grouped.get(row.matchKey);
      const entry = { row, sourceId: dataset.source.id };
      if (existing) existing.push(entry);
      else grouped.set(row.matchKey, [entry]);
    }
  }

  const merged = [...grouped.entries()].map(([matchKey, rows]) => {
    const { stats, coverage } = mergeStats(rows, config.mode, primaryId);

    const positionSet = new Set<Position>();
    for (const { row } of rows) for (const position of row.positions) positionSet.add(position);
    const positions = [...positionSet];

    const preferred =
      rows.find((entry) => entry.sourceId === primaryId)?.row ?? rows[0].row;

    const rankValue = mergeScalar(rows, (row) => row.rank, config.mode, primaryId);
    const adp = mergeScalar(rows, (row) => row.adp, config.mode, primaryId);
    const gamesPlayed = mergeScalar(rows, (row) => row.gamesPlayed, config.mode, primaryId);

    return {
      matchKey,
      name: preferred.name,
      team: rows.find((entry) => entry.row.team)?.row.team,
      positions: positions.length > 0 ? positions : preferred.positions,
      primary: preferred.positions[0] ?? positions[0] ?? ("C" as Position),
      rankValue,
      adp,
      gamesPlayed,
      stats,
      coverage,
    };
  });

  merged.sort((a, b) => {
    const left = a.rankValue ?? a.adp ?? Number.POSITIVE_INFINITY;
    const right = b.rankValue ?? b.adp ?? Number.POSITIVE_INFINITY;
    if (left !== right) return left - right;
    return a.name.localeCompare(b.name);
  });

  const players: Player[] = merged.map((entry, index) => {
    const ranked = entry.rankValue !== undefined || entry.adp !== undefined;
    return {
      id: entry.matchKey,
      name: entry.name,
      matchKey: entry.matchKey,
      team: entry.team,
      eligibility: {
        primary: entry.positions.includes(entry.primary) ? entry.primary : entry.positions[0],
        positions: entry.positions,
      },
      rank: ranked ? index + 1 : undefined,
      adp: entry.adp !== undefined ? Math.round(entry.adp) : undefined,
      gamesPlayed: entry.gamesPlayed !== undefined ? Math.round(entry.gamesPlayed) : undefined,
      stats: entry.stats,
      coverage: entry.coverage,
    };
  });

  return {
    players,
    byId: Object.fromEntries(players.map((player) => [player.id, player])),
    contributingSourceIds: included.map((dataset) => dataset.source.id),
  };
}
