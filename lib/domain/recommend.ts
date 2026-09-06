import { CATEGORY_BY_KEY, categoryAppliesTo } from "./categories";
import { openStartingNeeds, rosterFit, slotAccepts } from "./roster";
import { playerFantasyPoints, scoredCategories } from "./scoring";
import type {
  CategoryKey,
  LeagueScoringSettings,
  Player,
  Position,
  ProjectedTeamTotals,
  RosterConfiguration,
  RosterSlot,
} from "./types";

/**
 * The recommendation engine.
 *
 * Value over replacement is the spine of it, but it is an *input*, not the
 * answer: a pick is scored by what it adds over the player you could get at
 * that position next time around, weighted by where the managed team is
 * actually losing categories, then adjusted for whether the player can even
 * be used, how scarce the position is, and how likely he is to come back.
 *
 * Everything below the headline stays behind progressive disclosure — the
 * Draft Room shows a player, a strategy, three reasons and an urgency.
 */

export type ReturnRiskLevel = "likely-return" | "risk-increasing" | "unlikely-return" | "unknown";

export type ReturnRisk = {
  level: ReturnRiskLevel;
  label: string;
  /**
   * Survival probability as an unrounded percentage, present only when the
   * player has a real ADP to reason from. With rank alone the level is
   * qualitative and this is omitted rather than invented.
   *
   * Left unrounded so the display layer can still tell 0.002% from 0.4%;
   * rounding here flattened both to a bare "0%".
   */
  probability?: number;
  basis: "adp" | "rank" | "none";
};

/**
 * A logistic estimate never actually reaches 0 or 100, and printing either
 * claims a certainty the model cannot support — so the extremes are stated as
 * bounds instead.
 */
export function formatReturnChance(percent: number): string {
  if (percent < 1) return "<1%";
  if (percent > 99) return ">99%";
  return `${Math.round(percent)}%`;
}

export type CategoryImpact = {
  key: CategoryKey;
  label: string;
  /** Raw projected difference against replacement at the position. */
  delta: number;
  /** Standardised contribution, used for ordering. */
  z: number;
};

export type RecommendationTag =
  | "best-value"
  | "positional-scarcity"
  | "unlikely-to-return"
  | "fills-starter"
  | "post-draft-target";

export type Recommendation = {
  player: Player;
  /** "Strengthen the Build" or "Round Out the Team". */
  strategy: string;
  reasons: string[];
  returnRisk: ReturnRisk;
  urgency: "draft-now" | "can-wait";
  impacts: CategoryImpact[];
  tags: RecommendationTag[];
  /** Diagnostics surfaced only behind "Why this pick?". */
  detail: {
    valueOverReplacement: number;
    needWeightedValue: number;
    replacementName?: string;
    positionalScarcity: number;
    fillsStartingSlot: boolean;
    /** How much better than the alternatives this pick scored. */
    scoreMargin: number;
    fantasyPoints?: number;
  };
};

export type CategoryGap = {
  key: CategoryKey;
  label: string;
  rank: number;
  teams: number;
};

export type RecommendationInput = {
  available: Player[];
  managedRoster: Player[];
  rosterConfig: RosterConfiguration;
  scoring: LeagueScoringSettings;
  /** Category ranks for the managed team, from the shared standings. */
  managedTotals?: ProjectedTeamTotals;
  categoryRanks: Partial<Record<CategoryKey, number>>;
  teamCount: number;
  /** Scheduled picks between now and the managed team's next selection. */
  picksUntilTurn?: number;
  /** Overall number of the managed team's next pick. */
  nextPickOverall?: number;
  /** Managed team's remaining selections; drives Roster Finishing Mode. */
  remainingPicks: number;
};

export type RecommendationResult = {
  primary?: Recommendation;
  alternative?: Recommendation;
  gaps: CategoryGap[];
  finishingMode: boolean;
  /** Set when there is nothing to recommend, with the reason why. */
  unavailable?: string;
};

/* -------------------------------------------------------------------------
 * Scales and replacement level
 * ---------------------------------------------------------------------- */

/**
 * How much of a roster feeds each category.
 *
 * Without this, summing z-scores badly overrates goalies: in a league with
 * four goalie categories and two goalie slots, one goalie collects four
 * categories' worth of standardised edge while a skater's six categories are
 * spread across a dozen skater slots. Weighting each category by the share of
 * the roster that contributes to it expresses what a pick is actually worth
 * to the team's totals.
 */
function categoryWeights(
  keys: CategoryKey[],
  roster: RosterConfiguration,
): Partial<Record<CategoryKey, number>> {
  const goalieSlots = roster.G ?? 0;
  const skaterSlots =
    (roster.C ?? 0) + (roster.LW ?? 0) + (roster.RW ?? 0) + (roster.D ?? 0) + (roster.UTIL ?? 0);
  const starters = goalieSlots + skaterSlots;
  if (starters === 0) return {};

  return Object.fromEntries(
    keys.map((key) => [
      key,
      (CATEGORY_BY_KEY[key].group === "goalie" ? goalieSlots : skaterSlots) / starters,
    ]),
  );
}

