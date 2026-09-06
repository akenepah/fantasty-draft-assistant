import { ProgressBar } from "./ProgressBar";
import { StatusPill } from "./StatusPill";
import { ROSTER_SLOT_SHORT } from "@/lib/domain/categories";
import type { SlotCapacity } from "@/lib/domain/roster";

/**
 * One roster slot: how full it is, as a number and a quiet capacity bar.
 * Occupancy comes from the eligibility matcher, so a dual-eligible winger is
 * counted where he can actually play rather than where he is listed.
 */
export function RosterCapacityRow({ capacity }: { capacity: SlotCapacity }) {
  const label = ROSTER_SLOT_SHORT[capacity.slot];

  return (
    <div className="flex items-center gap-3">
      <span className="w-11 shrink-0 text-fh-compact font-semibold text-fh-ink">{label}</span>
      <ProgressBar
        value={capacity.filled}
        max={capacity.capacity}
        emphasis={capacity.full}
        label={`${label} ${capacity.filled} of ${capacity.capacity} filled`}
        className="min-w-0 flex-1"
      />
      <span className="w-9 shrink-0 text-right text-fh-compact text-fh-ink-2 tabular-nums">
        {capacity.filled}/{capacity.capacity}
      </span>
      <span className="w-[74px] shrink-0 text-right">
        {capacity.full && <StatusPill tone="strong">Full</StatusPill>}
        {capacity.nearlyFull && <StatusPill tone="medium">Nearly full</StatusPill>}
      </span>
    </div>
  );
}
