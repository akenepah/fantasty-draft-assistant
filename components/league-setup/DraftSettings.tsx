"use client";

import { IconAlertTriangle, IconGripVertical } from "@tabler/icons-react";
import { useState } from "react";
import { SectionCard } from "../ui/SectionCard";
import { FormField, SelectField, TextInput } from "../ui/Fields";
import { teamAbbreviation } from "../ui/TeamBadge";
import { cn } from "../ui/cn";
import { useAppState } from "../AppStateProvider";
import { totalRosterSpots } from "@/lib/domain/state";

/**
 * Draft Settings. Only the round-one order is configured here; the snake
 * order for every later round is derived from it, and the frozen pick
 * schedule the Draft Room runs on is regenerated whenever any of this
 * changes.
 */
export function DraftSettings() {
  const { state, dispatch, derived } = useAppState();
  const { league } = state;
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const nameFor = (id: string) =>
    league.franchises.find((franchise) => franchise.id === id)?.name ?? id;

  const move = (from: number, to: number) => {
    if (to < 0 || to >= league.draftOrder.length || from === to) return;
    const next = [...league.draftOrder];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    dispatch({ type: "league/setDraftOrder", order: next });
  };

  const totalPicks = league.rounds * league.teamCount;
  const spots = totalRosterSpots(league.roster);
  const recorded = derived.draft.pointer.recordedPicks;

  return (
    <SectionCard
      title="3. Draft Settings"
      description="Set your draft format, number of rounds, and draft order."
      bodyClassName="grid grid-cols-[minmax(0,440px)_minmax(0,1fr)] items-start gap-6"
    >
      <div>
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Draft Type" htmlFor="draft-type">
            <SelectField
              id="draft-type"
              value={league.draftType}
              onChange={() => undefined}
              options={[{ value: "snake", label: "Snake" }]}
            />
          </FormField>
          <FormField label="League Type" htmlFor="league-type">
            <SelectField
              id="league-type"
              value={league.leagueType}
              onChange={(event) =>
                dispatch({
                  type: "league/setLeagueType",
                  leagueType: event.target.value as "redraft" | "keeper",
                })
              }
              options={[
                { value: "redraft", label: "Redraft" },
                { value: "keeper", label: "Keeper" },
              ]}
            />
          </FormField>
          <FormField label="Number of Rounds" htmlFor="rounds">
            <TextInput
              id="rounds"
              type="number"
              inputMode="numeric"
              min={1}
              max={40}
              value={league.rounds}
              onChange={(event) =>
                dispatch({ type: "league/setRounds", rounds: Number(event.target.value) || 1 })
              }
            />
          </FormField>
        </div>

        <p className="mt-3 text-fh-meta text-fh-ink-2">
          {totalPicks} total picks across {league.teamCount} teams.
          {league.rounds !== spots &&
            ` Rounds and roster spots differ — ${spots} spots means ${
              league.rounds > spots
                ? `${league.rounds - spots} pick(s) per team will not fit the roster`
                : `${spots - league.rounds} roster spot(s) will finish the draft empty`
            }.`}
        </p>

        {recorded > 0 && (
          <div className="mt-3 flex gap-2.5 rounded-fh-card border border-fh-border bg-fh-subtle p-3">
            <IconAlertTriangle
              size={18}
              stroke={1.7}
              aria-hidden
              className="mt-px shrink-0 text-fh-ink-2"
            />
            <p className="text-fh-meta text-fh-ink-2">
              A draft is already in progress ({recorded} picks recorded). Changing the team count,
              round count or order rebuilds the pick schedule, and any pick that no longer fits it
              is dropped.
            </p>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-fh-compact font-semibold text-fh-ink">Draft Order</h3>
        <p className="mt-1 text-fh-meta text-fh-ink-2">
          Set the order for Round 1. The draft will automatically snake each round.
        </p>

        <ol className="mt-3 flex flex-wrap gap-1.5">
          {league.draftOrder.map((franchiseId, index) => (
            <li key={franchiseId} className="flex flex-col items-center gap-1">
              <span className="text-fh-label text-fh-ink-2">{index + 1}</span>
              <button
                type="button"
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (dragIndex !== null) move(dragIndex, index);
                  setDragIndex(null);
                }}
                onDragEnd={() => setDragIndex(null)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowLeft") {
                    event.preventDefault();
                    move(index, index - 1);
                  }
                  if (event.key === "ArrowRight") {
                    event.preventDefault();
                    move(index, index + 1);
                  }
                }}
                aria-label={`${nameFor(franchiseId)}, pick ${index + 1}. Use the left and right arrow keys to reorder.`}
                className={cn(
                  "flex h-8 w-[46px] cursor-grab items-center justify-center",
                  "rounded-fh-control border border-fh-border-strong bg-fh-surface",
                  "text-fh-label font-semibold text-fh-ink transition-colors hover:bg-fh-subtle",
                  dragIndex === index && "border-fh-inverse bg-fh-selected",
                )}
              >
                <IconGripVertical
                  size={12}
                  stroke={1.8}
                  aria-hidden
                  className="-ml-1.5 shrink-0 text-fh-ink-muted"
                />
                {teamAbbreviation(nameFor(franchiseId))}
              </button>
            </li>
          ))}
        </ol>
      </div>
    </SectionCard>
  );
}
