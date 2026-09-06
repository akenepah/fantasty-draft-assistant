"use client";

import { IconChevronDown, IconSettings } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { BrandMark } from "./BrandMark";
import { SidebarNav } from "./SidebarNav";
import { useAppState } from "./AppStateProvider";

/**
 * The one desktop shell wrapping all five destinations: a 58px masthead,
 * a fixed 212px left navigation, and a fluid content column. Identical
 * dimensions on every screen — that repetition is what makes the product
 * read as a single application.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { state, derived } = useAppState();
  const managed = state.league.franchises.find(
    (franchise) => franchise.id === state.league.managedFranchiseId,
  );
  const initials = (managed?.name ?? "My Team")
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="fh-app flex min-h-screen flex-col">
      <header className="flex h-[58px] shrink-0 items-center justify-between gap-6 border-b border-fh-border bg-fh-surface pr-6 pl-5">
        <div className="flex items-center gap-3">
          <BrandMark size={30} />
          <span className="text-[19px] leading-6 font-bold text-fh-ink">
            Fantasy Hockey Draft Assistant
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              aria-label="Active league"
              value={state.league.id}
              onChange={() => undefined}
              className="h-9 w-[300px] appearance-none rounded-fh-control border border-fh-border-strong bg-fh-surface pr-9 pl-3 text-fh-body text-fh-ink"
            >
              <option value={state.league.id}>{state.league.name}</option>
            </select>
            <IconChevronDown
              size={16}
              stroke={1.8}
              aria-hidden
              className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-fh-ink-2"
            />
          </div>

          <span className="hidden text-fh-meta text-fh-ink-2 xl:block">
            {derived.draft.pointer.recordedPicks}/{derived.draft.pointer.totalPicks} picks
          </span>

          <button
            type="button"
            className="flex h-9 items-center gap-2 rounded-fh-control px-2 text-fh-body font-medium text-fh-ink-2 transition-colors hover:bg-fh-subtle hover:text-fh-ink"
          >
            <IconSettings size={18} stroke={1.8} aria-hidden />
            Settings
          </button>

          <span
            aria-label={`Managing ${managed?.name ?? "your team"}`}
            title={managed?.name}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-fh-inverse text-fh-label font-semibold text-white"
          >
            {initials || "MT"}
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <SidebarNav />
        <main className="min-w-0 flex-1 bg-fh-bg p-6">{children}</main>
      </div>
    </div>
  );
}
