"use client";

import { IconChevronDown, IconMinus, IconPlus } from "@tabler/icons-react";
import { useId } from "react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "./cn";

const controlBase =
  "w-full rounded-fh-control border border-fh-border-strong bg-fh-surface px-3 " +
  "text-fh-body text-fh-ink placeholder:text-fh-ink-muted transition-colors " +
  "hover:border-fh-ink-muted disabled:bg-fh-subtle disabled:text-fh-ink-disabled";

/** 12px semibold label + 8px gap, the standard label/control pairing. */
export function FieldLabel({
  htmlFor,
  children,
  className,
}: {
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn("block text-fh-label font-semibold text-fh-ink", className)}
    >
      {children}
    </label>
  );
}

export function FormField({
  label,
  hint,
  htmlFor,
  className,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      <div className="mt-2">{children}</div>
      {hint && <p className="mt-2 text-fh-meta text-fh-ink-2">{hint}</p>}
    </div>
  );
}

export function TextInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="text" {...props} className={cn(controlBase, "h-[38px]", className)} />;
}

export type SelectOption = { value: string; label: string };

export function SelectField({
  options,
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { options: SelectOption[] }) {
  return (
    <div className="relative">
      <select
        {...props}
        className={cn(controlBase, "h-[38px] appearance-none pr-9", className)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <IconChevronDown
        size={16}
        stroke={1.8}
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-fh-ink-2"
      />
    </div>
  );
}

/** Compact variant used inside card headers and table toolbars. */
export function SmallSelect({
  options,
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { options: SelectOption[] }) {
  return (
    <div className="relative">
      <select
        {...props}
        className={cn(
          "h-9 w-full appearance-none rounded-fh-control border border-fh-border-strong bg-fh-surface",
          "pr-8 pl-3 text-fh-compact text-fh-ink transition-colors hover:border-fh-ink-muted",
          className,
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <IconChevronDown
        size={16}
        stroke={1.8}
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-fh-ink-2"
      />
    </div>
  );
}

export function CheckboxField({
  label,
  checked,
  onChange,
  disabled,
  className,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 shrink-0 rounded-[3px] border-fh-border-strong accent-fh-button"
      />
      <label
        htmlFor={id}
        className={cn(
          "text-fh-compact select-none",
          disabled ? "text-fh-ink-disabled" : "text-fh-ink",
        )}
      >
        {label}
      </label>
    </div>
  );
}

export function RadioField({
  name,
  label,
  description,
  checked,
  onChange,
  className,
}: {
  name: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex gap-3", className)}>
      <input
        id={id}
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-4 w-4 shrink-0 border-fh-border-strong accent-fh-button"
      />
      <label htmlFor={id} className="min-w-0 cursor-pointer select-none">
        <span className="block text-fh-compact font-semibold text-fh-ink">{label}</span>
        {description && (
          <span className="mt-0.5 block text-fh-meta text-fh-ink-2">{description}</span>
        )}
      </label>
    </div>
  );
}

/**
 * Numeric stepper — a typable field with stacked increment/decrement
 * chevrons, matching the roster-position controls in the mockup.
 */
export function NumericStepper({
  label,
  value,
  onChange,
  min = 0,
  max = 99,
  className,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  className?: string;
}) {
  const id = useId();
  const clamp = (next: number) => Math.min(max, Math.max(min, next));

  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <label htmlFor={id} className="text-fh-compact text-fh-ink">
        {label}
      </label>
      <div className="flex h-9 w-[68px] shrink-0 items-center rounded-fh-control border border-fh-border-strong bg-fh-surface">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          value={value}
          min={min}
          max={max}
          onChange={(event) => onChange(clamp(Number(event.target.value) || 0))}
          className="h-full w-full min-w-0 rounded-l-fh-control bg-transparent px-2 text-fh-compact text-fh-ink [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <div className="flex h-full flex-col border-l border-fh-border">
          <button
            type="button"
            aria-label={`Increase ${label}`}
            onClick={() => onChange(clamp(value + 1))}
            className="flex h-1/2 w-6 items-center justify-center text-fh-ink-2 hover:bg-fh-subtle hover:text-fh-ink"
          >
            <IconPlus size={11} stroke={2.4} aria-hidden />
          </button>
          <button
            type="button"
            aria-label={`Decrease ${label}`}
            onClick={() => onChange(clamp(value - 1))}
            className="flex h-1/2 w-6 items-center justify-center border-t border-fh-border text-fh-ink-2 hover:bg-fh-subtle hover:text-fh-ink"
          >
            <IconMinus size={11} stroke={2.4} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
