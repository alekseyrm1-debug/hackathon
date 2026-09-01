// The inspector: what ToolFence generated from the page, why each tool got its
// capability, and a simulator so tools can be exercised without a real agent.
"use client";

import type { BoundTool, Capability, JsonSchemaProperty, ToolResult } from "@toolfence/core";
import { useMemo, useState } from "react";
import type { ToolFenceController } from "./useToolFence";
import { Button, CapabilityBadge, Card, SectionTitle } from "./ui";

const CAPABILITY_ORDER: readonly Capability[] = ["read", "write", "destructive"];

export function ToolInspector({
  controller,
  onRunScript,
  scriptRunning,
}: {
  controller: ToolFenceController;
  onRunScript: () => void;
  scriptRunning: boolean;
}) {
  const [filter, setFilter] = useState<Capability | "all">("all");
  const { tools, scanResult, lastScanAt } = controller;

  const counts = useMemo(() => {
    const result: Record<Capability, number> = { read: 0, write: 0, destructive: 0 };
    for (const tool of tools) result[tool.schema.capability] += 1;
    return result;
  }, [tools]);

  const shown = filter === "all" ? tools : tools.filter((tool) => tool.schema.capability === filter);

  return (
    <Card>
      <SectionTitle
        title={`Generated tools (${tools.length})`}
        detail={
          lastScanAt
            ? `Scanned ${scanResult?.candidates.length ?? 0} affordances from the live DOM${
                scanResult?.skipped.length ? `, skipped ${scanResult.skipped.length}` : ""
              }.`
            : "Scanning the page…"
        }
        right={
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" onClick={controller.rescan}>
              Rescan
            </Button>
            <Button variant="primary" onClick={onRunScript} disabled={scriptRunning || tools.length === 0}>
              {scriptRunning ? "Running…" : "Run agent script"}
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--color-hairline)] px-4 py-2.5">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          All {tools.length}
        </FilterChip>
        {CAPABILITY_ORDER.map((capability) => (
          <FilterChip
            key={capability}
            active={filter === capability}
            onClick={() => setFilter(capability)}
          >
            <CapabilityBadge capability={capability} />
            <span className="tabular-nums">{counts[capability]}</span>
          </FilterChip>
        ))}
      </div>

      <ul className="divide-y divide-[color:var(--color-hairline)]">
        {shown.map((tool) => (
          <ToolCard key={tool.schema.name} tool={tool} />
        ))}
        {shown.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-[color:var(--color-ink-muted)]">
            No tools in this category.
          </li>
        ) : null}
      </ul>
    </Card>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-[color:var(--color-ink)] text-white"
          : "text-[color:var(--color-ink-muted)] hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

