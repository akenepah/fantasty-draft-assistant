import { cn } from "./cn";

/**
 * Restrained horizontal bar used for roster capacity and category
 * comparison. `emphasis` darkens the fill for the leading/selected row —
 * the grayscale stand-in for a highlight color.
 */
export function ProgressBar({
  value,
  max,
  label,
  emphasis = false,
  className,
}: {
  value: number;
  max: number;
  label: string;
  emphasis?: boolean;
  className?: string;
}) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div
      role="img"
      aria-label={label}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-fh-subtle", className)}
    >
      <div
        style={{ width: `${pct}%` }}
        className={cn("h-full rounded-full", emphasis ? "bg-fh-inverse" : "bg-fh-border-strong")}
      />
    </div>
  );
}
