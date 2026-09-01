// Landing page: the claim, the problem, the pipeline, and how to try it.
import Link from "next/link";

const PIPELINE = [
  {
    step: "scan",
    title: "Read the accessibility tree",
    body: "A pure function walks roles, aria-*, <label> associations and semantic tags. Class names are ignored — they mean nothing on a Tailwind site.",
  },
  {
    step: "generate",
    title: "Write the tool schemas",
    body: "Each affordance becomes a WebMCP tool with a JSON Schema. Buttons repeated across table rows collapse into one tool with a row parameter.",
  },
  {
    step: "classify",
    title: "Assign a capability",
    body: "A documented signal lexicon sorts every tool into read, write or destructive — and records exactly which signals fired.",
  },
  {
    step: "gate",
    title: "Ask before the dangerous ones",
    body: "Destructive calls stop at a consent dialog showing the tool, the literal arguments, and the row that would be affected. Deny returns a clean error to the agent.",
  },
];

const CAPABILITIES = [
  {
    name: "read",
    color: "text-[color:var(--color-read)] bg-[color:var(--color-read-soft)] ring-emerald-200",
    meaning: "Returns information",
    behaviour: "Runs immediately",
    example: "list_invoices, filter_invoices",
  },
  {
    name: "write",
    color: "text-[color:var(--color-write)] bg-[color:var(--color-write-soft)] ring-amber-200",
    meaning: "Changes stored state",
    behaviour: "Runs, and is recorded",
    example: "create_invoice",
  },
  {
    name: "destructive",
    color: "text-[color:var(--color-destructive)] bg-[color:var(--color-destructive-soft)] ring-rose-200",
    meaning: "Irreversible, costs money, or leaves your control",
    behaviour: "Blocked until the user approves",
    example: "delete_invoice, send_invoice_to_client",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-[color:var(--color-hairline)] bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[color:var(--color-brand)] text-[11px] font-bold text-white">
              TF
            </span>
            ToolFence
          </span>
          <Link
            href="/playground"
            className="rounded-lg bg-[color:var(--color-brand)] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-800"
          >
            Open the playground
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5">
        <section className="py-16 sm:py-24">
          <p className="text-xs font-medium uppercase tracking-widest text-[color:var(--color-brand)]">
            WebMCP · generation + safety
          </p>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-[color:var(--color-ink)] sm:text-5xl">
            Turn any web app into WebMCP tools — and never let a dangerous one run without consent.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-[color:var(--color-ink-muted)]">
            ToolFence reads a page&rsquo;s accessibility tree and publishes working WebMCP tools at
            runtime. Then it does the part nobody has built yet: it classifies every generated tool as{" "}
            <em>read</em>, <em>write</em> or <em>destructive</em>, and stops the destructive ones at a
            consent dialog that shows the user exactly what the agent is about to do.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/playground"
              className="rounded-lg bg-[color:var(--color-brand)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-800"
            >
              Try the live demo
            </Link>
            <a
              href="https://github.com/alekseyrm1-debug/hackathon"
              className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium ring-1 ring-inset ring-[color:var(--color-hairline)] transition-colors hover:bg-slate-50"
            >
              Read the source
            </a>
            <span className="text-xs text-[color:var(--color-ink-muted)]">
              MIT licensed · no API key required
            </span>
          </div>
        </section>

        <section className="pb-16">
          <h2 className="text-lg font-semibold">The two problems with WebMCP today</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <article className="rounded-xl bg-white p-5 ring-1 ring-[color:var(--color-hairline)]">
              <p className="text-sm font-medium">1. Every tool is written by hand</p>
              <p className="mt-2 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">
                A site with a search box, a table and a create form needs a developer to write, name,
                schema and maintain each tool. That work has to happen before an agent can do anything
                at all, which is why adoption is slow.
              </p>
            </article>
            <article className="rounded-xl bg-white p-5 ring-1 ring-[color:var(--color-hairline)]">
              <p className="text-sm font-medium">2. Easy tools make a new hazard</p>
              <p className="mt-2 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">
                The moment tools are cheap to publish, a page exposes deleting, paying and sending
                alongside searching. WebMCP has no opinion about which is which, so a confused or
                prompt-injected agent can do real damage before anyone notices.
              </p>
            </article>
          </div>
        </section>

        <section className="pb-16">
          <h2 className="text-lg font-semibold">How it works</h2>
          <ol className="mt-4 grid gap-3 sm:grid-cols-2">
            {PIPELINE.map((stage, index) => (
              <li key={stage.step} className="rounded-xl bg-white p-5 ring-1 ring-[color:var(--color-hairline)]">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold tabular-nums">
                    {index + 1}
                  </span>
                  <code className="font-mono text-xs text-[color:var(--color-brand)]">{stage.step}</code>
                </div>
                <p className="mt-2 text-sm font-medium">{stage.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">
                  {stage.body}
                </p>
              </li>
            ))}
          </ol>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-slate-950 px-5 py-4 font-mono text-[12px] leading-relaxed text-slate-100">
{`document ──scan──▶ ScanResult ──generate──▶ ToolSchema[]
                                            │
                              classify (RISK_SIGNALS)
                                            │
                                    ┌───────┴────────┐
                                  read/write     destructive
                                    │                │
                                  run          consent modal ──deny──▶ "Blocked by user."
                                    └───────┬────────┘
                                        AuditLog
                                            │
                             navigator.modelContext.registerTool`}
          </pre>
        </section>

        <section className="pb-16">
          <h2 className="text-lg font-semibold">Three capabilities, one rule each</h2>
          <div className="mt-4 overflow-x-auto rounded-xl bg-white ring-1 ring-[color:var(--color-hairline)]">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-hairline)] text-left text-xs uppercase tracking-wide text-[color:var(--color-ink-muted)]">
                  <th scope="col" className="px-5 py-2.5 font-medium">Capability</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Meaning</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">Behaviour</th>
                  <th scope="col" className="px-5 py-2.5 font-medium">In the demo</th>
                </tr>
              </thead>
              <tbody>
                {CAPABILITIES.map((row) => (
                  <tr key={row.name} className="border-b border-[color:var(--color-hairline)] last:border-0">
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${row.color}`}>
                        {row.name}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[color:var(--color-ink-muted)]">{row.meaning}</td>
                    <td className="px-5 py-3 text-[color:var(--color-ink-muted)]">{row.behaviour}</td>
                    <td className="px-5 py-3 font-mono text-xs text-[color:var(--color-ink-muted)]">
                      {row.example}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="pb-16">
          <h2 className="text-lg font-semibold">Try it with a real agent</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <article className="rounded-xl bg-white p-5 ring-1 ring-[color:var(--color-hairline)]">
              <p className="text-sm font-medium">In ChatGPT&rsquo;s browser</p>
              <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">
                <li>Open the playground URL in a browsing session that supports WebMCP.</li>
                <li>The banner turns green once <code className="font-mono text-xs">navigator.modelContext</code> is found.</li>
                <li>
                  Ask: <em>&ldquo;Show me the overdue invoices, then delete the oldest one.&rdquo;</em>
                </li>
                <li>The read runs silently. The delete stops at the consent dialog.</li>
              </ol>
            </article>
            <article className="rounded-xl bg-white p-5 ring-1 ring-[color:var(--color-hairline)]">
              <p className="text-sm font-medium">In plain Chrome</p>
              <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">
                <li>
                  Optional: enable <code className="font-mono text-xs">chrome://flags/#enable-webmcp-testing</code>.
                </li>
                <li>Without it, the page still generates and classifies every tool.</li>
                <li>
                  Press <strong>Run agent script</strong>, or open any tool and press <strong>Call tool</strong>.
                </li>
                <li>Identical firewall, identical audit log — no agent required.</li>
              </ol>
            </article>
          </div>
        </section>
      </main>

      <footer className="border-t border-[color:var(--color-hairline)] bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-[color:var(--color-ink-muted)]">
          <span>ToolFence — built for the OpenAI WebMCP Challenge. MIT licensed.</span>
          <Link href="/playground" className="font-medium text-[color:var(--color-brand)]">
            Open the playground →
          </Link>
        </div>
      </footer>
    </div>
  );
}