/** Spread of each category across the pool, so categories can be compared. */
function categoryScales(
  pool: Player[],
  keys: CategoryKey[],
): Partial<Record<CategoryKey, number>> {
  const scales: Partial<Record<CategoryKey, number>> = {};

  for (const key of keys) {
    const values = pool
      .map((player) => player.stats[key])
      .filter((value): value is number => typeof value === "number");
    if (values.length < 4) continue;

    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance =
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    const sd = Math.sqrt(variance);
    if (sd > 0) scales[key] = sd;
  }

  return scales;
}

/**
 * Dynamic replacement level: the player at this position you could still
 * expect to get one full turn from now — roughly one selection per rival.
 * It rises as a position dries up, which is what makes scarcity show up in
 * the value rather than as a bolted-on bonus.
 */
function replacementFor(
  available: Player[],
  position: Position,
  teamCount: number,
): Player | undefined {
  const eligible = available.filter((player) =>
    player.eligibility.positions.includes(position),
  );
  if (eligible.length === 0) return undefined;
  return eligible[Math.min(eligible.length - 1, teamCount)];
}

/* -------------------------------------------------------------------------
 * Return risk
 * ---------------------------------------------------------------------- */

/**
 * Probability the player is still on the board at the managed team's next
 * pick, from the gap between their draft position and that pick. Undefined
 * when the source gives neither an ADP nor a rank to reason from.
 */
export function survivalProbability(
  player: Player,
  nextPickOverall: number | undefined,
): number | undefined {
  const reference = player.adp ?? player.rank;
  if (reference === undefined || nextPickOverall === undefined) return undefined;
  return 1 / (1 + Math.exp(-(reference - nextPickOverall) / 3.5));
}

export function estimateReturnRisk(
  player: Player,
  nextPickOverall: number | undefined,
): ReturnRisk {
  const basis: ReturnRisk["basis"] =
    player.adp !== undefined ? "adp" : player.rank !== undefined ? "rank" : "none";

  const probability = survivalProbability(player, nextPickOverall);
  if (basis === "none" || probability === undefined) {
    return { level: "unknown", label: "No ranking data", basis: "none" };
  }

  const level: ReturnRiskLevel =
    probability >= 0.65 ? "likely-return" : probability >= 0.35 ? "risk-increasing" : "unlikely-return";

  const label =
    level === "likely-return"
      ? "Likely to return"
      : level === "risk-increasing"
        ? "Risk increasing"
        : "Unlikely to return";

  return {
    level,
    label,
    // Only an actual draft-position sample supports a number.
    probability: basis === "adp" ? probability * 100 : undefined,
    basis,
  };
}

/* -------------------------------------------------------------------------
 * Scoring one candidate
 * ---------------------------------------------------------------------- */

function impactsFor(
  player: Player,
  replacement: Player | undefined,
  keys: CategoryKey[],
  scales: Partial<Record<CategoryKey, number>>,
  weights: Partial<Record<CategoryKey, number>>,
): CategoryImpact[] {
  if (!replacement) return [];

  const impacts: CategoryImpact[] = [];
  for (const key of keys) {
    if (!categoryAppliesTo(key, player.eligibility.positions)) continue;
    const mine = player.stats[key];
    const theirs = replacement.stats[key];
    const scale = scales[key];
    if (typeof mine !== "number" || typeof theirs !== "number" || !scale) continue;

    const definition = CATEGORY_BY_KEY[key];
    const raw = definition.lowerIsBetter ? theirs - mine : mine - theirs;
    impacts.push({
      key,
      label: definition.label,
      delta: definition.rate ? Number(raw.toFixed(definition.precision ?? 2)) : Math.round(raw),
      z: (raw / scale) * (weights[key] ?? 1),
    });
  }

  return impacts.sort((a, b) => b.z - a.z);
}

/** Worse category rank ⇒ heavier weight, capped so it never dominates. */
function needWeight(rank: number | undefined, teams: number): number {
  if (rank === undefined || teams <= 1) return 1;
  return 1 + ((rank - 1) / (teams - 1)) * 0.8;
}

function scarcityAt(available: Player[], positions: Position[], limit = 40): number {
  return available
    .slice(0, limit)
    .filter((player) => player.eligibility.positions.some((p) => positions.includes(p))).length;
}

/* -------------------------------------------------------------------------
 * Entry point
 * ---------------------------------------------------------------------- */

