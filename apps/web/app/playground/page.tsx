// The playground: a real dashboard on the left, everything ToolFence derived
// from it on the right. The two sides share nothing but the DOM.
"use client";

import type { BoundTool, ToolResult } from "@toolfence/core";
import Link from "next/link";
import { useCallback, useState } from "react";
import { AuditLogPanel } from "@/components/AuditLogPanel";
import { ConsentModal } from "@/components/ConsentModal";
import { InvoiceApp } from "@/components/InvoiceApp";
import { ToolInspector } from "@/components/ToolInspector";
import { Button, Card, SectionTitle } from "@/components/ui";
import { useToolFence } from "@/components/useToolFence";

interface ScriptStep {
  readonly tool: string;
  readonly args: Record<string, unknown>;
  readonly result: ToolResult;
}

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
    <div className="min-h-screen">
      <TopBar />
      <WebMcpBanner controller={controller} />

      <main className="mx-auto grid max-w-[110rem] gap-5 px-4 py-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,29rem)]">
        <div className="min-w-0">
          <InvoiceApp />
        </div>

        <aside data-toolfence-ignore className="flex min-w-0 flex-col gap-5">
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

function TopBar() {
  return (
    <header
      data-toolfence-ignore
      className="sticky top-0 z-30 border-b border-[color:var(--color-hairline)] bg-white/85 backdrop-blur"
    >
      <div className="mx-auto flex max-w-[110rem] items-center justify-between gap-4 px-4 py-2.5">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-[color:var(--color-ink)]">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[color:var(--color-brand)] text-[11px] font-bold text-white">
            TF
          </span>
          ToolFence
          <span className="font-normal text-[color:var(--color-ink-muted)]">Playground</span>
        </Link>
        <Link
          href="/"
          className="text-xs font-medium text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)]"
        >
          How it works →
        </Link>
      </div>
    </header>
  );
}

function WebMcpBanner({ controller }: { controller: ReturnType<typeof useToolFence> }) {
  const { webmcp, registrationMode, tools } = controller;
  const live = webmcp.available && registrationMode !== "unavailable";

  return (
    <div
      data-toolfence-ignore
      className={`border-b px-4 py-2 text-xs ${
        live
          ? "border-emerald-200 bg-[color:var(--color-read-soft)] text-[color:var(--color-read)]"
          : "border-[color:var(--color-hairline)] bg-white text-[color:var(--color-ink-muted)]"
      }`}
    >
      <div className="mx-auto flex max-w-[110rem] flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${live ? "bg-[color:var(--color-read)]" : "bg-slate-400"}`}
          aria-hidden="true"
        />
        {live ? (
          <span>
            <strong className="font-semibold">WebMCP connected.</strong> {tools.length} tool(s) registered
            via <code className="font-mono">navigator.modelContext.{registrationMode}</code>.
          </span>
        ) : (
          <span>
            <strong className="font-semibold text-[color:var(--color-ink)]">WebMCP not detected.</strong>{" "}
            Enable <code className="font-mono">chrome://flags/#enable-webmcp-testing</code>, or open this
            page in ChatGPT&rsquo;s browser. Everything below still works — use{" "}
            <em>Call tool</em> in the inspector to drive the generated tools yourself.
          </span>
        )}
      </div>
    </div>
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

function AiModeCard({ controller }: { controller: ReturnType<typeof useToolFence> }) {
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
