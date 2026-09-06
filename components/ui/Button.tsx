import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

type BaseProps = ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode };

const base =
  "inline-flex items-center justify-center gap-2 rounded-fh-control text-fh-body font-medium " +
  "transition-colors disabled:cursor-not-allowed";

/** Dark grayscale fill — one per screen region, the committing action. */
export function PrimaryButton({ className, children, ...props }: BaseProps) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        base,
        "h-10 bg-fh-button px-4 text-white hover:bg-fh-button-hover",
        "disabled:bg-fh-selected disabled:text-fh-ink-disabled",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** White fill, strong border — everything reversible. */
export function SecondaryButton({ className, children, ...props }: BaseProps) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        base,
        "h-10 border border-fh-border-strong bg-fh-surface px-4 text-fh-button hover:bg-fh-subtle",
        "disabled:text-fh-ink-disabled disabled:hover:bg-fh-surface",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Compact secondary used inside card headers and toolbars. */
export function SmallButton({ className, children, ...props }: BaseProps) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        base,
        "h-9 border border-fh-border-strong bg-fh-surface px-3 text-fh-compact text-fh-button hover:bg-fh-subtle",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Square icon-only control. `aria-label` is required by the type. */
export function IconButton({
  className,
  children,
  width = 36,
  height = 36,
  "aria-label": ariaLabel,
  ...props
}: BaseProps & { "aria-label": string; width?: number; height?: number }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      style={{ width, height }}
      {...props}
      className={cn(
        "inline-flex items-center justify-center rounded-fh-control border",
        "border-fh-border-strong bg-fh-surface text-fh-ink-2 transition-colors",
        "hover:bg-fh-subtle hover:text-fh-ink disabled:text-fh-ink-disabled disabled:hover:bg-fh-surface",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Borderless text action — "View All", "Why this pick?", "Replace File". */
export function LinkButton({ className, children, ...props }: BaseProps) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex items-center gap-1.5 text-fh-compact font-medium text-fh-ink-2",
        "underline-offset-2 transition-colors hover:text-fh-ink hover:underline",
        className,
      )}
    >
      {children}
    </button>
  );
}
