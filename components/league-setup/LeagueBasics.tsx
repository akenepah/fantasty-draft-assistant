"use client";

import { SectionCard } from "../ui/SectionCard";
import { SegmentedControl } from "../ui/SegmentedControl";
import { FieldLabel, TextInput } from "../ui/Fields";
import { cn } from "../ui/cn";
import { useAppState } from "../AppStateProvider";

/**
 * League Basics. These fields are authoritative: the franchise list here is
 * the franchise list the draft board, the rosters and the standings use, and
 * changing the team count regenerates the draft schedule.
 */
export function LeagueBasics() {
  const { state, dispatch } = useAppState();
  const { league } = state;
  const rows = Math.ceil(league.franchises.length / 3);

  return (
    <SectionCard title="1. League Basics">
      <div className="flex flex-wrap items-center gap-x-10 gap-y-4">
        <div className="flex items-center gap-4">
          <FieldLabel htmlFor="league-name" className="shrink-0">
            League Name
          </FieldLabel>
          <TextInput
            id="league-name"
            value={league.name}
            onChange={(event) => dispatch({ type: "league/rename", name: event.target.value })}
            className="w-[344px]"
          />
        </div>

        <div className="flex items-center gap-4">
          <span className="shrink-0 text-fh-label font-semibold text-fh-ink">Number of Teams</span>
          <SegmentedControl
            label="Number of teams"
            value={String(league.teamCount) as "10" | "12"}
            onChange={(value) =>
              dispatch({ type: "league/setTeamCount", teamCount: Number(value) as 10 | 12 })
            }
            segments={[
              { value: "10", label: "10 Teams" },
              { value: "12", label: "12 Teams" },
            ]}
          />
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-fh-compact font-semibold text-fh-ink">Franchise Names</h3>
        <p className="mt-1 text-fh-meta text-fh-ink-2">
          Enter the name of each fantasy team. Select your team.
        </p>

        <ul
          className="mt-3 grid grid-flow-col gap-x-10 gap-y-2"
          style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
        >
          {league.franchises.map((franchise, index) => {
            const selected = franchise.id === league.managedFranchiseId;
            return (
              <li
                key={franchise.id}
                className={cn(
                  "flex items-center gap-3 rounded-fh-control px-2 py-1",
                  selected && "bg-fh-subtle",
                )}
              >
                <span className="w-4 shrink-0 text-right text-fh-compact text-fh-ink-2">
                  {index + 1}
                </span>
                <TextInput
                  aria-label={`Franchise ${index + 1} name`}
                  value={franchise.name}
                  onChange={(event) =>
                    dispatch({
                      type: "league/renameFranchise",
                      franchiseId: franchise.id,
                      name: event.target.value,
                    })
                  }
                  className="h-9 min-w-0 flex-1"
                />
                <input
                  type="radio"
                  name="my-franchise"
                  checked={selected}
                  onChange={() =>
                    dispatch({ type: "league/setManagedFranchise", franchiseId: franchise.id })
                  }
                  aria-label={`Set ${franchise.name} as your team`}
                  className="h-4 w-4 shrink-0 border-fh-border-strong accent-fh-button"
                />
              </li>
            );
          })}
        </ul>
      </div>
    </SectionCard>
  );
}
