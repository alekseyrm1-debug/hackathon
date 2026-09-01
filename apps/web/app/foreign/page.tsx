// The "does this only work on your own demo?" page.
//
// `/playground` is our app. The two pages below are somebody else's: static
// files with no script tag, no data attribute and no reference to ToolFence
// anywhere in them — one a hand-written support desk built from a real table,
// one a dispatch board with no table element at all. Pressing Inject
// appends `/toolfence.js` to that document at runtime — exactly what the
// bookmarklet does on a page we have never seen — and the panel that appears is
// generated entirely from the markup already there.
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button, softKey } from "../../components/ui";

interface ForeignPage {
  readonly id: string;
  readonly path: string;
  readonly title: string;
  readonly blurb: string;
  readonly source: string;
  readonly heading: string;
  readonly footnote: string;
  readonly tools: readonly { name: string; capability: string; note: string }[];
}

const PAGES: readonly ForeignPage[] = [
  {
    id: "helpdesk",
    path: "/demo-sites/helpdesk.html",
    title: "Northwind Support Desk",
    blurb:
      "Static HTML, hand-written serif CSS, no framework. A real table with th scope=row and real buttons — but a domain (tickets, refunds, escalations) nothing here was tuned for.",
    source: "helpdesk.html",
    heading: "Nine tools, from markup written for humans",
    footnote:
      "Six tickets are in that table, and there is still exactly one refund_order_for_ticket: the ticket id is a parameter, discovered from th scope=row.",
    tools: [
      { name: "list_support_tickets", capability: "read", note: "Reads the table back as structured rows." },
      { name: "search_tickets", capability: "read", note: "Drives the search box." },
      { name: "filter_by_priority", capability: "read", note: "Drives the priority select." },
      { name: "read_desk_summary", capability: "read", note: "Reads the summary figures." },
      { name: "view_ticket", capability: "read", note: "One tool, ticket id as a parameter." },
      { name: "escalate_ticket", capability: "write", note: "Changes state, but recoverable." },
      { name: "create_ticket", capability: "write", note: "Fills and submits the new-ticket form." },
      { name: "refund_order_for_ticket", capability: "destructive", note: "Moves money — stops at consent." },
      { name: "delete_all_resolved_tickets", capability: "destructive", note: "Irreversible — stops at consent." },
    ],
  },
  {
    id: "dispatch",
    path: "/demo-sites/dispatch.html",
    title: "Halden Freight — Dispatch Board",
    blurb:
      "The harder one. There is no table element in this page at all — the board is an ARIA grid of divs — and no button in its rows: the actions are anchors with role=button. Different domain again: freight.",
    source: "dispatch.html",
    heading: "Ten tools, and not a table tag in sight",
    footnote:
      "Six loads × four actions is 24 controls on the page. They collapse to four tools, each taking the load id — read from role=rowheader, because there is no th to read.",
    tools: [
      { name: "list_active_loads", capability: "read", note: "Reads a div grid back as structured rows." },
      { name: "search_loads", capability: "read", note: "Drives the search box." },
      { name: "filter_by_lane", capability: "read", note: "Drives the lane select." },
      { name: "read_shift_totals", capability: "read", note: "Reads the shift figures." },
      { name: "track_load", capability: "write", note: "Only reports status — classified up, not down." },
      { name: "hold_load", capability: "write", note: "Changes state, but recoverable." },
      { name: "transfer_load_to_another_carrier", capability: "destructive", note: "Transfers ownership — stops." },
      { name: "pay_carrier_for_load", capability: "destructive", note: "Moves money — stops at consent." },
      { name: "submit_book_load", capability: "destructive", note: "Books a load: commits an order — stops." },
      { name: "cancel_all_delayed_shipments", capability: "destructive", note: "Irreversible — stops at consent." },
    ],
  },
];

const SOURCE_BASE =
  "https://github.com/alekseyrm1-debug/hackathon/blob/HEAD/apps/web/public/demo-sites/";

const CHIP: Record<string, string> = {
  read: "bg-[color:var(--color-read-soft)] text-[color:var(--color-read)] ring-emerald-200",
  write: "bg-[color:var(--color-write-soft)] text-[color:var(--color-write)] ring-amber-200",
  destructive: "bg-[color:var(--color-destructive-soft)] text-[color:var(--color-destructive)] ring-rose-200",
};

