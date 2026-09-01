// The playground: a real dashboard on the left, everything ToolFence derived
// from it on the right. The two sides share nothing but the DOM.
"use client";

import type { BoundTool, Capability, ToolResult } from "@toolfence/core";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { AuditLogPanel } from "../../components/AuditLogPanel";
import { ConsentModal } from "../../components/ConsentModal";
import { InvoiceApp } from "../../components/InvoiceApp";
import { ToolInspector } from "../../components/ToolInspector";
import { Button, CAPABILITY_STYLES, Card, SectionTitle } from "../../components/ui";
import type { ToolFenceController } from "../../components/useToolFence";
import { useToolFence } from "../../components/useToolFence";

interface ScriptStep {
  readonly tool: string;
  readonly args: Record<string, unknown>;
  readonly result: ToolResult;
}

const CAPABILITIES: readonly Capability[] = ["read", "write", "destructive"];

export default function PlaygroundPage() {
  const controller = useToolFence("#invoice-app");
  const [steps, setSteps] = useState<readonly ScriptStep[]>([]);
  const [running, setRunning] = useState(false);

  const runScript = useCallback(async () => {
    setRunning(true);
    setSteps([]);
    const collected: ScriptStep[] = [];

    const call = async (tool: BoundTool | undefined, args: Record<string, unknown>) => {
      if (!tool) return undefined;
      const result = await tool.execute(args);
      collected.push({ tool: tool.schema.name, args, result });
      setSteps([...collected]);
      return result;
    };

    try {
      const filter = pick(controller.tools, "set-value");
      const list = pick(controller.tools, "read-collection");
      const destructive = controller.tools.find(
        (tool) => tool.schema.plan.type === "row-action" && tool.schema.capability === "destructive",
      );

      await call(filter, { status: "overdue" });
      const listed = await call(list, {});
      const firstRow = firstRowKey(listed);

      if (destructive && firstRow) {
        const parameter = Object.keys(destructive.schema.inputSchema.properties)[0] ?? "row";
        await call(destructive, { [parameter]: firstRow });
      }
    } finally {
      setRunning(false);
    }
  }, [controller.tools]);

  return (
    <div className="tf-canvas min-h-screen">
      <TopBar controller={controller} />
      <WebMcpNotice controller={controller} />
      <ToolSummaryBar controller={controller} />

      <main className="mx-auto grid max-w-[110rem] gap-5 px-4 py-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,29rem)]">
        <div className="min-w-0">
          <InvoiceApp />
        </div>

        <aside
          id="tool-inspector"
          data-toolfence-ignore
          className="flex min-w-0 scroll-mt-16 flex-col gap-5"
        >
          <ToolInspector controller={controller} onRunScript={() => void runScript()} scriptRunning={running} />
          {steps.length > 0 ? <ScriptTranscript steps={steps} /> : null}
          <AuditLogPanel controller={controller} />
          <AiModeCard controller={controller} />
        </aside>
      </main>

      <ConsentModal pending={controller.pending} onDecide={controller.decide} />
    </div>
  );
}

