"use client";

import { IconSearch } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "./cn";
import type { Player } from "@/lib/domain/types";

/**
 * Type-ahead over the players still available.
 *
 * Recording a pick has to fit in the gap between two real selections, so
 * the whole flow is keyboard-first: type, arrow to the right name, Enter to
 * choose, Enter again to record. Already-drafted players are simply not in
 * the list handed to this component.
 */
export function PlayerSearch({
  id,
  players,
  selected,
  onSelect,
  onSubmit,
  onQueryChange,
  autoFocus,
  placeholder = "Search available players…",
}: {
  id: string;
  players: Player[];
  selected: Player | null;
  onSelect: (player: Player | null) => void;
  onSubmit: () => void;
  /** Raw text, so the caller can offer an unresolved placeholder. */
  onQueryChange?: (query: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(selected?.name ?? "");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return [];
    const matches = players.filter((player) => player.name.toLowerCase().includes(needle));
    // Prefix matches first — typing "mcd" should surface McDavid, not a
    // middle-of-name coincidence.
    matches.sort((a, b) => {
      const left = a.name.toLowerCase().startsWith(needle) ? 0 : 1;
      const right = b.name.toLowerCase().startsWith(needle) ? 0 : 1;
      return left - right || (a.rank ?? 9999) - (b.rank ?? 9999);
    });
    return matches.slice(0, 8);
  }, [players, query]);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, []);

  const choose = (player: Player) => {
    onSelect(player);
    setQuery(player.name);
    onQueryChange?.(player.name);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <IconSearch
        size={16}
        stroke={1.8}
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fh-ink-2"
      />
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        aria-autocomplete="list"
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          onQueryChange?.(event.target.value);
          setHighlight(0);
          setOpen(true);
          onSelect(null);
        }}
        onFocus={() => setOpen(query.length > 0)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setHighlight((current) => Math.min(results.length - 1, current + 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlight((current) => Math.max(0, current - 1));
          } else if (event.key === "Enter") {
            event.preventDefault();
            if (open && results[highlight]) choose(results[highlight]);
            else onSubmit();
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        className="h-[38px] w-full rounded-fh-control border border-fh-border-strong bg-fh-surface pr-3 pl-9 text-fh-body text-fh-ink placeholder:text-fh-ink-muted"
      />

      {open && results.length > 0 && (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className="fh-scroll absolute top-[42px] right-0 left-0 z-20 max-h-[260px] overflow-y-auto rounded-fh-card border border-fh-border-strong bg-fh-surface py-1 shadow-[0_1px_2px_rgba(0,0,0,.04)]"
        >
          {results.map((player, index) => (
            <li key={player.id} role="option" aria-selected={index === highlight}>
              <button
                type="button"
                onMouseEnter={() => setHighlight(index)}
                onClick={() => choose(player)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left",
                  index === highlight ? "bg-fh-selected" : "bg-transparent",
                )}
              >
                <span className="truncate text-fh-compact text-fh-ink">{player.name}</span>
                <span className="shrink-0 text-fh-meta text-fh-ink-2">
                  {player.eligibility.positions.join("/")}
                  {player.team ? ` · ${player.team}` : ""}
                  {player.rank ? ` · #${player.rank}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
