// The demo product: an ordinary React invoices dashboard.
// It contains ZERO ToolFence code — no tool definitions, no registration, no
// hooks. Every tool in the inspector is derived from this markup at runtime.
"use client";

import { useMemo, useState } from "react";
import { money } from "./ui";

// Fixed ids (not useId) so that <label for> associations — and therefore the
// selectors ToolFence derives from them — stay stable across re-renders.
const FIELD_IDS = {
  search: "inv-search",
  status: "inv-status",
  sort: "inv-sort",
  client: "inv-client",
  amount: "inv-amount",
  due: "inv-due",
} as const;

type InvoiceStatus = "Draft" | "Sent" | "Paid" | "Overdue";

interface Invoice {
  readonly id: string;
  readonly client: string;
  readonly amount: number;
  readonly issued: string;
  readonly due: string;
  readonly status: InvoiceStatus;
}

const SEED: readonly Invoice[] = [
  { id: "INV-1048", client: "Acme Corp", amount: 4200, issued: "2026-08-02", due: "2026-09-01", status: "Overdue" },
  { id: "INV-1047", client: "Northwind Ltd", amount: 1800, issued: "2026-08-09", due: "2026-09-08", status: "Sent" },
  { id: "INV-1046", client: "Globex", amount: 6400, issued: "2026-08-11", due: "2026-09-10", status: "Draft" },
  { id: "INV-1045", client: "Initech", amount: 990, issued: "2026-07-28", due: "2026-08-27", status: "Overdue" },
  { id: "INV-1044", client: "Umbrella Health", amount: 12750, issued: "2026-07-19", due: "2026-08-18", status: "Paid" },
  { id: "INV-1043", client: "Soylent Foods", amount: 3100, issued: "2026-07-12", due: "2026-08-11", status: "Paid" },
  { id: "INV-1042", client: "Hooli", amount: 15400, issued: "2026-07-05", due: "2026-08-04", status: "Sent" },
];

const STATUS_STYLES: Record<InvoiceStatus, string> = {
  Draft: "bg-slate-100 text-slate-600 ring-slate-200",
  Sent: "bg-[color:var(--color-brand-soft)] text-[color:var(--color-brand)] ring-indigo-200",
  Paid: "bg-[color:var(--color-read-soft)] text-[color:var(--color-read)] ring-emerald-200",
  Overdue: "bg-[color:var(--color-destructive-soft)] text-[color:var(--color-destructive)] ring-rose-200",
};

type SortKey = "newest" | "oldest" | "amount_high" | "amount_low";