export default function ForeignPage() {
  const frame = useRef<HTMLIFrameElement>(null);
  const bookmarklet = useRef<HTMLAnchorElement>(null);
  const [injected, setInjected] = useState(false);
  const [origin, setOrigin] = useState("");
  const [page, setPage] = useState<ForeignPage>(PAGES[0]);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // React refuses to render a `javascript:` href, so the bookmarklet is
  // attached as a plain attribute after mount. Dragging it to the bookmarks
  // bar is the whole point — it has to be a real link.
  useEffect(() => {
    if (!origin || !bookmarklet.current) return;
    bookmarklet.current.setAttribute("href", bookmarkletHref(origin));
  }, [origin]);

  function inject() {
    const doc = frame.current?.contentDocument;
    if (!doc || doc.getElementById("toolfence-overlay")) return;
    const script = doc.createElement("script");
    script.src = "/toolfence.js";
    doc.body.appendChild(script);
    setInjected(true);
  }

  function reset() {
    setInjected(false);
    if (frame.current) frame.current.src = page.path;
  }

  function show(next: ForeignPage) {
    if (next.id === page.id) return;
    setPage(next);
    setInjected(false);
    if (frame.current) frame.current.src = next.path;
  }

  return (
    <div className="tf-canvas min-h-screen">
      <header className="border-b border-[color:var(--color-hairline)] bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[color:var(--color-brand)] text-[11px] font-bold text-white">
              TF
            </span>
            ToolFence
          </Link>
          <Link href="/playground" className={softKey("ghost", "sm")}>
            Our own demo →
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-[color:var(--color-ink-muted)]">
          Somebody else&apos;s page
        </p>
        <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight">
          The same pipeline, on pages that were not built for it.
        </h1>
        <p className="mt-3 max-w-3xl text-[color:var(--color-ink-muted)]">
          Two static files, neither of which mentions ToolFence anywhere in its source — grep them, and
          <code className="mx-1 rounded bg-black/5 px-1 py-0.5 text-xs">no-references.test.ts</code> greps them
          again on every CI run. Press <strong>Inject ToolFence</strong> and a script is appended to that
          document at runtime, the way a bookmarklet would. Everything the panel then shows was derived from
          the markup that was already there.
        </p>

        <div className="mt-5 flex flex-wrap gap-2.5">
          {PAGES.map((entry) => {
            const active = entry.id === page.id;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => show(entry)}
                aria-pressed={active}
                className={`max-w-sm rounded-xl border px-3.5 py-2.5 text-left transition ${
                  active
                    ? "border-[color:var(--color-brand)] bg-white shadow-sm"
                    : "border-[color:var(--color-hairline)] bg-white/60 hover:bg-white"
                }`}
              >
                <span className="block text-sm font-semibold">{entry.title}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-[color:var(--color-ink-muted)]">
                  {entry.blurb}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <Button variant="primary" onClick={inject} disabled={injected}>
            {injected ? "ToolFence injected" : "Inject ToolFence"}
          </Button>
          <Button variant="secondary" onClick={reset}>
            Reload clean
          </Button>
          <a className={softKey("ghost", "md")} href={page.path} target="_blank" rel="noreferrer">
            Open the page on its own ↗
          </a>
          <a
            className={softKey("ghost", "md")}
            href={`${SOURCE_BASE}${page.source}`}
            target="_blank"
            rel="noreferrer"
          >
            Read its source ↗
          </a>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-5">
          <div className="overflow-hidden rounded-xl border border-[color:var(--color-hairline)] bg-white shadow-sm lg:col-span-3">
            <div className="flex items-center gap-2 border-b border-[color:var(--color-hairline)] bg-[#f7f8fb] px-3 py-2">
              <span className="flex gap-1.5" aria-hidden="true">
                <span className="h-2.5 w-2.5 rounded-full bg-[#e0655a]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#e3b341]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#5bb75b]" />
              </span>
              <span className="truncate rounded bg-white px-2 py-0.5 font-mono text-[11px] text-[color:var(--color-ink-muted)] ring-1 ring-inset ring-black/10">
                {origin}
                {page.path}
              </span>
            </div>
            <iframe
              ref={frame}
              src={page.path}
              title={`${page.title} — a third-party page`}
              className="h-[720px] w-full border-0 bg-white"
            />
          </div>

          <div className="flex flex-col gap-5 lg:col-span-2">
            <section className="rounded-xl border border-[color:var(--color-hairline)] bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold">{page.heading}</h2>
              <p className="mt-1 text-xs text-[color:var(--color-ink-muted)]">
                Nothing in the risk lexicon was tuned for this domain. The tools that can cost the user
                something are the ones that stop at the dialog.
              </p>
              <ul className="mt-3 space-y-2">
                {page.tools.map((tool) => (
                  <li key={tool.name} className="flex flex-col gap-1 rounded-lg bg-black/[0.02] px-2.5 py-2">
                    <span className="flex items-center gap-2">
                      <code className="flex-1 break-all font-mono text-[11.5px]">{tool.name}</code>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset ${CHIP[tool.capability]}`}
                      >
                        {tool.capability}
                      </span>
                    </span>
                    <span className="text-[11px] text-[color:var(--color-ink-muted)]">{tool.note}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-[color:var(--color-ink-muted)]">{page.footnote}</p>
            </section>

            <section className="rounded-xl border border-[color:var(--color-hairline)] bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold">Take it to a page of your own</h2>
              <p className="mt-1 text-xs text-[color:var(--color-ink-muted)]">
                Drag this to your bookmarks bar, open any accessible dashboard, and click it. Nothing is sent
                anywhere — the script runs entirely in your browser.
              </p>
              <a
                ref={bookmarklet}
                className={`${softKey("secondary", "sm")} mt-3`}
                onClick={(event) => event.preventDefault()}
                draggable
              >
                🔒 ToolFence this page
              </a>
              <pre className="mt-3 max-h-32 overflow-auto rounded-lg bg-[#0d1424] p-2.5 font-mono text-[10px] leading-relaxed text-[#c9d2e6]">
                {origin ? bookmarkletHref(origin) : "…"}
              </pre>
              <p className="mt-2 text-[11px] text-[color:var(--color-ink-muted)]">
                Sites that send a strict <code>script-src</code> Content-Security-Policy header will refuse the
                injection — that is the browser doing its job, and it is why the demo above is served from this
                same origin.
              </p>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

/** The bookmarklet: append our script to whatever document is open. */
function bookmarkletHref(origin: string): string {
  const source = `(function(){var s=document.createElement('script');s.src='${origin}/toolfence.js?t='+Date.now();document.body.appendChild(s);})()`;
  return `javascript:${encodeURIComponent(source)}`;
}
