"use client";

import { IconFileSpreadsheet } from "@tabler/icons-react";
import { useRef, useState } from "react";
import { cn } from "./cn";

/**
 * Drag-and-drop workbook target with an explicit Choose File fallback. The
 * accepted formats sit under the frame rather than inside it so the drop
 * area stays quiet.
 */
export function FileUpload({
  accept = ".xlsx,.csv,.tsv",
  onFileSelected,
}: {
  accept?: string;
  /** Receives the actual File — parsing happens in the browser. */
  onFileSelected: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onFileSelected(file);
  };

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-fh-card border border-dashed px-4 py-6",
          dragging ? "border-fh-inverse bg-fh-selected" : "border-fh-border-strong bg-fh-surface",
        )}
      >
        <IconFileSpreadsheet size={26} stroke={1.7} aria-hidden className="text-fh-ink-2" />
        <p className="text-fh-meta text-fh-ink-2">Drag and drop your file here</p>
        <p className="text-fh-meta text-fh-ink-muted">or</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="h-9 rounded-fh-control bg-fh-button px-4 text-fh-compact font-medium text-white transition-colors hover:bg-fh-button-hover"
        >
          Choose File
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="sr-only"
          aria-label="Upload workbook file"
          onChange={(event) => handleFiles(event.target.files)}
        />
      </div>
      <p className="mt-2 text-center text-fh-meta text-fh-ink-muted">
        Accepted formats: .xlsx, .csv, .tsv
      </p>
    </div>
  );
}