export function InvoiceApp() {
  const [invoices, setInvoices] = useState<readonly Invoice[]>(SEED);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState({ client: "", amount: "", due: "" });

  const { search: searchId, status: statusId, sort: sortId, client: clientId, amount: amountId, due: dueId } =
    FIELD_IDS;

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = invoices.filter((invoice) => {
      const matchesText =
        needle.length === 0 ||
        invoice.client.toLowerCase().includes(needle) ||
        invoice.id.toLowerCase().includes(needle);
      const matchesStatus = status === "all" || invoice.status.toLowerCase() === status;
      return matchesText && matchesStatus;
    });
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sort) {
        case "oldest":
          return a.issued.localeCompare(b.issued);
        case "amount_high":
          return b.amount - a.amount;
        case "amount_low":
          return a.amount - b.amount;
        case "newest":
        default:
          return b.issued.localeCompare(a.issued);
      }
    });
    return sorted;
  }, [invoices, search, status, sort]);

  const totals = useMemo(() => {
    const outstanding = invoices
      .filter((invoice) => invoice.status !== "Paid")
      .reduce((sum, invoice) => sum + invoice.amount, 0);
    const overdue = invoices
      .filter((invoice) => invoice.status === "Overdue")
      .reduce((sum, invoice) => sum + invoice.amount, 0);
    const paid = invoices
      .filter((invoice) => invoice.status === "Paid")
      .reduce((sum, invoice) => sum + invoice.amount, 0);
    return { outstanding, overdue, paid };
  }, [invoices]);

  const selectedInvoice = invoices.find((invoice) => invoice.id === selected) ?? null;

  function handleSend(invoice: Invoice) {
    setInvoices((current) =>
      current.map((item) => (item.id === invoice.id ? { ...item, status: "Sent" } : item)),
    );
    setMessage(`Invoice ${invoice.id} was emailed to ${invoice.client}.`);
  }

  function handleDelete(invoice: Invoice) {
    setInvoices((current) => current.filter((item) => item.id !== invoice.id));
    if (selected === invoice.id) setSelected(null);
    setMessage(`Invoice ${invoice.id} was permanently deleted.`);
  }

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(draft.amount);
    if (!draft.client.trim() || !Number.isFinite(amount) || amount <= 0) {
      setMessage("Could not create the invoice: a client name and a positive amount are required.");
      return;
    }
    const nextNumber = 1049 + invoices.filter((invoice) => invoice.id.startsWith("INV-10")).length;
    const created: Invoice = {
      id: `INV-${nextNumber}`,
      client: draft.client.trim(),
      amount,
      issued: new Date().toISOString().slice(0, 10),
      due: draft.due || "2026-10-01",
      status: "Draft",
    };
    setInvoices((current) => [created, ...current]);
    setDraft({ client: "", amount: "", due: "" });
    setMessage(`Invoice ${created.id} was created as a draft for ${created.client}.`);
  }

  return (
    <div id="invoice-app" className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-[color:var(--color-ink-muted)]">
            Northstar Billing
          </p>
          <h1 className="mt-1 text-xl font-semibold text-[color:var(--color-ink)]">Invoices</h1>
        </div>
        <p className="max-w-md text-xs leading-relaxed text-[color:var(--color-ink-muted)]">
          An ordinary React dashboard. It defines no tools of its own — everything the agent can
          do here was generated from this markup.
        </p>
      </header>

      <dl aria-label="Account summary" className="grid grid-cols-3 gap-2.5 sm:gap-3">
        <SummaryCard term="Outstanding" value={money.format(totals.outstanding)} />
        <SummaryCard term="Overdue" value={money.format(totals.overdue)} tone="destructive" />
        <SummaryCard term="Paid this quarter" value={money.format(totals.paid)} tone="read" />
      </dl>

      <section
        aria-label="Invoices"
        className="rounded-xl bg-[color:var(--color-surface)] shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-[color:var(--color-hairline)]"
      >
        <form
          role="search"
          aria-label="Filter invoices"
          onSubmit={(event) => event.preventDefault()}
          className="flex flex-wrap items-end gap-3 border-b border-[color:var(--color-hairline)] px-4 py-3"
        >
          <Field label="Search" htmlFor={searchId} className="min-w-48 flex-1">
            <input
              id={searchId}
              type="search"
              value={search}
              placeholder="Client or invoice number"
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-lg border border-[color:var(--color-hairline)] bg-white px-3 py-1.5 text-sm outline-none placeholder:text-slate-400"
            />
          </Field>
          <Field label="Status" htmlFor={statusId}>
            <select
              id={statusId}
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="rounded-lg border border-[color:var(--color-hairline)] bg-white px-3 py-1.5 text-sm outline-none"
            >
              <option value="all">All</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
            </select>
          </Field>
          <Field label="Sort by" htmlFor={sortId}>
            <select
              id={sortId}
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              className="rounded-lg border border-[color:var(--color-hairline)] bg-white px-3 py-1.5 text-sm outline-none"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="amount_high">Amount, high to low</option>
              <option value="amount_low">Amount, low to high</option>
            </select>
          </Field>
        </form>

        <div className="overflow-x-auto">
          <table aria-label="Invoices" className="w-full min-w-[42rem] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[color:var(--color-ink-muted)]">
                <th scope="col" className="px-4 py-2 font-medium">Invoice</th>
                <th scope="col" className="px-4 py-2 font-medium">Client</th>
                <th scope="col" className="px-4 py-2 font-medium">Amount</th>
                <th scope="col" className="px-4 py-2 font-medium">Due date</th>
                <th scope="col" className="px-4 py-2 font-medium">Status</th>
                <th scope="col" className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((invoice) => (
                <tr
                  key={invoice.id}
                  className="border-t border-[color:var(--color-hairline)] align-middle"
                >
                  <th scope="row" className="whitespace-nowrap px-4 py-2.5 text-left font-mono text-xs font-medium">
                    {invoice.id}
                  </th>
                  <td className="px-4 py-2.5">{invoice.client}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{money.format(invoice.amount)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-[color:var(--color-ink-muted)]">
                    {invoice.due}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${STATUS_STYLES[invoice.status]}`}
                    >
                      {invoice.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1">
                      <RowButton
                        label={`View invoice ${invoice.id}`}
                        onClick={() => {
                          setSelected(invoice.id);
                          setMessage(`Opened invoice ${invoice.id}.`);
                        }}
                      >
                        View
                      </RowButton>
                      <RowButton
                        label={`Send invoice ${invoice.id} to client`}
                        onClick={() => handleSend(invoice)}
                      >
                        Send
                      </RowButton>
                      <RowButton
                        label={`Delete invoice ${invoice.id}`}
                        tone="danger"
                        onClick={() => handleDelete(invoice)}
                      >
                        Delete
                      </RowButton>
                    </div>
                  </td>
                </tr>
              ))}
              {visible.length === 0 ? (
                <tr className="border-t border-[color:var(--color-hairline)]">
                  <td colSpan={6} className="px-4 py-8 text-center text-[color:var(--color-ink-muted)]">
                    No invoices match the current filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {selectedInvoice ? (
        <section
          aria-label="Invoice details"
          className="tf-rise rounded-xl bg-[color:var(--color-surface)] p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-[color:var(--color-hairline)]"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Invoice {selectedInvoice.id}</h2>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded-lg px-2 py-1 text-xs font-medium text-[color:var(--color-ink-muted)] hover:bg-slate-100"
            >
              Close details
            </button>
          </div>
          <dl aria-label="Invoice details" className="mt-3 grid gap-3 sm:grid-cols-4">
            <SummaryCard term="Client" value={selectedInvoice.client} compact />
            <SummaryCard term="Amount" value={money.format(selectedInvoice.amount)} compact />
            <SummaryCard term="Issued" value={selectedInvoice.issued} compact />
            <SummaryCard term="Status" value={selectedInvoice.status} compact />
          </dl>
        </section>
      ) : null}

      <form
        aria-label="Create invoice"
        method="post"
        onSubmit={handleCreate}
        className="rounded-xl bg-[color:var(--color-surface)] p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-[color:var(--color-hairline)]"
      >
        <h2 className="text-sm font-semibold">Create invoice</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <Field label="Client name" htmlFor={clientId} className="min-w-48 flex-1">
            <input
              id={clientId}
              name="client"
              required
              value={draft.client}
              placeholder="Acme Corp"
              onChange={(event) => setDraft((current) => ({ ...current, client: event.target.value }))}
              className="w-full rounded-lg border border-[color:var(--color-hairline)] bg-white px-3 py-1.5 text-sm outline-none placeholder:text-slate-400"
            />
          </Field>
          <Field label="Amount" htmlFor={amountId}>
            <input
              id={amountId}
              name="amount"
              type="number"
              required
              min={1}
              step={0.01}
              value={draft.amount}
              placeholder="2500"
              onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))}
              className="w-36 rounded-lg border border-[color:var(--color-hairline)] bg-white px-3 py-1.5 text-sm outline-none placeholder:text-slate-400"
            />
          </Field>
          <Field label="Due date" htmlFor={dueId}>
            <input
              id={dueId}
              name="due"
              type="date"
              value={draft.due}
              onChange={(event) => setDraft((current) => ({ ...current, due: event.target.value }))}
              className="rounded-lg border border-[color:var(--color-hairline)] bg-white px-3 py-1.5 text-sm outline-none"
            />
          </Field>
          <button
            type="submit"
            className="rounded-lg bg-[color:var(--color-brand)] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-800"
          >
            Create invoice
          </button>
        </div>
      </form>

      <p
        role="status"
        aria-live="polite"
        className="min-h-5 text-xs text-[color:var(--color-ink-muted)]"
      >
        {message}
      </p>
    </div>
  );
}

function SummaryCard({
  term,
  value,
  tone,
  compact = false,
}: {
  term: string;
  value: string;
  tone?: "read" | "destructive";
  compact?: boolean;
}) {
  const valueColor =
    tone === "destructive"
      ? "text-[color:var(--color-destructive)]"
      : tone === "read"
        ? "text-[color:var(--color-read)]"
        : "text-[color:var(--color-ink)]";
  return (
    <div
      className={
        compact
          ? "rounded-lg bg-slate-50 px-3 py-2"
          : "rounded-xl bg-[color:var(--color-surface)] px-3 py-2.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-[color:var(--color-hairline)] sm:px-4 sm:py-3"
      }
    >
      <dt className="text-xs font-medium text-[color:var(--color-ink-muted)]">{term}</dt>
      <dd
        className={`mt-1 font-semibold tabular-nums ${
          compact ? "text-sm" : "text-[15px] sm:text-lg"
        } ${valueColor}`}
      >
        {value}
      </dd>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
  className = "",
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-[color:var(--color-ink-muted)]">
        {label}
      </label>
      {children}
    </div>
  );
}

function RowButton({
  label,
  children,
  onClick,
  tone,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
        tone === "danger"
          ? "text-[color:var(--color-destructive)] hover:bg-[color:var(--color-destructive-soft)]"
          : "text-[color:var(--color-ink-muted)] hover:bg-slate-100 hover:text-[color:var(--color-ink)]"
      }`}
    >
      {children}
    </button>
  );
}
