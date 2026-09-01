// Landing page: the claim, the problem, the pipeline, and how to try it.
//
// The page is built in two halves. The hero, the diagram and the footer sit on
// ink; everything that explains the product sits on the light canvas between
// them. That alternation is doing the work an illustration would otherwise do —
// it gives the page a spine, and it lets the one screenshot-like element (the
// consent dialog in the hero) read as the product rather than as decoration.
import Link from "next/link";
import { softKey } from "../components/ui";

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
    tint: "text-[color:var(--color-read)] bg-[color:var(--color-read-soft)] ring-emerald-200",
    rule: "Runs immediately",
    meaning: "Returns information and changes nothing.",
    examples: ["list_invoices", "filter_invoices"],
  },
  {
    name: "write",
    tint: "text-[color:var(--color-write)] bg-[color:var(--color-write-soft)] ring-amber-200",
    rule: "Runs, and is recorded",
    meaning: "Changes stored state, but the change can be undone by hand.",
    examples: ["create_invoice"],
  },
  {
    name: "destructive",
    tint: "text-[color:var(--color-destructive)] bg-[color:var(--color-destructive-soft)] ring-rose-200",
    rule: "Blocked until approved",
    meaning: "Irreversible, costs money, or leaves your control.",
    examples: ["delete_invoice", "send_invoice_to_client"],
  },
];

