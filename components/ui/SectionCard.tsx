import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * The one surface primitive. Every panel in the assistant is a Card; the
 * variants below only change padding and heading weight, never the border,
 * radius or shadow — that consistency is what holds the five screens
 * together visually.
 */
export function Card({
  className,
  children,
  as: Tag = "div",
}: {
  className?: string;
  children: ReactNode;
  as?: "div" | "section" | "aside";
}) {
  return (
    <Tag
      className={cn(
        "rounded-fh-card border border-fh-border bg-fh-surface shadow-[0_1px_2px_rgba(0,0,0,.04)]",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/** A numbered top-level section of a page (League Setup, Import Rankings). */
export function SectionCard({
  title,
  description,
  action,
  className,
  bodyClassName,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <Card as="section" className={cn("p-5", className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-fh-section font-bold text-fh-ink">{title}</h2>
          {description && <p className="mt-1 text-fh-body text-fh-ink-2">{description}</p>}
        </div>
        {action}
      </div>
      <div className={cn("mt-4", bodyClassName)}>{children}</div>
    </Card>
  );
}

/** A card-level panel: 16px heading, 12px gap to body. */
export function PanelCard({
  title,
  description,
  action,
  className,
  bodyClassName,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn("flex flex-col p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-fh-card font-semibold text-fh-ink">{title}</h3>
          {description && <p className="mt-1 text-fh-meta text-fh-ink-2">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className={cn("mt-3 min-h-0", bodyClassName)}>{children}</div>
    </Card>
  );
}

/**
 * A framed sub-group inside a section (Roster Positions, Skater Categories,
 * Required Fields). Subtle header strip, thin border, no shadow.
 */
export function SubPanel({
  title,
  description,
  className,
  bodyClassName,
  children,
}: {
  title: string;
  description?: string;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("overflow-hidden rounded-fh-card border border-fh-border", className)}>
      <div className="border-b border-fh-border bg-fh-subtle px-4 py-2.5">
        <h4 className="text-fh-compact font-semibold text-fh-ink">{title}</h4>
        {description && <p className="mt-0.5 text-fh-meta text-fh-ink-2">{description}</p>}
      </div>
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </div>
  );
}
