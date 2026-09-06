"use client";

import { useMemo, useState } from "react";
import { Modal } from "../ui/Modal";
import { PlayerSearch } from "../ui/PlayerSearch";
import { SelectField, TextInput } from "../ui/Fields";
import { PrimaryButton, SecondaryButton, SmallButton } from "../ui/Button";
import { StatusPill } from "../ui/StatusPill";
import { TableScroll } from "../ui/DataTable";
import { cn } from "../ui/cn";
import { useAppState } from "../AppStateProvider";
import type { Player } from "@/lib/domain/types";

/**
 * Corrections.
 *
 * The real draft in the room is authoritative; this app is a record of it,
 * and records get things wrong. So every recorded pick can be re-pointed at
 * a different player, reassigned to a different franchise, resolved from a
 * placeholder, or removed outright — including picks in the middle of the
 * board, long after they were entered.
 */
export function CorrectionsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch, derived } = useAppState();
  const [selectedOverall, setSelectedOverall] = useState<number | null>(null);
  const [replacement, setReplacement] = useState<Player | null>(null);
  const [placeholderLabel, setPlaceholderLabel] = useState("");

  const picks = useMemo(
    () => Object.values(state.draft.picks).sort((a, b) => b.overall - a.overall),
    [state.draft.picks],
  );

  const selected = selectedOverall === null ? null : state.draft.picks[selectedOverall];

  const nameFor = (id: string) =>
    state.league.franchises.find((franchise) => franchise.id === id)?.name ?? id;

  const describe = (selection: (typeof picks)[number]["selection"]) =>
    selection.kind === "player"
      ? (derived.draft.pool.byId[selection.playerId]?.name ??
        "Player missing from the active projection set")
      : selection.label;

  // The player being corrected is still "taken", so add them back into the
  // candidate list or you could never re-select the same player.
  const candidates = useMemo(() => {
    if (!selected || selected.selection.kind !== "player") return derived.draft.available;
    const current = derived.draft.pool.byId[selected.selection.playerId];
    return current ? [current, ...derived.draft.available] : derived.draft.available;
  }, [selected, derived.draft.available, derived.draft.pool]);

  const reset = () => {
    setSelectedOverall(null);
    setReplacement(null);
    setPlaceholderLabel("");
  };

  return (
    <Modal
      open={open}
      title="Corrections"
      description="Fix a pick that was recorded wrongly, resolve a placeholder, or remove a pick entirely."
      onClose={() => {
        reset();
        onClose();
      }}
      width={720}
      footer={
        <SecondaryButton
          onClick={() => {
            reset();
            onClose();
          }}
        >
          Done
        </SecondaryButton>
      }
    >
      {picks.length === 0 ? (
        <p className="text-fh-compact text-fh-ink-muted">No picks have been recorded yet.</p>
      ) : (
        <div className="grid grid-cols-[minmax(0,300px)_minmax(0,1fr)] gap-4">
          <TableScroll maxHeight={340} className="border-fh-border">
            <ul>
              {picks.map((pick) => (
                <li key={pick.overall}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedOverall(pick.overall);
                      setReplacement(null);
                      setPlaceholderLabel(
                        pick.selection.kind === "unresolved" ? pick.selection.label : "",
                      );
                    }}
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 border-b border-fh-border px-3 py-2 text-left last:border-b-0",
                      pick.overall === selectedOverall ? "bg-fh-selected" : "hover:bg-fh-subtle",
                    )}
                  >
                    <span className="flex w-full items-center gap-2">
                      <span className="text-fh-meta text-fh-ink-muted tabular-nums">
                        #{pick.overall}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-fh-compact text-fh-ink">
                        {describe(pick.selection)}
                      </span>
                      {pick.selection.kind === "unresolved" && (
                        <StatusPill tone="medium" size="sm">
                          Unresolved
                        </StatusPill>
                      )}
                      {pick.corrected && (
                        <StatusPill tone="quiet" size="sm">
                          Edited
                        </StatusPill>
                      )}
                    </span>
                    <span className="truncate text-fh-meta text-fh-ink-2">
                      Round {pick.round} · {nameFor(pick.franchiseId)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </TableScroll>

          <div>
            {!selected ? (
              <p className="text-fh-compact text-fh-ink-muted">
                Select a pick on the left to correct it.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                <div>
                  <p className="text-fh-label font-semibold text-fh-ink">
                    Pick #{selected.overall} · Round {selected.round}
                  </p>
                  <p className="mt-1 text-fh-meta text-fh-ink-2">
                    Currently {describe(selected.selection)} to {nameFor(selected.franchiseId)}.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="correct-franchise"
                    className="block text-fh-label font-semibold text-fh-ink"
                  >
                    Drafting franchise
                  </label>
                  <div className="mt-2">
                    <SelectField
                      id="correct-franchise"
                      value={selected.franchiseId}
                      onChange={(event) =>
                        dispatch({
                          type: "draft/correct",
                          overall: selected.overall,
                          franchiseId: event.target.value,
                        })
                      }
                      options={state.league.franchises.map((franchise) => ({
                        value: franchise.id,
                        label: franchise.name,
                      }))}
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="correct-player"
                    className="block text-fh-label font-semibold text-fh-ink"
                  >
                    {selected.selection.kind === "unresolved" ? "Resolve to player" : "Player"}
                  </label>
                  <div className="mt-2">
                    <PlayerSearch
                      id="correct-player"
                      players={candidates}
                      selected={replacement}
                      onSelect={setReplacement}
                      onSubmit={() => undefined}
                      placeholder="Search for the right player…"
                    />
                  </div>
                  <div className="mt-2 flex gap-3">
                    <SmallButton
                      disabled={!replacement}
                      onClick={() => {
                        if (!replacement) return;
                        dispatch({
                          type: "draft/correct",
                          overall: selected.overall,
                          selection: { kind: "player", playerId: replacement.id },
                        });
                        setReplacement(null);
                      }}
                    >
                      {selected.selection.kind === "unresolved" ? "Resolve pick" : "Replace player"}
                    </SmallButton>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="correct-placeholder"
                    className="block text-fh-label font-semibold text-fh-ink"
                  >
                    Or mark unresolved
                  </label>
                  <p className="mt-1 text-fh-meta text-fh-ink-2">
                    Keeps the pick and its owner on the board while you work out who it was.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <TextInput
                      id="correct-placeholder"
                      value={placeholderLabel}
                      placeholder="Name as you heard it"
                      onChange={(event) => setPlaceholderLabel(event.target.value)}
                    />
                    <SmallButton
                      className="shrink-0"
                      disabled={placeholderLabel.trim().length === 0}
                      onClick={() =>
                        dispatch({
                          type: "draft/correct",
                          overall: selected.overall,
                          selection: { kind: "unresolved", label: placeholderLabel.trim() },
                        })
                      }
                    >
                      Mark unresolved
                    </SmallButton>
                  </div>
                </div>

                <div className="border-t border-fh-border pt-3">
                  <PrimaryButton
                    onClick={() => {
                      dispatch({ type: "draft/removePick", overall: selected.overall });
                      reset();
                    }}
                  >
                    Remove this pick
                  </PrimaryButton>
                  <p className="mt-2 text-fh-meta text-fh-ink-2">
                    Frees the player, updates the roster, and leaves the slot open for re-entry.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