// Figures the demo itself produces, so the strip under the hero is a claim the
// rest of the page can be checked against.
const FIGURES = [
  { value: "0", label: "tools written by hand" },
  { value: "19", label: "tools generated across two foreign pages" },
  { value: "3", label: "capabilities, one rule each" },
  { value: "1", label: "dialog between an agent and a refund" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <div className="tf-night tf-grid relative isolate overflow-hidden">
        <header className="relative z-10 border-b border-[color:var(--color-night-line)]">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
            <span className="flex items-center gap-2 text-sm font-semibold text-white">
              <BrandMark />
              ToolFence
            </span>
            <span className="flex items-center gap-2">
              <a
                href="https://github.com/alekseyrm1-debug/hackathon"
                className="hidden rounded-lg px-2.5 py-1 text-xs font-medium text-[color:var(--color-night-muted)] transition-colors hover:text-white md:inline-flex"
              >
                Source
              </a>
              <Link
                href="/foreign"
                className="hidden rounded-lg px-2.5 py-1 text-xs font-medium text-[color:var(--color-night-muted)] transition-colors hover:text-white sm:inline-flex"
              >
                On someone else&rsquo;s site
              </Link>
              <Link href="/playground" className={softKey("primary", "sm")}>
                Open the playground
              </Link>
            </span>
          </div>
        </header>

        <section className="relative z-10 mx-auto grid max-w-6xl gap-12 px-4 pb-14 pt-14 sm:px-5 sm:pb-16 sm:pt-24 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-10 lg:pb-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--color-night-ink)] ring-1 ring-inset ring-white/15">
              <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-brand-lit)]" aria-hidden="true" />
              WebMCP · generation + safety
            </span>
            <h1 className="mt-6 max-w-2xl text-[2.1rem] font-semibold leading-[1.06] text-white sm:text-[3.4rem]">
              Turn any web app into WebMCP tools — and <span className="tf-lit">never let a dangerous one run</span>{" "}
              without consent.
            </h1>
            <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-[color:var(--color-night-muted)]">
              ToolFence reads a page&rsquo;s accessibility tree and publishes working WebMCP tools at
              runtime. Then it does the part nobody has built yet: it classifies every generated tool
              as <em className="not-italic text-[color:var(--color-night-ink)]">read</em>,{" "}
              <em className="not-italic text-[color:var(--color-night-ink)]">write</em> or{" "}
              <em className="not-italic text-[color:var(--color-night-ink)]">destructive</em>, and stops
              the destructive ones at a dialog that shows the user exactly what the agent is about to do.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/playground" className={softKey("primary", "lg")}>
                Try the live demo
              </Link>
              <Link
                href="/foreign"
                className="tf-key tf-glass inline-flex select-none items-center justify-center px-5 py-2.5 text-sm font-medium text-white"
              >
                Watch it work on a page we didn&rsquo;t write
              </Link>
              <span className="text-xs text-[color:var(--color-night-muted)]">
                MIT licensed · no API key required
              </span>
            </div>
          </div>

          <ConsentPreview />
        </section>

        <div className="relative z-10 border-t border-[color:var(--color-night-line)]">
          <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-x-4 gap-y-6 px-4 py-7 sm:px-5 sm:grid-cols-4">
            {FIGURES.map((figure) => (
              <div key={figure.label}>
                <dt className="text-2xl font-semibold tabular-nums text-white">{figure.value}</dt>
                <dd className="mt-0.5 max-w-[14rem] text-xs leading-relaxed text-[color:var(--color-night-muted)]">
                  {figure.label}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <main className="tf-canvas">
        <div className="mx-auto max-w-6xl px-4 sm:px-5">
          <section className="py-16 sm:py-20">
            <SectionHeading
              eyebrow="Why this exists"
              title="The two problems with WebMCP today"
            />
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {[
                {
                  n: "01",
                  title: "Every tool is written by hand",
                  body: "A site with a search box, a table and a create form needs a developer to write, name, schema and maintain each tool. That work has to happen before an agent can do anything at all, which is why adoption is slow.",
                },
                {
                  n: "02",
                  title: "Easy tools make a new hazard",
                  body: "The moment tools are cheap to publish, a page exposes deleting, paying and sending alongside searching. WebMCP has no opinion about which is which, so a confused or prompt-injected agent can do real damage before anyone notices.",
                },
              ].map((problem) => (
                <article key={problem.n} className="tf-card tf-card--interactive p-6">
                  <span className="font-mono text-xs font-medium text-[color:var(--color-brand)]">
                    {problem.n}
                  </span>
                  <p className="mt-3 text-base font-semibold">{problem.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">
                    {problem.body}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section className="pb-16 sm:pb-20">
            <SectionHeading
              eyebrow="The pipeline"
              title="How it works"
              detail="Four pure steps. Everything before the last one is testable without a browser."
            />
            {/* The rail is the point: these are stages of one pass, not four
                features, so they are drawn as a track with stops on it. */}
            <ol className="mt-8 grid gap-4 md:grid-cols-4">
              {PIPELINE.map((stage, index) => (
                <li key={stage.step} className="relative">
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-brand)] text-[11px] font-semibold tabular-nums text-white shadow-[0_6px_14px_-6px_rgba(67,56,202,0.8)]">
                      {index + 1}
                    </span>
                    <span
                      className="h-px flex-1 bg-gradient-to-r from-[color:var(--color-hairline)] to-transparent"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="tf-card tf-card--interactive mt-3 h-[calc(100%-2.5rem)] p-5">
                    <code className="font-mono text-xs font-medium text-[color:var(--color-brand)]">
                      {stage.step}
                    </code>
                    <p className="mt-2 text-sm font-semibold">{stage.title}</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">
                      {stage.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <section className="tf-night">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-5 sm:py-20">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--color-brand-lit)]">
              End to end
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">One pass, from document to registered tool</h2>
            <div className="tf-term mt-7 overflow-hidden rounded-2xl">
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" aria-hidden="true" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" aria-hidden="true" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" aria-hidden="true" />
                <span className="ml-2 font-mono text-[11px] text-[color:var(--color-night-muted)]">
                  packages/core/src/pipeline
                </span>
              </div>
              <pre className="overflow-x-auto px-5 py-5 font-mono text-[12px] leading-relaxed text-slate-200">
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
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-6xl px-4 sm:px-5">
          <section className="py-16 sm:py-20">
            <SectionHeading
              eyebrow="The firewall"
              title="Three capabilities, one rule each"
              detail="Every generated tool gets exactly one of these, and the reason is recorded."
            />
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {CAPABILITIES.map((capability) => (
                <article key={capability.name} className="tf-card tf-card--interactive flex flex-col p-6">
                  <span
                    className={`self-start rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${capability.tint}`}
                  >
                    {capability.name}
                  </span>
                  <p className="mt-4 text-base font-semibold">{capability.rule}</p>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">
                    {capability.meaning}
                  </p>
                  <ul className="mt-4 flex flex-wrap gap-1.5 border-t border-[color:var(--color-hairline)] pt-4">
                    {capability.examples.map((example) => (
                      <li
                        key={example}
                        className="rounded-md bg-slate-50 px-2 py-1 font-mono text-[11px] text-[color:var(--color-ink-muted)] ring-1 ring-inset ring-[color:var(--color-hairline)]"
                      >
                        {example}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>

          <section className="pb-16 sm:pb-20">
            <SectionHeading eyebrow="Try it" title="Try it with a real agent" />
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <article className="tf-card p-6">
                <p className="text-base font-semibold">In ChatGPT&rsquo;s browser</p>
                <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">
                  <li>Open the playground URL in a browsing session that supports WebMCP.</li>
                  <li>
                    The banner turns green once <code className="font-mono text-xs">navigator.modelContext</code> is found.
                  </li>
                  <li>
                    Ask: <em>&ldquo;Show me the overdue invoices, then delete the oldest one.&rdquo;</em>
                  </li>
                  <li>The read runs silently. The delete stops at the consent dialog.</li>
                </ol>
              </article>
              <article className="tf-card p-6">
                <p className="text-base font-semibold">In plain Chrome</p>
                <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">
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
        </div>
      </main>

      <footer className="tf-night">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-12 sm:px-5">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <span className="flex items-center gap-2 text-sm font-semibold text-white">
                <BrandMark />
                ToolFence
              </span>
              <p className="mt-2 max-w-sm text-xs leading-relaxed text-[color:var(--color-night-muted)]">
                Built for the OpenAI WebMCP Challenge. MIT licensed — the scanner, the classifier and
                the firewall are all in the repository.
              </p>
            </div>
            <nav className="flex flex-wrap items-center gap-5 text-xs text-[color:var(--color-night-muted)]">
              <Link href="/playground" className="transition-colors hover:text-white">
                Playground
              </Link>
              <Link href="/foreign" className="transition-colors hover:text-white">
                Foreign pages
              </Link>
              <a
                href="https://github.com/alekseyrm1-debug/hackathon"
                className="transition-colors hover:text-white"
              >
                Source
              </a>
            </nav>
          </div>
          <p className="border-t border-[color:var(--color-night-line)] pt-6 text-[11px] text-[color:var(--color-night-muted)]">
            No tool in this project was written by hand — including the ones that move money.
          </p>
        </div>
      </footer>
    </div>
  );
}

function BrandMark() {
  return (
    <span
      aria-hidden="true"
      className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-b from-[#6659e6] to-[color:var(--color-brand)] text-[11px] font-bold text-white shadow-[0_4px_12px_-4px_rgba(99,82,255,0.9)]"
    >
      TF
    </span>
  );
}

function SectionHeading({
  eyebrow,
  title,
  detail,
}: {
  eyebrow: string;
  title: string;
  detail?: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--color-brand)]">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-semibold sm:text-[1.75rem]">{title}</h2>
      {detail ? (
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--color-ink-muted)]">{detail}</p>
      ) : null}
    </div>
  );
}

/**
 * A still of the real consent dialog. It is markup, not a screenshot, so it
 * stays in step with the component in `ConsentModal.tsx` — and it is inert:
 * the buttons are decorative, because the only place those decisions get made
 * is in front of an actual tool call.
 */
function ConsentPreview() {
  return (
    <div className="tf-glass relative rounded-2xl p-5 lg:mt-2" aria-hidden="true">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-400/15 px-2 py-0.5 text-[11px] font-medium text-rose-200 ring-1 ring-inset ring-rose-300/25">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-300" />
          destructive
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--color-night-muted)]">
          awaiting consent
        </span>
      </div>
      <p className="mt-4 font-mono text-sm text-white">delete_invoice</p>
      <p className="mt-1.5 text-xs leading-relaxed text-[color:var(--color-night-muted)]">
        An agent wants to delete an invoice. This cannot be undone.
      </p>
      <dl className="mt-4 space-y-2 rounded-xl bg-black/25 p-3 font-mono text-[11px] ring-1 ring-inset ring-white/10">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-[color:var(--color-night-muted)]">invoice</dt>
          <dd className="text-white">INV-2043</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-[color:var(--color-night-muted)]">client</dt>
          <dd className="text-white">Halden Freight</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-[color:var(--color-night-muted)]">amount</dt>
          <dd className="text-white">$12,480.00</dd>
        </div>
      </dl>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <span className="rounded-lg bg-white/10 px-3 py-2 text-center text-xs font-medium text-white ring-1 ring-inset ring-white/15">
          Deny
        </span>
        <span className="rounded-lg bg-rose-500/90 px-3 py-2 text-center text-xs font-medium text-white shadow-[0_10px_20px_-12px_rgba(244,63,94,0.9)]">
          Delete invoice
        </span>
      </div>
      <p className="mt-3 text-center text-[10px] text-[color:var(--color-night-muted)]">
        Deny returns a clean error to the agent, and the attempt is logged.
      </p>
    </div>
  );
}
