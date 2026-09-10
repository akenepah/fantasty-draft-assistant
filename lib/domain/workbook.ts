import { CATEGORY_DEFINITIONS } from "./categories";
import { matchKeyFor } from "./projections";
import { POSITIONS, type CategoryKey, type Position, type ProjectionRow } from "./types";

/**
 * Reading an analyst's workbook and turning it into projection rows.
 *
 * Everything here runs in the browser against a file the user picked — the
 * app never fetches projections from anywhere, and there is no Yahoo import
 * or sync of any kind.
 */

export type RawSheet = {
  name: string;
  columns: string[];
  rows: string[][];
};

export type Workbook = {
  fileName: string;
  sheetNames: string[];
  readSheet: (sheetName: string) => Promise<RawSheet>;
};

/* -------------------------------------------------------------------------
 * Delimited text
 * ---------------------------------------------------------------------- */

/** RFC4180-style parse: honours quoted fields, embedded delimiters and "". */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((entry) => entry.some((cell) => cell.trim().length > 0));
}

function sheetFromMatrix(name: string, matrix: string[][]): RawSheet {
  const [header = [], ...body] = matrix;
  const columns = header.map((cell, index) => cell.trim() || `Column ${index + 1}`);
  return { name, columns, rows: body };
}

/* -------------------------------------------------------------------------
 * Workbook loading
 * ---------------------------------------------------------------------- */

export async function loadWorkbook(file: File): Promise<Workbook> {
  const lower = file.name.toLowerCase();

  if (lower.endsWith(".csv") || lower.endsWith(".tsv") || lower.endsWith(".txt")) {
    const delimiter = lower.endsWith(".csv") ? "," : "\t";
    const text = await file.text();
    const sheet = sheetFromMatrix("Sheet 1", parseDelimited(text, delimiter));
    return {
      fileName: file.name,
      sheetNames: [sheet.name],
      readSheet: async () => sheet,
    };
  }

  // One pass yields every sheet with its rows, so switching sheets in the
  // mapper does not re-read the file.
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  const workbook = await readXlsxFile(file);

  const parsed = new Map<string, RawSheet>();
  for (const sheet of workbook) {
    const matrix = sheet.data.map((row) =>
      row.map((cell) => (cell === null || cell === undefined ? "" : String(cell))),
    );
    parsed.set(sheet.sheet, sheetFromMatrix(sheet.sheet, matrix));
  }

  const sheetNames = [...parsed.keys()];

  return {
    fileName: file.name,
    sheetNames,
    readSheet: async (sheetName: string) => {
      const sheet = parsed.get(sheetName) ?? parsed.get(sheetNames[0]);
      if (!sheet) throw new Error(`No readable sheets in ${file.name}.`);
      return sheet;
    },
  };
}

/* -------------------------------------------------------------------------
 * Column mapping
 * ---------------------------------------------------------------------- */

export type ColumnMapping = {
  name?: string;
  team?: string;
  positions?: string;
  rank?: string;
  adp?: string;
  gamesPlayed?: string;
  keeperFlag?: string;
  stats: Partial<Record<CategoryKey, string>>;
};

const FIELD_ALIASES: Record<string, string[]> = {
  name: ["player", "name", "player name", "skater", "goalie", "full name"],
  team: ["team", "nhl team", "tm", "club"],
  positions: ["pos", "position", "positions", "eligibility", "elig"],
  rank: ["rank", "overall rank", "rk", "ovr", "overall"],
  adp: ["adp", "yahoo adp", "avg draft position", "average draft position"],
  gamesPlayed: ["gp", "games", "games played"],
  keeperFlag: ["keep", "keep?", "keeper", "keeper?", "kept"],
};

/** Cell values a keeper column uses to mean yes. */
const KEEPER_TRUE = new Set(["y", "yes", "true", "1", "k", "keep", "keeper", "x"]);

export function parseKeeperFlag(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  const text = raw.trim().toLowerCase();
  if (text === "") return undefined;
  // An explicit "N" is a real answer — not kept — and distinct from a blank
  // cell, which says nothing either way.
  return KEEPER_TRUE.has(text);
}

const STAT_ALIASES: Partial<Record<CategoryKey, string[]>> = {
  G: ["g", "goals"],
  A: ["a", "assists", "ast"],
  PPP: ["ppp", "power play points", "power-play points", "pp points"],
  SOG: ["sog", "shots", "shots on goal", "s"],
  HIT: ["hit", "hits", "h"],
  BLK: ["blk", "blocks", "blocked shots", "bs"],
  PIM: ["pim", "penalty minutes", "pm"],
  FOW: ["fow", "faceoffs won", "faceoff wins", "fw"],
  PM: ["+/-", "plus minus", "plus/minus", "plusminus"],
  W: ["w", "wins"],
  SV: ["sv", "saves"],
  SVPCT: ["sv%", "svpct", "save %", "save percentage", "sp"],
  GAA: ["gaa", "goals against average"],
  SO: ["so", "shutouts", "sho"],
};

function normaliseHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[._]/g, " ").replace(/\s+/g, " ");
}

/** Best-effort header matching. Anything it misses the user maps by hand. */
export function autoDetectMapping(columns: string[]): ColumnMapping {
  const normalised = columns.map(normaliseHeader);
  const find = (aliases: string[]): string | undefined => {
    const index = normalised.findIndex((header) => aliases.includes(header));
    return index >= 0 ? columns[index] : undefined;
  };

  const stats: Partial<Record<CategoryKey, string>> = {};
  for (const definition of CATEGORY_DEFINITIONS) {
    const aliases = STAT_ALIASES[definition.key] ?? [definition.short.toLowerCase()];
    const match = find(aliases);
    if (match) stats[definition.key] = match;
  }

  return {
    name: find(FIELD_ALIASES.name),
    team: find(FIELD_ALIASES.team),
    positions: find(FIELD_ALIASES.positions),
    rank: find(FIELD_ALIASES.rank),
    adp: find(FIELD_ALIASES.adp),
    gamesPlayed: find(FIELD_ALIASES.gamesPlayed),
    keeperFlag: find(FIELD_ALIASES.keeperFlag),
    stats,
  };
}

/** Blank, "-", "—", "N/A" and friends are unknown values, never zero. */
export function parseNumber(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const text = raw.trim();
  if (text === "" || /^(-|—|–|n\/?a|na|null|undefined)$/i.test(text)) return undefined;
  const value = Number(text.replace(/[,%\s]/g, ""));
  return Number.isFinite(value) ? value : undefined;
}

export function parsePositions(raw: string | undefined): Position[] {
  if (!raw) return [];
  const tokens = raw
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter(Boolean);
  const found = tokens.filter((token): token is Position =>
    (POSITIONS as string[]).includes(token),
  );
  return [...new Set(found)];
}

export type MappedRows = {
  rows: ProjectionRow[];
  /** Rows dropped because they had no usable player name. */
  skipped: number;
};

export function buildProjectionRows(sheet: RawSheet, mapping: ColumnMapping): MappedRows {
  const indexOf = (column: string | undefined) =>
    column === undefined ? -1 : sheet.columns.indexOf(column);

  const nameIndex = indexOf(mapping.name);
  const teamIndex = indexOf(mapping.team);
  const positionsIndex = indexOf(mapping.positions);
  const rankIndex = indexOf(mapping.rank);
  const adpIndex = indexOf(mapping.adp);
  const gamesIndex = indexOf(mapping.gamesPlayed);
  const keeperIndex = indexOf(mapping.keeperFlag);

  const statIndexes = Object.entries(mapping.stats)
    .map(([key, column]) => ({ key: key as CategoryKey, index: indexOf(column) }))
    .filter((entry) => entry.index >= 0);

  const rows: ProjectionRow[] = [];
  let skipped = 0;

  for (const raw of sheet.rows) {
    const name = nameIndex >= 0 ? (raw[nameIndex] ?? "").trim() : "";
    if (!name) {
      skipped += 1;
      continue;
    }

    const stats: ProjectionRow["stats"] = {};
    for (const { key, index } of statIndexes) {
      const value = parseNumber(raw[index]);
      if (value !== undefined) stats[key] = value;
    }

    const positions = parsePositions(positionsIndex >= 0 ? raw[positionsIndex] : undefined);

    rows.push({
      matchKey: matchKeyFor(name),
      name,
      team: teamIndex >= 0 ? (raw[teamIndex] ?? "").trim() || undefined : undefined,
      // A row with no readable position still counts; it just cannot fill a
      // position slot until the user maps the column.
      positions,
      rank: rankIndex >= 0 ? parseNumber(raw[rankIndex]) : undefined,
      adp: adpIndex >= 0 ? parseNumber(raw[adpIndex]) : undefined,
      gamesPlayed: gamesIndex >= 0 ? parseNumber(raw[gamesIndex]) : undefined,
      keeperFlag: keeperIndex >= 0 ? parseKeeperFlag(raw[keeperIndex]) : undefined,
      stats,
    });
  }

  return { rows, skipped };
}

/** Required fields that must be mapped before a source can be saved. */
export function missingRequiredFields(mapping: ColumnMapping): string[] {
  const missing: string[] = [];
  if (!mapping.name) missing.push("Player Name");
  if (!mapping.positions) missing.push("Position");
  return missing;
}
