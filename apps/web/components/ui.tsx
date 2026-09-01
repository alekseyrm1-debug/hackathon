// Shared presentational primitives: capability badges, buttons and card shells.
// Keeping them in one file is what stops the UI drifting into random colours.
import type { Capability } from "@toolfence/core";

export const CAPABILITY_STYLES: Record<Capability, { chip: string; dot: string; label: string }> = {
  read: {
    chip: "bg-[color:var(--color-read-soft)] text-[color:var(--color-read)] ring-1 ring-inset ring-emerald-200",
    dot: "bg-[color:var(--color-read)]",
    label: "read",
  },
  write: {
    chip: "bg-[color:var(--color-write-soft)] text-[color:var(--color-write)] ring-1 ring-inset ring-amber-200",
    dot: "bg-[color:var(--color-write)]",
    label: "write",
  },
  destructive: {
    chip: "bg-[color:var(--color-destructive-soft)] text-[color:var(--color-destructive)] ring-1 ring-inset ring-rose-200",
    dot: "bg-[color:var(--color-destructive)]",
    label: "destructive",
  },
};

export function CapabilityBadge({ capability }: { capability: Capability }) {
  const style = CAPABILITY_STYLES[capability];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide ${style.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      {style.label}
    </span>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-[color:var(--color-brand)] text-white hover:bg-indigo-800 disabled:bg-slate-300 disabled:text-slate-500",
  secondary:
    "bg-white text-[color:var(--color-ink)] ring-1 ring-inset ring-[color:var(--color-hairline)] hover:bg-slate-50 disabled:text-slate-400",
  ghost: "text-[color:var(--color-ink-muted)] hover:bg-slate-100 hover:text-[color:var(--color-ink)]",
  danger:
    "bg-white text-[color:var(--color-destructive)] ring-1 ring-inset ring-rose-200 hover:bg-[color:var(--color-destructive-soft)]",
};

// React 19 passes `ref` as an ordinary prop, so no forwardRef wrapper is needed.
export function Button({
  variant = "secondary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  ref?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${BUTTON_VARIANTS[variant]} ${className}`}
    />
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl bg-[color:var(--color-surface)] shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-[color:var(--color-hairline)] ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  title,
  detail,
  right,
}: {
  title: string;
  detail?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[color:var(--color-hairline)] px-4 py-3">
      <div>
        <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">{title}</h2>
        {detail ? <p className="mt-0.5 text-xs text-[color:var(--color-ink-muted)]">{detail}</p> : null}
      </div>
      {right}
    </div>
  );
}

/** Money formatting is pinned to one locale so SSR and the client agree. */
export const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
