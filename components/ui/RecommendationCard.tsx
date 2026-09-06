import { IconPointFilled } from "@tabler/icons-react";
import { CategoryMetric } from "./CategoryMetric";
import { StatusPill } from "./StatusPill";
import { CATEGORY_BY_KEY } from "@/lib/domain/categories";
import type { Recommendation } from "@/lib/domain/recommend";

/**
 * The one headline recommendation: who, why (three reasons at most), how
 * urgent, and the category impact that actually moves the needle. The
 * replacement-level and scarcity numbers behind it stay in "Why this pick?".
 */
export function RecommendationCard({
  recommendation,
  picksUntilTurn,
  finishingMode,
}: {
  recommendation: Recommendation;
  picksUntilTurn?: number;
  finishingMode: boolean;
}) {
  const { player, strategy, reasons, urgency, returnRisk, impacts } = recommendation;

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-fh-hero font-bold text-fh-ink">{player.name}</p>
          <p className="mt-1 text-fh-body text-fh-ink-2">
            {player.eligibility.positions.join("/")}
            {player.team ? ` · ${player.team}` : ""}
            {player.rank ? ` · Rank #${player.rank}` : ""}
          </p>
        </div>
        <StatusPill tone={urgency === "draft-now" ? "strong" : "quiet"}>
          {urgency === "draft-now" ? "Draft now" : "Likely available later"}
        </StatusPill>
      </div>

      <p className="mt-3 text-fh-label font-semibold tracking-wide text-fh-ink-2">
        Strategy — {strategy}
        {finishingMode && " · Roster finishing"}
      </p>

      <ul className="mt-3 flex flex-col gap-1.5">
        {reasons.map((reason) => (
          <li key={reason} className="flex items-start gap-1.5 text-fh-body text-fh-ink">
            <IconPointFilled size={12} aria-hidden className="mt-1.5 shrink-0 text-fh-ink-muted" />
            {reason}
          </li>
        ))}
      </ul>

      <div className="mt-4 rounded-fh-card border border-fh-border bg-fh-subtle px-4 py-3">
        <p className="text-fh-label font-semibold text-fh-ink">Will he make it back?</p>
        <p className="mt-1 text-fh-body text-fh-ink-2">
          <span className="font-bold text-fh-ink">
            {/* A percentage only where there is an ADP to derive it from. */}
            {returnRisk.probability !== undefined
              ? `${returnRisk.probability}% chance`
              : returnRisk.label}
          </span>
          {picksUntilTurn !== undefined && (
            <>
              {" · "}
              {picksUntilTurn} {picksUntilTurn === 1 ? "pick" : "picks"} until your next selection
            </>
          )}
        </p>
        {returnRisk.probability !== undefined && (
          <p className="mt-1 text-fh-meta text-fh-ink-2">
            {returnRisk.label} · based on average draft position
          </p>
        )}
        {returnRisk.basis === "none" && (
          <p className="mt-1 text-fh-meta text-fh-ink-2">
            No ranking or ADP in the active projection set, so this cannot be estimated.
          </p>
        )}
      </div>

      {impacts.length > 0 && (
        <div className="mt-4">
          <p className="text-fh-label font-semibold text-fh-ink">
            Category impact <span className="font-normal text-fh-ink-2">vs replacement</span>
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {impacts.map((impact) => {
              const definition = CATEGORY_BY_KEY[impact.key];
              return (
                <CategoryMetric
                  key={impact.key}
                  label={definition.label.length > 12 ? definition.short : definition.label}
                  delta={impact.delta}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