export function categoryGaps(
  categoryRanks: Partial<Record<CategoryKey, number>>,
  keys: CategoryKey[],
  teams: number,
  limit = 3,
): CategoryGap[] {
  return keys
    .map((key) => ({
      key,
      label: CATEGORY_BY_KEY[key].label,
      rank: categoryRanks[key] ?? teams,
      teams,
    }))
    .sort((a, b) => b.rank - a.rank)
    .slice(0, limit);
}

export function recommend(input: RecommendationInput): RecommendationResult {
  const {
    available,
    managedRoster,
    rosterConfig,
    scoring,
    categoryRanks,
    teamCount,
    nextPickOverall,
    remainingPicks,
  } = input;

  const keys = scoredCategories(scoring);
  const gaps = categoryGaps(categoryRanks, keys, teamCount);
  const finishingMode = remainingPicks > 0 && remainingPicks <= 3;

  if (available.length === 0) {
    return { gaps, finishingMode, unavailable: "No players are available to draft." };
  }
  if (keys.length === 0) {
    return {
      gaps,
      finishingMode,
      unavailable: "No scoring categories are enabled in League Setup.",
    };
  }

  const scales = categoryScales(available.slice(0, 200), keys);
  const weights = categoryWeights(keys, rosterConfig);
  if (Object.keys(scales).length === 0) {
    return {
      gaps,
      finishingMode,
      unavailable: "The active projection set has no data for the scored categories.",
    };
  }

  const openNeeds = openStartingNeeds(managedRoster, rosterConfig);
  const usePoints = scoring.format === "points";

  const scored = available
    .slice(0, 80)
    .map((player) => {
      const fit = rosterFit(managedRoster, player, rosterConfig);
      if (!fit.canRoster) return undefined;

      const position = player.eligibility.primary;
      const replacement = replacementFor(available, position, teamCount);
      const impacts = impactsFor(player, replacement, keys, scales, weights);

      const vorp = usePoints
        ? (playerFantasyPoints(player, scoring) ?? 0) -
          (replacement ? (playerFantasyPoints(replacement, scoring) ?? 0) : 0)
        : impacts.reduce((sum, impact) => sum + impact.z, 0);

      const needWeighted = usePoints
        ? vorp
        : impacts.reduce(
            (sum, impact) => sum + impact.z * needWeight(categoryRanks[impact.key], teamCount),
            0,
          );

      const scarcity = scarcityAt(available, player.eligibility.positions);
      const positionNeed = Math.max(
        ...player.eligibility.positions.map((p) => openNeeds[p] ?? 0),
      );

      // Normalise the two scoring modes onto a comparable scale before the
      // roster-shape adjustments, so neither swamps the other.
      const base = usePoints ? needWeighted / 12 : needWeighted;
      const starterBonus = fit.fillsStartingSlot ? 0.8 : -0.4;
      const needBonus = Math.min(positionNeed, 3) * 0.25;
      const scarcityBonus = scarcity <= 6 ? (6 - scarcity) * 0.2 : 0;

      const survival = survivalProbability(player, nextPickOverall) ?? 0.5;

      return {
        player,
        fit,
        replacement,
        impacts,
        vorp,
        needWeighted,
        scarcity,
        positionNeed,
        survival,
        score: base + starterBonus + needBonus + scarcityBonus,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return {
      gaps,
      finishingMode,
      unavailable: "Every roster slot is filled — there is nothing left to draft.",
    };
  }

  const bestVorp = Math.max(...scored.map((entry) => entry.vorp));
  const gapKeys = new Set(gaps.map((gap) => gap.key));

  /**
   * Opportunity cost, applied as a choice rather than a weight.
   *
   * Value alone would happily tell you to spend this pick on someone who
   * will still be sitting there at your next one. So among candidates whose
   * value is close enough to the best to be a real alternative, take the one
   * least likely to come back — and leave the rest for later. When nothing
   * is at risk this changes nothing and the best player wins outright.
   */
  const pickUnderOpportunityCost = (candidates: typeof scored): (typeof scored)[number] => {
    const best = candidates[0];
    const margin = Math.abs(best.score) * 0.15;
    const contenders = candidates.filter((entry) => entry.score >= best.score - margin);
    return contenders.reduce((choice, entry) =>
      entry.survival < choice.survival ? entry : choice,
    );
  };

  const toRecommendation = (entry: (typeof scored)[number]): Recommendation => {
    const { player, fit, impacts, replacement, scarcity, positionNeed } = entry;
    const returnRisk = estimateReturnRisk(player, nextPickOverall);
    const top = impacts.slice(0, 3);
    const addressesGap = top.some((impact) => gapKeys.has(impact.key));

    const strategy =
      addressesGap || fit.fillsStartingSlot ? "Round Out the Team" : "Strengthen the Build";

    const tags: RecommendationTag[] = [];
    if (entry.vorp >= bestVorp - 1e-9) tags.push("best-value");
    if (scarcity <= 6) tags.push("positional-scarcity");
    if (returnRisk.level === "unlikely-return") tags.push("unlikely-to-return");
    if (fit.fillsStartingSlot) tags.push("fills-starter");

    const reasons: string[] = [];
    if (top.length >= 2) {
      reasons.push(`Clear edge in ${top[0].label.toLowerCase()} and ${top[1].label.toLowerCase()}`);
    } else if (top.length === 1) {
      reasons.push(`Clear ${top[0].label.toLowerCase()} edge over replacement`);
    }
    const gapHit = top.find((impact) => gapKeys.has(impact.key));
    if (gapHit) reasons.push(`Helps close your ${gapHit.label} gap`);
    if (reasons.length < 3 && scarcity <= 6) {
      reasons.push(`Only ${scarcity} startable ${player.eligibility.primary} left`);
    }
    if (reasons.length < 3 && fit.fillsStartingSlot && positionNeed > 0) {
      reasons.push(`Fills an open ${player.eligibility.primary} slot`);
    }
    if (reasons.length < 3 && returnRisk.level === "unlikely-return") {
      reasons.push("Will not last until your next pick");
    }
    if (reasons.length < 3 && player.eligibility.positions.length > 1) {
      reasons.push(`Eligible at ${player.eligibility.positions.join("/")}`);
    }

    return {
      player,
      strategy,
      reasons: reasons.slice(0, 3),
      returnRisk,
      urgency: returnRisk.level === "likely-return" ? "can-wait" : "draft-now",
      impacts: top,
      tags,
      detail: {
        valueOverReplacement: Number(entry.vorp.toFixed(2)),
        needWeightedValue: Number(entry.needWeighted.toFixed(2)),
        replacementName: replacement?.name,
        positionalScarcity: scarcity,
        fillsStartingSlot: fit.fillsStartingSlot,
        scoreMargin: Number((entry.score - (scored[1]?.score ?? entry.score)).toFixed(2)),
        fantasyPoints: usePoints ? playerFantasyPoints(player, scoring) : undefined,
      },
    };
  };

  const primaryEntry = pickUnderOpportunityCost(scored);
  const remaining = scored.filter((entry) => entry !== primaryEntry);
  const alternativeEntry =
    remaining.find(
      (entry) => entry.player.eligibility.primary !== primaryEntry.player.eligibility.primary,
    ) ?? remaining[0];

  return {
    primary: toRecommendation(primaryEntry),
    alternative: alternativeEntry ? toRecommendation(alternativeEntry) : undefined,
    gaps,
    finishingMode,
  };
}

/* -------------------------------------------------------------------------
 * Post-draft watchlist
 * ---------------------------------------------------------------------- */

export type WatchlistEntry = {
  player: Player;
  reason: string;
};

/**
 * A one-time snapshot taken after the managed team's final pick: the best
 * undrafted players against the gaps the roster ended up with. It is not
 * monitored or refreshed — nothing here watches an external league.
 */
export function postDraftWatchlist(
  available: Player[],
  managedRoster: Player[],
  rosterConfig: RosterConfiguration,
  scoring: LeagueScoringSettings,
  categoryRanks: Partial<Record<CategoryKey, number>>,
  teamCount: number,
  limit = 8,
): WatchlistEntry[] {
  const keys = scoredCategories(scoring);
  const gaps = categoryGaps(categoryRanks, keys, teamCount);
  const gapKeys = new Set(gaps.map((gap) => gap.key));
  const scales = categoryScales(available.slice(0, 200), keys);
  const weights = categoryWeights(keys, rosterConfig);
  const openNeeds = openStartingNeeds(managedRoster, rosterConfig);

  return available
    .slice(0, 60)
    .map((player) => {
      const replacement = replacementFor(available, player.eligibility.primary, teamCount);
      const impacts = impactsFor(player, replacement, keys, scales, weights);
      const gapImpact = impacts.find((impact) => gapKeys.has(impact.key));
      const need = Math.max(...player.eligibility.positions.map((p) => openNeeds[p] ?? 0));
      const score =
        impacts.reduce((sum, impact) => sum + impact.z, 0) +
        (gapImpact ? 1.5 : 0) +
        (need > 0 ? 0.75 : 0);

      const reason = gapImpact
        ? `${gapImpact.label} help`
        : need > 0
          ? `${player.eligibility.primary} depth`
          : "Best available";

      return { player, reason, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ player, reason }) => ({ player, reason }));
}

/** Slots a player could legally fill on the managed roster right now. */
export function eligibleSlots(player: Player, config: RosterConfiguration): RosterSlot[] {
  return (Object.keys(config) as RosterSlot[]).filter(
    (slot) => config[slot] > 0 && slotAccepts(slot, player.eligibility.positions),
  );
}