function TopBar({ controller }: { controller: ToolFenceController }) {
  const live = isLive(controller);
  return (
    <header
      data-toolfence-ignore
      className="sticky top-0 z-30 border-b border-[color:var(--color-hairline)] bg-white/85 backdrop-blur"
    >
      <div className="mx-auto flex max-w-[110rem] items-center justify-between gap-3 px-4 py-2.5">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-[color:var(--color-ink)]">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[color:var(--color-brand)] text-[11px] font-bold text-white">
            TF
          </span>
          ToolFence
          <span className="hidden font-normal text-[color:var(--color-ink-muted)] sm:inline">Playground</span>
        </Link>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
              live
                ? "bg-[color:var(--color-read-soft)] text-[color:var(--color-read)]"
                : "bg-slate-100 text-[color:var(--color-ink-muted)]"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${live ? "bg-[color:var(--color-read)]" : "bg-slate-400"}`}
              aria-hidden="true"
            />
            WebMCP {live ? "live" : "off"}
          </span>
          <Link
            href="/foreign"
            className="hidden text-xs font-medium text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)] sm:inline"
          >
            On someone else&rsquo;s site →
          </Link>
          <Link
            href="/"
            className="hidden text-xs font-medium text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)] sm:inline"
          >
            How it works →
          </Link>
        </div>
      </div>
    </header>
  );
}

/**
 * One compact line. The full "how to enable" text sits behind a disclosure so it
 * does not eat five lines of a phone screen before the demo starts.
 */
function WebMcpNotice({ controller }: { controller: ToolFenceController }) {
  const { registrationMode, tools } = controller;
  const live = isLive(controller);

  if (live) {
    return (
      <div
        data-toolfence-ignore
        className="border-b border-emerald-200 bg-[color:var(--color-read-soft)] text-[color:var(--color-read)]"
      >
        <p className="mx-auto max-w-[110rem] px-4 py-2 text-xs">
          <strong className="font-semibold">WebMCP connected.</strong> {tools.length} tool(s) registered via{" "}
          <code className="font-mono">navigator.modelContext.{registrationMode}</code>.
        </p>
      </div>
    );
  }

  return (
    <div data-toolfence-ignore className="border-b border-[color:var(--color-hairline)] bg-white">
      <details className="group mx-auto max-w-[110rem] px-4">
        <summary className="flex cursor-pointer list-none items-center gap-2 py-2 text-xs text-[color:var(--color-ink-muted)]">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" aria-hidden="true" />
          <span className="min-w-0">
            <strong className="font-semibold text-[color:var(--color-ink)]">WebMCP not detected.</strong> Every
            tool below still works.
          </span>
          <span className="ml-auto shrink-0 font-medium text-[color:var(--color-brand)] group-open:hidden">
            How to enable
          </span>
          <span className="ml-auto hidden shrink-0 font-medium text-[color:var(--color-brand)] group-open:inline">
            Hide
          </span>
        </summary>
        <p className="pb-2.5 text-xs leading-relaxed text-[color:var(--color-ink-muted)]">
          Enable <code className="font-mono">chrome://flags/#enable-webmcp-testing</code> and restart Chrome, or
          open this page in ChatGPT&rsquo;s browser. Without it, ToolFence still scans the page, generates the
          tools and enforces the firewall — press <em>Run agent script</em>, or <em>Call tool</em> on any tool,
          to drive them yourself.
        </p>
      </details>
    </div>
  );
}

/**
 * On narrow screens the inspector sits far below the dashboard, so the headline
 * result — how many tools, and how risky — is shown up front with a jump link.
 */
function ToolSummaryBar({ controller }: { controller: ToolFenceController }) {
  const counts = useMemo(() => {
    const result: Record<Capability, number> = { read: 0, write: 0, destructive: 0 };
    for (const tool of controller.tools) result[tool.schema.capability] += 1;
    return result;
  }, [controller.tools]);

  return (
    <nav
      data-toolfence-ignore
      aria-label="Generated tools summary"
      className="border-b border-[color:var(--color-hairline)] bg-white xl:hidden"
    >
      <a href="#tool-inspector" className="mx-auto flex max-w-[110rem] items-center gap-2 px-4 py-2.5">
        <span className="text-xs font-semibold text-[color:var(--color-ink)]">
          {controller.tools.length} tools generated
        </span>
        <span className="flex items-center gap-1.5">
          {CAPABILITIES.map((capability) => (
            <span
              key={capability}
              title={capability}
              className="inline-flex items-center gap-1 text-[11px] tabular-nums text-[color:var(--color-ink-muted)]"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${CAPABILITY_STYLES[capability].dot}`}
                aria-hidden="true"
              />
              {counts[capability]}
            </span>
          ))}
        </span>
        <span className="ml-auto shrink-0 text-xs font-medium text-[color:var(--color-brand)]">Inspect ↓</span>
      </a>
    </nav>
  );
}

function ScriptTranscript({ steps }: { steps: readonly ScriptStep[] }) {
  return (
    <Card>
      <SectionTitle title="Agent transcript" detail="A scripted agent session, run against the page." />
      <ol className="divide-y divide-[color:var(--color-hairline)]">
        {steps.map((step, index) => (
          <li key={`${step.tool}-${index}`} className="px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[11px] font-medium tabular-nums">
                {index + 1}
              </span>
              <code className="font-mono text-[12px]">{step.tool}</code>
              <code className="truncate font-mono text-[11px] text-[color:var(--color-ink-muted)]">
                {JSON.stringify(step.args)}
              </code>
            </div>
            <p
              className={`mt-1.5 text-xs leading-relaxed ${
                step.result.blocked
                  ? "font-medium text-[color:var(--color-destructive)]"
                  : "text-[color:var(--color-ink-muted)]"
              }`}
            >
              {step.result.message}
            </p>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function AiModeCard({ controller }: { controller: ToolFenceController }) {
  const { ai } = controller;
  return (
    <Card>
      <SectionTitle
        title="AI naming (optional)"
        detail="Heuristics always run. A model can rewrite names and descriptions — never capabilities."
        right={
          <Button
            variant={ai.enabled ? "secondary" : "primary"}
            onClick={() => controller.setAiEnabled(!ai.enabled)}
          >
            {ai.enabled ? "Turn off" : "Turn on"}
          </Button>
        }
      />
      <p className="px-4 py-3 text-xs leading-relaxed text-[color:var(--color-ink-muted)]">{ai.reason}</p>
    </Card>
  );
}

function isLive(controller: ToolFenceController): boolean {
  return controller.webmcp.available && controller.registrationMode !== "unavailable";
}

function pick(tools: readonly BoundTool[], planType: string): BoundTool | undefined {
  return tools.find((tool) => tool.schema.plan.type === planType);
}

/** Pulls the first row identifier out of a list_* result, whatever it is called. */
function firstRowKey(result: ToolResult | undefined): string | null {
  if (!result || typeof result.data !== "object" || result.data === null) return null;
  const rows = (result.data as { rows?: unknown }).rows;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const first: unknown = rows[0];
  if (typeof first !== "object" || first === null) return null;
  const values = Object.values(first as Record<string, unknown>);
  const candidate = values.find((value) => typeof value === "string" && value.trim().length > 0);
  return typeof candidate === "string" ? candidate : null;
}
