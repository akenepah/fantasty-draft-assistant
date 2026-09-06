"use client";

import {
  IconArrowLeft,
  IconArrowRight,
  IconChevronRight,
  IconFileSpreadsheet,
  IconInfoCircle,
  IconPlus,
  IconRefresh,
  IconTrash,
  IconWand,
} from "@tabler/icons-react";
import { useCallback, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, PanelCard, SectionCard, SubPanel } from "@/components/ui/SectionCard";
import {
  FieldLabel,
  FormField,
  RadioField,
  SelectField,
  TextInput,
} from "@/components/ui/Fields";
import {
  LinkButton,
  PrimaryButton,
  SecondaryButton,
  SmallButton,
} from "@/components/ui/Button";
import { ColumnMappingRow } from "@/components/ui/ColumnMappingRow";
import { FileUpload } from "@/components/ui/FileUpload";
import { StatusPill } from "@/components/ui/StatusPill";
import { Toast, type ToastMessage } from "@/components/ui/Toast";
import { Unavailable } from "@/components/ui/Unavailable";
import { cn } from "@/components/ui/cn";
import { useAppState } from "@/components/AppStateProvider";
import { CATEGORY_DEFINITIONS } from "@/lib/domain/categories";
import { SEASONS } from "@/lib/domain/state";
import {
  autoDetectMapping,
  buildProjectionRows,
  loadWorkbook,
  missingRequiredFields,
  type ColumnMapping,
  type RawSheet,
  type Workbook,
} from "@/lib/domain/workbook";
import type { CategoryKey, ProjectionMode } from "@/lib/domain/types";

const DRAFT_FIELDS = [
  { id: "rank", label: "Overall Rank" },
  { id: "adp", label: "Yahoo ADP" },
  { id: "gamesPlayed", label: "Games Played" },
] as const;

/** Stats shown by default; the rest sit behind "Map Additional Columns". */
const PRIMARY_STATS: CategoryKey[] = ["G", "A", "PPP", "SOG", "HIT", "BLK", "PIM"];

const MODE_OPTIONS: { value: ProjectionMode; label: string; description: string }[] = [
  {
    value: "single",
    label: "Single source",
    description: "Use one analyst's rankings and projections as the sole source.",
  },
  {
    value: "consensus",
    label: "Equal-Weight Consensus",
    description:
      "Average every included source that provides a value. Sources missing a stat are skipped, never counted as zero.",
  },
  {
    value: "primary-supplemental",
    label: "Primary + Supplemental",
    description:
      "One source provides the values; the others fill only the fields it leaves empty.",
  },
];

/**
 * Import Rankings.
 *
 * The user picks a file off their own machine and maps its columns; nothing
 * is fetched, and there is no Yahoo import or sync. Saving turns the sheet
 * into an independent projection source that the whole app can then blend
 * with the others.
 */
