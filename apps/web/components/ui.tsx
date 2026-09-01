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

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-3.5 py-2 text-sm",
  lg: "px-5 py-2.5 text-sm",
};

/**
 * The one place a button's look is decided. The mould itself (rim, shadow,
 * press) lives in `.tf-key*` in globals.css so that a `<Link>` or an `<a>`
 * acting as a button can wear exactly the same key — see `softKey` below.
 */
export function softKey(variant: ButtonVariant | "chip" = "secondary", size: ButtonSize = "md") {
  return `tf-key tf-key--${variant} inline-flex select-none items-center justify-center gap-1.5 font-medium ${BUTTON_SIZES[size]}`;
}

// React 19 passes `ref` as an ordinary prop, so no forwardRef wrapper is needed.
export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  ref?: React.Ref<HTMLButtonElement>;
}) {
  return <button {...props} className={`${softKey(variant, size)} ${className}`} />;
}

/** A pill-shaped key that can stay held down — filters, segmented choices. */
export function ChipButton({
  active,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      {...props}
      className={`${softKey("chip", "sm")} ${className}`}
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
      className={`rounded-xl bg-[color:var(--color-surface)] shadow-[0_1px_1px_rgba(16,24,40,0.03),0_2px_6px_-2px_rgba(16,24,40,0.06),0_12px_28px_-16px_rgba(16,24,40,0.18)] ring-1 ring-[color:var(--color-hairline)] ${className}`}
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
