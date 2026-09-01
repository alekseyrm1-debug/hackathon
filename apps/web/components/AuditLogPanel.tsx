// Firewall controls plus the immutable record of every tool call: what was
// asked, with which arguments, and what the user decided.
"use client";

import type { AuditEntry, AuditOutcome, Capability, PolicyAction } from "@toolfence/core";
import { useState } from "react";
import type { ToolFenceController } from "./useToolFence";
import { Button, CapabilityBadge, Card, SectionTitle } from "./ui";

const OUTCOME_STYLES: Record<AuditOutcome, string> = {
  allowed: "bg-slate-100 text-slate-600",
  "allowed-once": "bg-[color:var(--color-read-soft)] text-[color:var(--color-read)]",
  "allowed-session": "bg-[color:var(--color-read-soft)] text-[color:var(--color-read)]",
  "auto-allowed-session": "bg-[color:var(--color-read-soft)] text-[color:var(--color-read)]",
  denied: "bg-[color:var(--color-destructive-soft)] text-[color:var(--color-destructive)]",
  blocked: "bg-[color:var(--color-destructive-soft)] text-[color:var(--color-destructive)]",
  error: "bg-[color:var(--color-write-soft)] text-[color:var(--color-write)]",
};

const OUTCOME_LABELS: Record<AuditOutcome, string> = {
  allowed: "allowed by policy",
  "allowed-once": "allowed once",
  "allowed-session": "allowed for session",
  "auto-allowed-session": "session grant",
  denied: "denied by user",
  blocked: "blocked by policy",
  error: "failed",
};

const CAPABILITIES: readonly Capability[] = ["read", "write", "destructive"];
const ACTIONS: readonly PolicyAction[] = ["allow", "prompt", "block"];

export function AuditLogPanel({ controller }: { controller: ToolFenceController }) {
  const { log, policy, grants } = controller;
  const denied = log.filter((entry) => entry.outcome === "denied" || entry.outcome === "blocked").length;

  return (
    <Card>
      <SectionTitle
        title="Capability firewall"
        detail={`${log.length} call(s) recorded · ${denied} stopped`}
        right={
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" onClick={controller.clearLog} disabled={log.length === 0}>
              Clear
            </Button>
            <Button variant="secondary" onClick={() => downloadLog(log)} disabled={log.length === 0}>
              Export JSON
            </Button>
          </div>
        }
      />

      <div className="space-y-3 border-b border-[color:var(--color-hairline)] px-4 py-3">
        <div className="grid gap-2 sm:grid-cols-3">
          {CAPABILITIES.map((capability) => (
            <div key={capability} className="flex flex-col gap-1.5">
              <CapabilityBadge capability={capability} />
              <select
                aria-label={`Policy for ${capability} tools`}
                value={policy[capability]}
                onChange={(event) =>
                  controller.updatePolicy({ [capability]: event.target.value as PolicyAction })
                }
                className="rounded-lg border border-[color:var(--color-hairline)] bg-white px-2.5 py-1.5 text-xs outline-none"
              >
                {ACTIONS.map((action) => (
                  <option key={action} value={action}>
                    {action === "prompt" ? "ask the user" : action}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <label className="flex items-start gap-2 text-xs text-[color:var(--color-ink-muted)]">
          <input
            type="checkbox"
            checked={policy.strictUnknown}
            onChange={(event) => controller.updatePolicy({ strictUnknown: event.target.checked })}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium text-[color:var(--color-ink)]">Strict mode.</span> Also ask
            before running any tool the classifier is less than{" "}
            {Math.round(policy.strictThreshold * 100)}% confident about.
          </span>
        </label>

        {grants.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-[color:var(--color-brand-soft)] px-3 py-2">
            <span className="text-xs text-[color:var(--color-ink)]">
              Session grants: {grants.map((name) => name).join(", ")}
            </span>
            <Button variant="ghost" onClick={controller.revokeGrants}>
              Revoke
            </Button>
          </div>
        ) : null}
      </div>

      {log.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-[color:var(--color-ink-muted)]">
          No tool calls yet. Every call an agent makes will appear here.
        </p>
      ) : (
        <ul className="max-h-[26rem] divide-y divide-[color:var(--color-hairline)] overflow-auto">
          {[...log].reverse().map((entry) => (
            <LogRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function LogRow({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);
  const hasArgs = Object.keys(entry.args).length > 0;

  return (
    <li className="px-4 py-2.5">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full flex-wrap items-center gap-2 text-left"
      >
        <span className="font-mono text-[11px] tabular-nums text-[color:var(--color-ink-muted)]">
          {formatTime(entry.at)}
        </span>
        <code className="font-mono text-[12px] text-[color:var(--color-ink)]">{entry.toolName}</code>
        <CapabilityBadge capability={entry.capability} />
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${OUTCOME_STYLES[entry.outcome]}`}
        >
          {OUTCOME_LABELS[entry.outcome]}
        </span>
        <span className="ml-auto text-[11px] text-[color:var(--color-ink-muted)]">
          {entry.origin} · {entry.durationMs}ms
        </span>
      </button>
      {open ? (
        <div className="tf-rise mt-2 space-y-1.5">
          <p className="text-xs leading-relaxed text-[color:var(--color-ink-muted)]">{entry.message}</p>
          {hasArgs ? (
            <pre className="max-h-40 overflow-auto rounded-lg bg-slate-950 px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-100">
              {JSON.stringify(entry.args, null, 2)}
            </pre>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

const TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function formatTime(at: number): string {
  return TIME_FORMAT.format(new Date(at));
}

/** Exports the log so it can be attached to an incident report. */
function downloadLog(log: readonly AuditEntry[]): void {
  try {
    const blob = new Blob([JSON.stringify(log, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `toolfence-audit-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch {
    // Download blocked (sandboxed iframe, for example) — not worth breaking the page.
  }
}