export default function ImportRankingsPage() {
  const { state, dispatch, derived } = useAppState();
  const [analyst, setAnalyst] = useState("");
  const [season, setSeason] = useState(SEASONS[0]);
  const [projectionSet, setProjectionSet] = useState("");
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const [workbook, setWorkbook] = useState<Workbook | null>(null);
  const [sheet, setSheet] = useState<RawSheet | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({ stats: {} });
  const [showAdditional, setShowAdditional] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSheet = useCallback(async (book: Workbook, sheetName: string) => {
    const raw = await book.readSheet(sheetName);
    setSheet(raw);
    setMapping(autoDetectMapping(raw.columns));
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      try {
        const book = await loadWorkbook(file);
        setWorkbook(book);
        if (book.sheetNames.length === 0) throw new Error("That file has no readable sheets.");
        await loadSheet(book, book.sheetNames[0]);
        if (!analyst) setAnalyst(file.name.replace(/\.[^.]+$/, ""));
      } catch (caught) {
        setWorkbook(null);
        setSheet(null);
        setError(caught instanceof Error ? caught.message : "That file could not be read.");
      } finally {
        setBusy(false);
      }
    },
    [analyst, loadSheet],
  );

  const mapped = useMemo(
    () => (sheet ? buildProjectionRows(sheet, mapping) : null),
    [sheet, mapping],
  );

  const missing = missingRequiredFields(mapping);
  const canSave = Boolean(sheet && mapped && mapped.rows.length > 0 && missing.length === 0);

  const statFields = showAdditional
    ? CATEGORY_DEFINITIONS.map((definition) => definition.key)
    : PRIMARY_STATS;

  const setField = (field: keyof Omit<ColumnMapping, "stats">, value: string) =>
    setMapping((current) => ({ ...current, [field]: value || undefined }));

  const setStat = (key: CategoryKey, value: string) =>
    setMapping((current) => {
      const stats = { ...current.stats };
      if (value) stats[key] = value;
      else delete stats[key];
      return { ...current, stats };
    });

  const save = () => {
    if (!sheet || !mapped || !workbook) return;
    const id = `src-${Date.now().toString(36)}`;
    dispatch({
      type: "sources/add",
      dataset: {
        source: {
          id,
          analyst: analyst.trim() || "Unnamed source",
          projectionSet: projectionSet.trim() || sheet.name,
          season,
          fileName: workbook.fileName,
          sheetName: sheet.name,
          importedAt: new Date().toISOString(),
          rowCount: mapped.rows.length,
        },
        rows: mapped.rows,
      },
    });
    setToast({
      id: Date.now(),
      message: `Imported ${mapped.rows.length} players from ${workbook.fileName}`,
    });
    setWorkbook(null);
    setSheet(null);
    setMapping({ stats: {} });
    setProjectionSet("");
  };

  const config = state.projectionConfig;
  const poolSize = derived.draft.pool.players.length;

  return (
    <>
      <PageHeader
        title="Import Rankings"
        description="Upload and map your analyst projections or rankings. You can import multiple sources and choose how to use them."
      />

      <div className="grid grid-cols-[minmax(0,1fr)_312px] items-start gap-4">
        <div className="flex flex-col gap-4">
          {/* ---------------- 1. Analyst source & workbook ---------------- */}
          <SectionCard
            title="1. Analyst Source & Workbook"
            description="Enter the source details and upload your workbook. Files are read in your browser and never uploaded anywhere."
          >
            <div className="grid grid-cols-[minmax(0,318px)_12px_minmax(0,192px)_minmax(0,1fr)] items-start gap-3">
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-[minmax(0,1fr)_132px] gap-3">
                  <FormField label="Analyst / Source Name" htmlFor="analyst">
                    <TextInput
                      id="analyst"
                      value={analyst}
                      placeholder="e.g. Dom Luszczyszyn"
                      onChange={(event) => setAnalyst(event.target.value)}
                    />
                  </FormField>
                  <FormField label="Season" htmlFor="season">
                    <SelectField
                      id="season"
                      value={season}
                      onChange={(event) => setSeason(event.target.value)}
                      options={SEASONS.map((value) => ({ value, label: value }))}
                    />
                  </FormField>
                </div>
                <FormField label="Projection Set Name (Optional)" htmlFor="projection-set">
                  <TextInput
                    id="projection-set"
                    value={projectionSet}
                    placeholder="e.g. 2026–27 projections"
                    onChange={(event) => setProjectionSet(event.target.value)}
                  />
                </FormField>
              </div>

              <div className="flex h-[92px] items-center justify-center">
                <IconChevronRight
                  size={18}
                  stroke={1.8}
                  aria-hidden
                  className="text-fh-ink-disabled"
                />
              </div>

              <div>
                <FieldLabel>Workbook File</FieldLabel>
                <div className="mt-2">
                  <FileUpload onFileSelected={handleFile} />
                </div>
              </div>

              <div>
                {busy && (
                  <Card className="p-3">
                    <p className="text-fh-compact text-fh-ink-2">Reading workbook…</p>
                  </Card>
                )}

                {error && (
                  <Card className="p-3">
                    <p className="text-fh-compact font-semibold text-fh-ink">
                      Could not read that file
                    </p>
                    <p className="mt-1 text-fh-meta text-fh-ink-2">{error}</p>
                  </Card>
                )}

                {workbook && sheet && !busy && (
                  <>
                    <Card className="p-3">
                      <div className="flex gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-fh-control border border-fh-border bg-fh-subtle">
                          <IconFileSpreadsheet
                            size={18}
                            stroke={1.7}
                            aria-hidden
                            className="text-fh-ink-2"
                          />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-fh-compact font-semibold text-fh-ink">
                            {workbook.fileName}
                          </p>
                          <p className="mt-0.5 text-fh-meta text-fh-ink-2">
                            {workbook.sheetNames.length} sheet
                            {workbook.sheetNames.length === 1 ? "" : "s"} found
                          </p>
                          <p className="text-fh-meta text-fh-ink-2">
                            {sheet.rows.length} data rows
                          </p>
                          <LinkButton
                            className="mt-2"
                            onClick={() => {
                              setWorkbook(null);
                              setSheet(null);
                              setMapping({ stats: {} });
                            }}
                          >
                            <IconRefresh size={14} stroke={1.8} aria-hidden />
                            Replace File
                          </LinkButton>
                        </div>
                      </div>
                    </Card>

                    <div className="mt-3">
                      <FormField label="Select Sheet" htmlFor="sheet">
                        <SelectField
                          id="sheet"
                          value={sheet.name}
                          onChange={(event) => void loadSheet(workbook, event.target.value)}
                          options={workbook.sheetNames.map((value) => ({
                            value,
                            label: value,
                          }))}
                        />
                      </FormField>
                    </div>
                  </>
                )}

                {!workbook && !busy && !error && (
                  <Card className="p-3">
                    <p className="text-fh-compact text-fh-ink-2">
                      Choose an .xlsx, .csv or .tsv file to begin. Its first row is read as the
                      header.
                    </p>
                  </Card>
                )}
              </div>
            </div>

            {sheet && (
              <div className="mt-5">
                <p className="text-fh-compact font-semibold text-fh-ink">
                  Preview{" "}
                  <span className="font-normal text-fh-ink-2">
                    (first {Math.min(5, sheet.rows.length)} of {sheet.rows.length} rows)
                  </span>
                </p>
                <div className="fh-scroll mt-2 overflow-x-auto rounded-fh-card border border-fh-border">
                  <table className="w-full border-collapse text-fh-compact">
                    <thead>
                      <tr>
                        {sheet.columns.map((column) => (
                          <th
                            key={column}
                            scope="col"
                            className="border-b border-fh-border bg-fh-subtle px-3 py-2 text-left text-fh-label font-semibold whitespace-nowrap text-fh-ink-2"
                          >
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sheet.rows.slice(0, 5).map((row, index) => (
                        <tr key={index} className="border-b border-fh-border last:border-b-0">
                          {sheet.columns.map((column, columnIndex) => (
                            <td
                              key={column}
                              className="h-8 px-3 whitespace-nowrap text-fh-ink"
                            >
                              {row[columnIndex] ?? ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </SectionCard>

          {/* ---------------- 2. Column mapping ---------------- */}
          <SectionCard
            title="2. Map Rankings & Projections"
            description="Match your workbook columns to the correct fields. We'll auto-detect what we can."
            action={
              <SmallButton
                disabled={!sheet}
                onClick={() => {
                  if (!sheet) return;
                  setMapping(autoDetectMapping(sheet.columns));
                  setToast({ id: Date.now(), message: "Columns re-detected from the sheet." });
                }}
              >
                <IconWand size={16} stroke={1.8} aria-hidden />
                Auto-Detect Columns
              </SmallButton>
            }
          >
            {!sheet ? (
              <Unavailable title="No workbook loaded">
                Upload a file above and its columns will appear here for mapping.
              </Unavailable>
            ) : (
              <>
                <div className="grid grid-cols-3 items-start gap-3">
                  <SubPanel
                    title="Required Fields"
                    description="These fields are required to import."
                    bodyClassName="flex flex-col gap-3"
                  >
                    <ColumnMappingRow
                      label="Player Name"
                      value={mapping.name ?? ""}
                      columns={sheet.columns}
                      onChange={(value) => setField("name", value)}
                    />
                    <ColumnMappingRow
                      label="Position"
                      value={mapping.positions ?? ""}
                      columns={sheet.columns}
                      onChange={(value) => setField("positions", value)}
                    />
                    <ColumnMappingRow
                      label="NHL Team"
                      value={mapping.team ?? ""}
                      columns={sheet.columns}
                      optional
                      onChange={(value) => setField("team", value)}
                    />
                    {missing.length > 0 && (
                      <p className="text-fh-meta text-fh-ink-2">
                        Still needed: {missing.join(", ")}.
                      </p>
                    )}
                  </SubPanel>

                  <SubPanel
                    title="Ranking & Draft Fields"
                    description="Select the columns for rankings and draft data."
                    bodyClassName="flex flex-col gap-3"
                  >
                    {DRAFT_FIELDS.map((field) => (
                      <ColumnMappingRow
                        key={field.id}
                        label={field.label}
                        value={mapping[field.id] ?? ""}
                        columns={sheet.columns}
                        optional
                        onChange={(value) => setField(field.id, value)}
                      />
                    ))}
                  </SubPanel>

                  <SubPanel
                    title="Projection / Stat Fields"
                    description="Select the columns for the stats you want to use."
                    bodyClassName="flex flex-col gap-3"
                  >
                    {statFields.map((key) => {
                      const definition = CATEGORY_DEFINITIONS.find(
                        (candidate) => candidate.key === key,
                      )!;
                      return (
                        <ColumnMappingRow
                          key={key}
                          label={`${definition.label} (${definition.short})`}
                          value={mapping.stats[key] ?? ""}
                          columns={sheet.columns}
                          optional
                          onChange={(value) => setStat(key, value)}
                        />
                      );
                    })}
                    {!showAdditional && (
                      <SmallButton className="w-full" onClick={() => setShowAdditional(true)}>
                        <IconPlus size={16} stroke={1.8} aria-hidden />
                        Map Additional Columns
                      </SmallButton>
                    )}
                  </SubPanel>
                </div>

                {mapped && (
                  <p className="mt-4 text-fh-meta text-fh-ink-2">
                    {mapped.rows.length} player rows ready to import
                    {mapped.skipped > 0 && `, ${mapped.skipped} skipped with no player name`}.
                    Blank cells stay unknown — they are never read as zero.
                  </p>
                )}
              </>
            )}
          </SectionCard>
        </div>

        {/* ---------------- Right rail ---------------- */}
        <aside className="flex flex-col gap-4">
          <PanelCard
            title="Imported Sources"
            description="These are the analyst files you've imported. You can import multiple sources and choose how to use them."
            bodyClassName="flex flex-col gap-2"
          >
            {state.sources.length === 0 && (
              <p className="text-fh-meta text-fh-ink-2">No sources imported yet.</p>
            )}

            {state.sources.map((dataset) => {
              const included = config.includedSourceIds.includes(dataset.source.id);
              return (
                <div
                  key={dataset.source.id}
                  className={cn(
                    "flex items-start gap-2 rounded-fh-card border p-2.5",
                    included ? "border-fh-border-strong bg-fh-subtle" : "border-fh-border bg-fh-surface",
                  )}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-fh-control border border-fh-border bg-fh-surface">
                    <IconFileSpreadsheet
                      size={17}
                      stroke={1.7}
                      aria-hidden
                      className="text-fh-ink-2"
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-fh-compact font-semibold text-fh-ink">
                      {dataset.source.analyst}
                    </span>
                    <span className="block truncate text-fh-meta text-fh-ink-2">
                      {dataset.source.projectionSet}
                    </span>
                    <span className="block text-fh-meta text-fh-ink-muted">
                      {dataset.source.rowCount} players
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusPill tone={dataset.source.sample ? "quiet" : "medium"} size="sm">
                      {dataset.source.sample ? "Sample" : "Imported"}
                    </StatusPill>
                    <button
                      type="button"
                      aria-label={`Remove ${dataset.source.analyst}`}
                      onClick={() =>
                        dispatch({ type: "sources/remove", sourceId: dataset.source.id })
                      }
                      className="text-fh-ink-muted transition-colors hover:text-fh-ink"
                    >
                      <IconTrash size={15} stroke={1.8} aria-hidden />
                    </button>
                  </div>
                </div>
              );
            })}
          </PanelCard>

          <PanelCard
            title="Active Rankings Configuration"
            description="Choose how to use your imported sources for draft recommendations and analysis."
            bodyClassName="flex flex-col gap-3"
          >
            {MODE_OPTIONS.map((option) => (
              <RadioField
                key={option.value}
                name="active-config"
                label={option.label}
                description={option.description}
                checked={config.mode === option.value}
                onChange={() =>
                  dispatch({
                    type: "sources/setConfig",
                    config: { ...config, mode: option.value },
                  })
                }
              />
            ))}

            {state.sources.length > 0 && (
              <div className="border-t border-fh-border pt-3">
                <FieldLabel htmlFor="primary-source">
                  {config.mode === "single" ? "Source" : "Primary source"}
                </FieldLabel>
                <div className="mt-2">
                  <SelectField
                    id="primary-source"
                    value={config.primarySourceId ?? ""}
                    onChange={(event) =>
                      dispatch({
                        type: "sources/setConfig",
                        config: { ...config, primarySourceId: event.target.value },
                      })
                    }
                    options={state.sources.map((dataset) => ({
                      value: dataset.source.id,
                      label: dataset.source.analyst,
                    }))}
                  />
                </div>

                {config.mode !== "single" && (
                  <div className="mt-3">
                    <FieldLabel>Included sources</FieldLabel>
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {state.sources.map((dataset) => (
                        <li key={dataset.source.id} className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            id={`include-${dataset.source.id}`}
                            checked={config.includedSourceIds.includes(dataset.source.id)}
                            onChange={(event) =>
                              dispatch({
                                type: "sources/setConfig",
                                config: {
                                  ...config,
                                  includedSourceIds: event.target.checked
                                    ? [...config.includedSourceIds, dataset.source.id]
                                    : config.includedSourceIds.filter(
                                        (id) => id !== dataset.source.id,
                                      ),
                                },
                              })
                            }
                            className="h-4 w-4 shrink-0 rounded-[3px] border-fh-border-strong accent-fh-button"
                          />
                          <label
                            htmlFor={`include-${dataset.source.id}`}
                            className="text-fh-compact text-fh-ink"
                          >
                            {dataset.source.analyst}
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2.5 rounded-fh-card border border-fh-border bg-fh-subtle p-3">
              <IconInfoCircle
                size={18}
                stroke={1.7}
                aria-hidden
                className="mt-px shrink-0 text-fh-ink-2"
              />
              <p className="text-fh-meta text-fh-ink-2">
                <span className="font-semibold text-fh-ink">Active pool:</span> {poolSize} players.
                A source that omits a stat contributes nothing to it — missing values are never
                averaged in as zero. Custom numeric weighting (e.g. 70/30) is not part of this MVP.
              </p>
            </div>
          </PanelCard>
        </aside>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <SecondaryButton onClick={() => history.back()}>
          <IconArrowLeft size={18} stroke={1.8} aria-hidden />
          Back
        </SecondaryButton>
        <PrimaryButton disabled={!canSave} onClick={save}>
          Save &amp; Use Rankings
          <IconArrowRight size={18} stroke={1.8} aria-hidden />
        </PrimaryButton>
      </div>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
