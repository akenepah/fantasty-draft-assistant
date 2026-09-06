import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Status is carried by surface value and border weight, never hue:
 *   strong  — act now (Draft Now, Blocked)
 *   medium  — attention (Needs Help, Nearly Full)
 *   quiet   — neutral state (Ready, Can Wait)
 */
export type PillTone = "strong" | "medium" | "quiet";

const tones: Record<PillTone, string> = {
  strong: "border-fh-inverse bg-fh-inverse text-white",
  medium: "border-fh-border-strong bg-fh-selected text-fh-ink",
  quiet: "border-fh-border bg-fh-subtle text-fh-ink-2",
};

export function StatusPill({
  tone = "quiet",
  size = "md",
  icon,
  children,
  className,
}: {
  tone?: PillTone;
  size?: "sm" | "md";
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border",
        size === "sm" ? "px-2 py-0.5" : "px-2.5 py-1",
        "text-fh-label font-semibold whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
