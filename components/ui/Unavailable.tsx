import { IconInfoCircle } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * An intentional "not available yet" state.
 *
 * Analytical panels use this whenever the inputs are missing — no projection
 * source, no scored categories, nothing drafted yet. Filling the space with
 * plausible-looking numbers instead would make the app lie about what it
 * knows, which is worse than an empty panel.
 */
export function Unavailable({
  title,
  children,
  action,
  className,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-2 rounded-fh-card border border-dashed border-fh-border-strong bg-fh-subtle px-4 py-5",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <IconInfoCircle size={18} stroke={1.7} aria-hidden className="shrink-0 text-fh-ink-2" />
        <p className="text-fh-compact font-semibold text-fh-ink">{title}</p>
      </div>
      {children && <div className="text-fh-meta text-fh-ink-2">{children}</div>}
      {action}
    </div>
  );
}
