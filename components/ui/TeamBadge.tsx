import { cn } from "./cn";

/** Word initials, capped: "Puck Luck Club" -> "PLC", "The Breakaways" -> "TB". */
function initials(name: string, max: number): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "--";
  if (words.length === 1) return words[0].slice(0, max).toUpperCase();
  return words
    .slice(0, max)
    .map((word) => word[0].toUpperCase())
    .join("");
}

/** Two-letter mark for the circular franchise badge. */
export function teamInitials(name: string): string {
  return initials(name, 2);
}

/**
 * Space-saving franchise name for narrow columns: the leading word for a
 * two-word name, the leading pair for a longer one ("Blue Line Bandits" ->
 * "Blue Line", "Arctic Wolves" -> "Arctic").
 */
export function teamShortName(name: string): string {
  const words = name.replace(/^The\s+/i, "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return name;
  return words.slice(0, words.length >= 3 ? 2 : 1).join(" ");
}

/** Up-to-three-letter abbreviation used by the draft-order chips. */
export function teamAbbreviation(name: string): string {
  return initials(name, 3);
}

/**
 * Circular initials mark. Franchise marks are generated locally rather than
 * loaded as assets — no external logos, no broken images.
 */
export function TeamBadge({
  name,
  size = 22,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full",
        "border border-fh-border-strong bg-fh-selected font-semibold text-fh-ink",
        className,
      )}
    >
      {teamInitials(name)}
    </span>
  );
}

/**
 * Larger franchise emblem for team-detail panels: a simple geometric puck
 * with crossed sticks, drawn in SVG so it needs no image asset.
 */
export function TeamEmblem({ name, size = 96 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      role="img"
      aria-label={`${name} emblem`}
      className="shrink-0"
    >
      <circle cx="48" cy="48" r="46" fill="#17191C" />
      <circle cx="48" cy="48" r="46" fill="none" stroke="#5F6670" strokeWidth="1.5" />
      {/* crossed sticks */}
      <g stroke="#F3F4F6" strokeWidth="4" strokeLinecap="round">
        <path d="M26 22 L58 60" />
        <path d="M70 22 L38 60" />
      </g>
      <g stroke="#F3F4F6" strokeWidth="4" strokeLinecap="round">
        <path d="M58 60 L68 66" />
        <path d="M38 60 L28 66" />
      </g>
      {/* puck */}
      <ellipse cx="48" cy="72" rx="15" ry="6.5" fill="#5F6670" />
      <ellipse cx="48" cy="69.5" rx="15" ry="6.5" fill="#B5BAC1" />
    </svg>
  );
}
