import { cn } from "./cn";

/**
 * A single category delta — "Goals +6". Used for the highest-signal
 * category impact of a recommendation; never more than three at a time.
 */
export function CategoryMetric({
  label,
  delta,
  className,
}: {
  label: string;
  delta: number;
  className?: string;
}) {
  const sign = delta > 0 ? "+" : "";
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 rounded-fh-control border border-fh-border bg-fh-subtle px-3 py-2",
        className,
      )}
    >
      <span className="min-w-0 truncate text-fh-meta text-fh-ink-2">{label}</span>
      <span className="text-fh-compact font-bold text-fh-ink tabular-nums">
        {sign}
        {delta}
      </span>
    </div>
  );
}
