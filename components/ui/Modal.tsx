"use client";

import { IconX } from "@tabler/icons-react";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Progressive-disclosure surface: corrections, "Why this pick?", full draft
 * boards. Never used to confirm an action — those get a toast instead.
 */
export function Modal({
  open,
  title,
  description,
  onClose,
  width = 640,
  footer,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  width?: number;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/30 p-12">
      <button
        type="button"
        aria-label="Close dialog"
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 -z-10 cursor-default"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{ width }}
        className={cn(
          "max-w-full rounded-fh-card border border-fh-border bg-fh-surface",
          "shadow-[0_1px_2px_rgba(0,0,0,.04)] outline-none",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-fh-border px-5 py-4">
          <div>
            <h2 className="text-fh-card font-semibold text-fh-ink">{title}</h2>
            {description && <p className="mt-1 text-fh-meta text-fh-ink-2">{description}</p>}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="text-fh-ink-2 transition-colors hover:text-fh-ink"
          >
            <IconX size={18} stroke={1.8} aria-hidden />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-3 border-t border-fh-border px-5 py-4">{footer}</div>
        )}
      </div>
    </div>
  );
}
