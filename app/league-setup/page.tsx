"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { Toast, type ToastMessage } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";
import { LeagueBasics } from "@/components/league-setup/LeagueBasics";
import { RosterScoring } from "@/components/league-setup/RosterScoring";
import { DraftSettings } from "@/components/league-setup/DraftSettings";
import { useAppState } from "@/components/AppStateProvider";

/**
 * League Setup is a single page, not a wizard. Every control writes straight
 * to the shared league, so there is nothing to "apply" — Save is a
 * confirmation, and the rest of the app is already following along.
 */
export default function LeagueSetupPage() {
  const { state, dispatch, derived } = useAppState();
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const recorded = derived.draft.pointer.recordedPicks;

  return (
    <>
      <PageHeader
        title="League Setup"
        description="Configure your league settings, teams, scoring, and draft options."
      />

      <div className="flex flex-col gap-4">
        <LeagueBasics />
        <RosterScoring />
        <DraftSettings />

        <div className="flex items-center justify-between">
          <SecondaryButton onClick={() => setConfirmReset(true)}>Reset</SecondaryButton>
          <PrimaryButton
            onClick={() =>
              setToast({
                id: Date.now(),
                message: `League saved — ${state.league.name}, ${state.league.teamCount} teams, ${state.league.rounds} rounds`,
              })
            }
          >
            Save League Setup
          </PrimaryButton>
        </div>
      </div>

      <Modal
        open={confirmReset}
        title="Reset league setup?"
        description={
          recorded > 0
            ? `This restores the default league settings and discards the ${recorded} picks recorded so far.`
            : "This restores the default league settings. Imported projection sources are kept."
        }
        onClose={() => setConfirmReset(false)}
        width={480}
        footer={
          <>
            <SecondaryButton onClick={() => setConfirmReset(false)}>Cancel</SecondaryButton>
            <PrimaryButton
              onClick={() => {
                dispatch({ type: "league/reset" });
                setConfirmReset(false);
                setToast({ id: Date.now(), message: "League setup reset to defaults." });
              }}
            >
              Reset league
            </PrimaryButton>
          </>
        }
      >
        <p className="text-fh-compact text-fh-ink-2">
          Franchise names, roster slots, scoring settings, rounds and the draft order all return to
          their defaults.
        </p>
      </Modal>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
