import type { ReactNode } from "react";
import { cn } from "./cn";

export type Column<T> = {
  key: string;
  header: ReactNode;
  /** Screen-reader text when the visible header is an abbreviation. */
  headerLabel?: string;
  align?: "left" | "right" | "center";
  width?: string;
  cellClassName?: string;
  cell: (row: T, index: number) => ReactNode;
};

const alignClass = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
} as const;

/**
 * The single dense table used across Team Comparisons, Draft Results and the
 * Draft Room. 36px rows, hairline separators, a subtle header strip, and an
 * optional sticky header for the scrolling panels.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  isHighlighted,
  stickyHeader = false,
  className,
  emptyMessage = "Nothing to show yet.",
}: {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T, index: number) => string;
  isHighlighted?: (row: T, index: number) => boolean;
  stickyHeader?: boolean;
  className?: string;
  emptyMessage?: string;
}) {
  return (
    <table className={cn("w-full border-collapse text-fh-compact", className)}>
      <thead>
        <tr>
          {columns.map((column) => (
            <th
              key={column.key}
              scope="col"
              style={column.width ? { width: column.width } : undefined}
              className={cn(
                "border-b border-fh-border bg-fh-subtle px-2.5 py-2",
                "text-fh-label font-semibold text-fh-ink-2",
                alignClass[column.align ?? "left"],
                stickyHeader && "sticky top-0 z-10",
              )}
            >
              {column.headerLabel ? (
                <>
                  <span aria-hidden>{column.header}</span>
                  <span className="sr-only">{column.headerLabel}</span>
                </>
              ) : (
                column.header
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td
              colSpan={columns.length}
              className="px-3 py-6 text-center text-fh-compact text-fh-ink-muted"
            >
              {emptyMessage}
            </td>
          </tr>
        )}
        {rows.map((row, index) => (
          <tr
            key={getRowKey(row, index)}
            className={cn(
              "border-b border-fh-border last:border-b-0",
              isHighlighted?.(row, index) ? "bg-fh-selected" : "bg-fh-surface",
            )}
          >
            {columns.map((column) => (
              <td
                key={column.key}
                className={cn(
                  "h-9 px-2.5 text-fh-ink",
                  alignClass[column.align ?? "left"],
                  column.cellClassName,
                )}
              >
                {column.cell(row, index)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Fixed-height scroll frame for tables that overflow their panel. */
export function TableScroll({
  maxHeight,
  children,
  className,
}: {
  maxHeight: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      style={{ maxHeight }}
      className={cn(
        "fh-scroll overflow-auto rounded-fh-card border border-fh-border",
        className,
      )}
    >
      {children}
    </div>
  );
}
