"use client";

import { IconArrowBackUp, IconX } from "@tabler/icons-react";
import { useEffect } from "react";

export type ToastMessage = {
  id: number;
  message: string;
  /** Optional single reversal action, e.g. undoing a recorded pick. */
  undoLabel?: string;
  onUndo?: () => void;
};

/**
 * Bottom-left transient confirmation. Recording a pick must never block the
 * draft with a modal, so the confirmation and its undo live here.
 */
export function Toast({
  toast,
  onDismiss,
  timeoutMs = 6000,
}: {
  toast: ToastMessage | null;
  onDismiss: () => void;
  timeoutMs?: number;
}) {
  const id = toast?.id;

  useEffect(() => {
    if (id === undefined) return;
    const timer = window.setTimeout(onDismiss, timeoutMs);
    return () => window.clearTimeout(timer);
  }, [id, onDismiss, timeoutMs]);

  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fh-toast fixed bottom-6 left-6 z-50 flex items-center gap-3 rounded-fh-card border border-fh-border-strong bg-fh-inverse px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,.04)]"
    >
      <span className="text-fh-compact text-white">{toast.message}</span>
      {toast.onUndo && (
        <button
          type="button"
          onClick={() => {
            toast.onUndo?.();
            onDismiss();
          }}
          className="inline-flex items-center gap-1.5 rounded-[4px] border border-white/30 px-2 py-1 text-fh-label font-semibold text-white transition-colors hover:bg-white/10"
        >
          <IconArrowBackUp size={14} stroke={2} aria-hidden />
          {toast.undoLabel ?? "Undo"}
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={onDismiss}
        className="text-white/60 transition-colors hover:text-white"
      >
        <IconX size={16} stroke={2} aria-hidden />
      </button>
    </div>
  );
}
