"use client";

import { IconCheck } from "@tabler/icons-react";
import { useId } from "react";
import { SmallSelect } from "./Fields";

const UNMAPPED = "";

/**
 * One field of the import mapper: the target field, the workbook column it
 * resolves to, and whether that mapping is settled. The settled marker is a
 * filled grayscale disc — the app carries no status colors.
 */
export function ColumnMappingRow({
  label,
  value,
  columns,
  optional = false,
  onChange,
}: {
  label: string;
  value: string;
  columns: string[];
  optional?: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const mapped = value !== UNMAPPED;

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="min-w-0 flex-1 text-fh-meta leading-4 text-fh-ink">
        {label}
      </label>
      <div className="w-[104px] shrink-0">
        <SmallSelect
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          options={[
            { value: UNMAPPED, label: optional ? "Not mapped" : "Select column…" },
            ...columns.map((column) => ({ value: column, label: column })),
          ]}
        />
      </div>
      <span
        aria-hidden
        className={
          mapped
            ? "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-fh-inverse text-white"
            : "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-dashed border-fh-border-strong"
        }
      >
        {mapped && <IconCheck size={12} stroke={3} />}
      </span>
      <span className="sr-only">{mapped ? `Mapped to ${value}` : "Not mapped"}</span>
    </div>
  );
}
