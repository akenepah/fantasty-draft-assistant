"use client";

import { SectionCard, SubPanel } from "../ui/SectionCard";
import { SegmentedControl } from "../ui/SegmentedControl";
import { CheckboxField, NumericStepper } from "../ui/Fields";
import { useAppState } from "../AppStateProvider";
import {
  GOALIE_CATEGORIES,
  ROSTER_SLOT_LABELS,
  SKATER_CATEGORIES,
} from "@/lib/domain/categories";
import { totalRosterSpots } from "@/lib/domain/state";
import type { CategoryDefinition, RosterSlot } from "@/lib/domain/types";

const LEFT_SLOTS: RosterSlot[] = ["C", "LW", "RW", "D"];
const RIGHT_SLOTS: RosterSlot[] = ["G", "UTIL", "BN"];

/**
 * Roster & Scoring. Both halves feed the engines directly: slot counts drive
 * roster capacity and what counts as a startable pick, and the scoring
 * settings decide which categories the standings and recommendations use.
 */
export function RosterScoring() {
  const { state, dispatch } = useAppState();
  const { roster, scoring } = state.league;
  const isPoints = scoring.format === "points";
  const enabled = isPoints ? scoring.pointCategories : scoring.activeCategories;

  const renderCategory = (category: CategoryDefinition) => {
    const isEnabled = enabled.includes(category.key);
    const label = `${category.label} (${category.short})`;

    // Rate stats have no per-event value, so points leagues do not score
    // them. Say so rather than offering a meaningless field.
    if (isPoints && category.rate) {
      return (
        <div key={category.key} className="flex items-center justify-between gap-3">
          <CheckboxField label={label} checked={false} disabled onChange={() => undefined} />
          <span className="shrink-0 text-fh-meta text-fh-ink-muted">Not scored</span>
        </div>
      );
    }

    if (!isPoints) {
      return (
        <CheckboxField
          key={category.key}
          label={label}
          checked={isEnabled}
          onChange={(checked) =>
            dispatch({ type: "league/toggleCategory", key: category.key, enabled: checked })
          }
        />
      );
    }

    return (
      <div key={category.key} className="flex items-center justify-between gap-3">
        <CheckboxField
          label={label}
          checked={isEnabled}
          onChange={(checked) =>
            dispatch({ type: "league/toggleCategory", key: category.key, enabled: checked })
          }
        />
        <div className="flex shrink-0 items-center gap-1.5">
          <input
            type="number"
            step="0.5"
            value={scoring.pointValues[category.key] ?? 0}
            disabled={!isEnabled}
            aria-label={`${category.label} points`}
            onChange={(event) =>
              dispatch({
                type: "league/setPointValue",
                key: category.key,
                value: Number(event.target.value) || 0,
              })
            }
            className="h-8 w-[62px] rounded-fh-control border border-fh-border-strong bg-fh-surface px-2 text-right text-fh-compact text-fh-ink disabled:bg-fh-subtle disabled:text-fh-ink-disabled"
          />
          <span className="text-fh-meta text-fh-ink-2">pts</span>
        </div>
      </div>
    );
  };

  return (
    <SectionCard
      title="2. Roster & Scoring Settings"
      description="Set your roster positions and scoring format."
      bodyClassName="grid grid-cols-[minmax(0,440px)_minmax(0,1fr)] items-start gap-6"
    >
      <SubPanel title="Roster Positions" bodyClassName="grid grid-cols-2 gap-x-6 gap-y-3">
        <div className="flex flex-col gap-3">
          {LEFT_SLOTS.map((slot) => (
            <NumericStepper
              key={slot}
              label={ROSTER_SLOT_LABELS[slot]}
              value={roster[slot]}
              min={0}
              max={12}
              onChange={(value) => dispatch({ type: "league/setRosterSlot", slot, value })}
            />
          ))}
        </div>
        <div className="flex flex-col gap-3">
          {RIGHT_SLOTS.map((slot) => (
            <NumericStepper
              key={slot}
              label={ROSTER_SLOT_LABELS[slot]}
              value={roster[slot]}
              min={0}
              max={12}
              onChange={(value) => dispatch({ type: "league/setRosterSlot", slot, value })}
            />
          ))}
          <div className="mt-1 flex items-center justify-between border-t border-fh-border pt-3">
            <span className="text-fh-compact font-semibold text-fh-ink">Total Roster Spots</span>
            <span className="text-fh-compact font-bold text-fh-ink">
              {totalRosterSpots(roster)}
            </span>
          </div>
        </div>
      </SubPanel>

      <div>
        <div className="flex flex-wrap items-center gap-4">
          <span className="shrink-0 text-fh-label font-semibold text-fh-ink">Scoring Format</span>
          <SegmentedControl
            label="Scoring format"
            value={scoring.format}
            onChange={(format) => dispatch({ type: "league/setScoringFormat", format })}
            segments={[
              { value: "categories", label: "Categories" },
              { value: "points", label: "Points" },
            ]}
          />
        </div>
        <p className="mt-2 text-fh-meta text-fh-ink-2">
          {isPoints
            ? "Set the point value awarded for each statistic you score."
            : "Select which statistical categories count in your league."}
        </p>

        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,256px)] items-start gap-4">
          <SubPanel
            title="Skater Categories"
            bodyClassName={
              isPoints
                ? "flex flex-col gap-2.5"
                : "grid grid-flow-col grid-rows-5 gap-x-5 gap-y-2.5"
            }
          >
            {SKATER_CATEGORIES.map(renderCategory)}
          </SubPanel>

          <SubPanel title="Goalie Categories" bodyClassName="flex flex-col gap-2.5">
            {GOALIE_CATEGORIES.map(renderCategory)}
          </SubPanel>
        </div>

        {enabled.length === 0 && (
          <p className="mt-3 text-fh-meta text-fh-ink-2">
            Nothing is scored yet — standings and recommendations stay unavailable until at least
            one category is selected.
          </p>
        )}
      </div>
    </SectionCard>
  );
}
