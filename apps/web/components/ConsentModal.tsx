// The consent gate the user actually sees. Calm and factual on purpose: it shows
// the tool, the exact arguments, and what would change — not a red warning.
"use client";

import type { ConsentDecision } from "@toolfence/core";
import { useEffect, useRef } from "react";
import type { PendingConsent } from "./useToolFence";
import { Button, CapabilityBadge } from "./ui";

export function ConsentModal({
  pending,
  onDecide,
}: {
  pending: PendingConsent | null;
  onDecide: (decision: ConsentDecision) => void;
}) {
  const denyRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pending) return;
    denyRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      // Escape must fail closed, exactly like pressing Deny.
      if (event.key === "Escape") {
        event.preventDefault();
        onDecide("deny");
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pending, onDecide]);

  if (!pending) return null;
  const { request } = pending;
  const args = Object.keys(request.args).length > 0 ? request.args : null;

  return (
    <div
      data-toolfence-ignore
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/25 p-4 backdrop-blur-[2px] sm:items-center"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-title"
        aria-describedby="consent-effect"
        className="tf-rise w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-900/10"
      >
        <div className="flex items-start gap-3 border-b border-[color:var(--color-hairline)] px-5 py-4">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-brand-soft)]">
            <ShieldIcon />
          </div>
          <div className="min-w-0">
            <h2 id="consent-title" className="text-[15px] font-semibold text-[color:var(--color-ink)]">
              An agent wants to run a {request.capability} tool
            </h2>
            <p className="mt-0.5 text-xs text-[color:var(--color-ink-muted)]">
              ToolFence paused the call. Nothing has happened on the page yet.
            </p>
          </div>
        </div>

        <div className="space-y-4 px-5 py-4">
          <Row label="Tool">
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[13px] text-[color:var(--color-ink)]">
                {request.toolName}
              </code>
              <CapabilityBadge capability={request.capability} />
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-[color:var(--color-ink-muted)]">
              {request.toolDescription}
            </p>
          </Row>

          <Row label="Arguments">
            {args ? (
              <pre className="max-h-40 overflow-auto rounded-lg bg-slate-950 px-3 py-2 font-mono text-[12px] leading-relaxed text-slate-100">
                {JSON.stringify(args, null, 2)}
              </pre>
            ) : (
              <p className="text-xs text-[color:var(--color-ink-muted)]">No arguments.</p>
            )}
          </Row>

          <Row label="What will change">
            <p id="consent-effect" className="text-[13px] leading-relaxed text-[color:var(--color-ink)]">
              {request.effect}
            </p>
          </Row>

          <Row label="Why it needs approval">
            <ul className="space-y-1">
              {request.reasons
                .filter((reason) => reason.capability === request.capability)
                .slice(0, 4)
                .map((reason) => (
                  <li key={reason.signalId} className="text-xs leading-relaxed text-[color:var(--color-ink-muted)]">
                    <span className="font-medium text-[color:var(--color-ink)]">
                      &ldquo;{reason.matched}&rdquo;
                    </span>{" "}
                    in {reason.source} — {reason.rationale}
                  </li>
                ))}
            </ul>
          </Row>
        </div>

        <div className="flex flex-col gap-2 border-t border-[color:var(--color-hairline)] bg-slate-50 px-5 py-3 sm:flex-row sm:justify-end">
          <Button ref={denyRef} variant="secondary" onClick={() => onDecide("deny")}>
            Deny
          </Button>
          <Button variant="secondary" onClick={() => onDecide("allow-session")}>
            Allow for this session
          </Button>
          <Button variant="primary" onClick={() => onDecide("allow-once")}>
            Allow once
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-ink-muted)]">
        {label}
      </p>
      {children}
    </div>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 text-[color:var(--color-brand)]">
      <path
        fill="currentColor"
        d="M10 1.5 3.5 4v5.1c0 3.9 2.6 7.5 6.5 8.9 3.9-1.4 6.5-5 6.5-8.9V4L10 1.5Zm3.2 6.4-3.7 4.2a.8.8 0 0 1-1.2 0L6.8 10.4a.8.8 0 1 1 1.2-1l1 1.1 3.1-3.6a.8.8 0 0 1 1.1 1Z"
      />
    </svg>
  );
}
