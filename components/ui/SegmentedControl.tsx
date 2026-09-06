"use client";

import { cn } from "./cn";

export type Segment<T extends string> = { value: T; label: string };

/**
 * Grayscale segmented control. Selection reads as a dark fill inside a light
 * track — the app's one "strong selected" surface, used for team count,
 * scoring format, and the analytics view switchers.
 */
export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  label,
  size = "md",
  className,
}: {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex rounded-fh-control border border-fh-border-strong bg-fh-surface p-0.5",
        className,
      )}
    >
      {segments.map((segment) => {
        const selected = segment.value === value;
        return (
          <button
            key={segment.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(segment.value)}
            className={cn(
              "rounded-[4px] font-medium transition-colors",
              size === "sm" ? "h-7 px-3 text-fh-compact" : "h-8 px-4 text-fh-body",
              selected
                ? "bg-fh-inverse text-white"
                : "text-fh-ink-2 hover:bg-fh-subtle hover:text-fh-ink",
            )}
          >
            {segment.label}
          </button>
        );
      })}
    </div>
  );
}