function ToolCard({ tool }: { tool: BoundTool }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ToolResult | null>(null);
  const [busy, setBusy] = useState(false);

  const schema = tool.schema;
  const properties = Object.entries(schema.inputSchema.properties);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const args = buildArgs(values, schema.inputSchema.properties);
      setResult(await tool.execute(args));
    } catch (error) {
      setResult({ ok: false, message: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <code className="font-mono text-[13px] font-medium text-[color:var(--color-ink)]">
              {schema.name}
            </code>
            <CapabilityBadge capability={schema.capability} />
            {schema.enriched ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-[color:var(--color-ink-muted)]">
                AI named
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-[color:var(--color-ink-muted)]">
            {schema.description}
          </p>
        </div>
        <Button variant="secondary" onClick={() => setOpen((current) => !current)}>
          {open ? "Hide" : "Inspect"}
        </Button>
      </div>

      {open ? (
        <div className="tf-rise mt-3 space-y-4 rounded-lg bg-slate-50 p-3">
          <div>
            <Label>Why this capability</Label>
            <ul className="mt-1 space-y-1">
              {schema.classification.reasons.map((reason) => (
                <li key={`${reason.signalId}-${reason.source}`} className="text-xs text-[color:var(--color-ink-muted)]">
                  <span className="font-mono text-[11px] text-[color:var(--color-ink)]">
                    {reason.capability}
                  </span>
                  {" ← "}
                  <span className="font-medium text-[color:var(--color-ink)]">
                    &ldquo;{reason.matched}&rdquo;
                  </span>{" "}
                  in {reason.source} · {reason.rationale}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[11px] text-[color:var(--color-ink-muted)]">
              Confidence {Math.round(schema.classification.confidence * 100)}% · plan{" "}
              <code className="font-mono">{schema.plan.type}</code>
            </p>
          </div>

          <div>
            <Label>Simulate an agent call</Label>
            {properties.length === 0 ? (
              <p className="mt-1 text-xs text-[color:var(--color-ink-muted)]">
                This tool takes no arguments.
              </p>
            ) : (
              <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                {properties.map(([name, property]) => (
                  <ArgumentInput
                    key={name}
                    name={name}
                    property={property}
                    required={schema.inputSchema.required.includes(name)}
                    value={values[name] ?? ""}
                    onChange={(next) => setValues((current) => ({ ...current, [name]: next }))}
                  />
                ))}
              </div>
            )}
            <div className="mt-2.5 flex items-center gap-2">
              <Button
                variant={schema.capability === "destructive" ? "danger" : "primary"}
                onClick={() => void run()}
                disabled={busy}
              >
                {busy ? "Calling…" : "Call tool"}
              </Button>
              <span className="text-[11px] text-[color:var(--color-ink-muted)]">
                Runs through the same firewall a real agent would hit.
              </span>
            </div>
          </div>

          {result ? <ResultPanel result={result} /> : null}

          <details>
            <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-ink-muted)]">
              JSON Schema
            </summary>
            <pre className="mt-1.5 max-h-56 overflow-auto rounded-lg bg-slate-950 px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-100">
              {JSON.stringify(schema.inputSchema, null, 2)}
            </pre>
          </details>
        </div>
      ) : null}
    </li>
  );
}

function ArgumentInput({
  name,
  property,
  required,
  value,
  onChange,
}: {
  name: string;
  property: JsonSchemaProperty;
  required: boolean;
  value: string;
  onChange: (next: string) => void;
}) {
  const inputId = `arg-${name}-${property.type}`;
  const shared =
    "w-full rounded-lg border border-[color:var(--color-hairline)] bg-white px-2.5 py-1.5 text-xs outline-none";

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="font-mono text-[11px] text-[color:var(--color-ink)]">
        {name}
        {required ? <span className="text-[color:var(--color-destructive)]"> *</span> : null}
      </label>
      {property.enum ? (
        <select id={inputId} value={value} onChange={(event) => onChange(event.target.value)} className={shared}>
          <option value="">—</option>
          {property.enum.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : property.type === "boolean" ? (
        <select id={inputId} value={value} onChange={(event) => onChange(event.target.value)} className={shared}>
          <option value="">—</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      ) : (
        <input
          id={inputId}
          type={property.type === "string" ? "text" : "number"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={property.description.slice(0, 40)}
          className={shared}
        />
      )}
    </div>
  );
}

function ResultPanel({ result }: { result: ToolResult }) {
  const tone = result.blocked
    ? "bg-[color:var(--color-destructive-soft)] text-[color:var(--color-destructive)] ring-rose-200"
    : result.ok
      ? "bg-[color:var(--color-read-soft)] text-[color:var(--color-read)] ring-emerald-200"
      : "bg-[color:var(--color-write-soft)] text-[color:var(--color-write)] ring-amber-200";

  return (
    <div className="tf-rise">
      <Label>Result</Label>
      <p className={`mt-1 rounded-lg px-3 py-2 text-xs leading-relaxed ring-1 ring-inset ${tone}`}>
        {result.message}
      </p>
      {result.data !== undefined ? (
        <pre className="mt-1.5 max-h-56 overflow-auto rounded-lg bg-slate-950 px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-100">
          {JSON.stringify(result.data, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-ink-muted)]">
      {children}
    </p>
  );
}

/** Turns the simulator's string inputs into correctly typed JSON arguments. */
function buildArgs(
  values: Record<string, string>,
  properties: Readonly<Record<string, JsonSchemaProperty>>,
): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const [name, property] of Object.entries(properties)) {
    const raw = values[name];
    if (raw === undefined || raw === "") continue;
    if (property.type === "number" || property.type === "integer") {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) args[name] = parsed;
      continue;
    }
    if (property.type === "boolean") {
      args[name] = raw === "true";
      continue;
    }
    args[name] = raw;
  }
  return args;
}
