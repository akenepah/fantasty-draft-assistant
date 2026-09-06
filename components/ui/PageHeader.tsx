import type { ReactNode } from "react";

/** 28px title + secondary description, with an optional right-hand slot. */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-6">
      <div>
        <h1 className="text-fh-title font-bold text-fh-ink">{title}</h1>
        <p className="mt-1 text-fh-body text-fh-ink-2">{description}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
