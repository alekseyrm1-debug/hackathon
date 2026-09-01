# ToolFence — Devpost submission

**Tagline:** Turn any web app into WebMCP tools — and never let a dangerous tool run without the user's consent.

**Live demo:** https://toolfence-omega.vercel.app/playground · **Repository:** https://github.com/alekseyrm1-debug/hackathon · **Licence:** MIT

---

## Why this use case is a strong fit for WebMCP

WebMCP's central bet is that the page itself is the right place to expose capability to an agent: the
site already knows its own state, its own permissions and its own session, so it should hand the agent
real functions instead of making it drive pixels. That bet has a bootstrapping problem. Every tool has
to be written by hand before an agent can do anything, and a realistic dashboard — a search field, a
status filter, a table, a create form, three buttons per row — is a day of naming, schema-writing and
handler-wiring that then has to be maintained alongside the UI. The standard cannot spread faster than
people are willing to do that work.

ToolFence attacks the bootstrapping problem directly, and it can only be attacked from inside the page.
The generator reads the same accessibility layer a screen reader uses — `role`, `aria-*`, `<label>`
associations, `<th scope="row">`, `<form method>` — and turns it into WebMCP tools at runtime. Nothing
about this works from outside the browser: an external MCP server does not know that this table's rows
are identified by the `Invoice` column, that this select filters rather than mutates, or that this
button is the one belonging to row `INV-1048`. The page has that information, WebMCP is the seam where
it can be published, and ToolFence is the code that reads it.

The second half of the fit is the part we think matters more. WebMCP makes calling a page function
trivially easy for an agent, and it deliberately says nothing about which functions are safe. The
moment tool publishing becomes cheap, `delete_invoice` and `send_invoice_to_client` appear in the same
flat list as `search_invoices`, and the agent has no signal distinguishing them. A safety layer for
this has to live where consent lives: in the page, in front of the user, with access to the actual
argument values and the actual DOM node that is about to change. That is exactly the position WebMCP
puts you in, and nowhere else in the stack can do it. Generation and safety are not two features here;
the first one is what makes the second one necessary.

## How it creates a better user experience

For the person using the site, the change is that agent actions stop being invisible. Reads and
ordinary writes run at full speed with no friction — searching, filtering, listing, creating a draft.
When the agent reaches something irreversible, the page pauses and shows a dialog that answers the
three questions a user actually has: which tool, with exactly which arguments, and what changes on this
page. Not "an app wants permission to act on your behalf", but "runs *Delete invoice* on row INV-1048
(Acme Corp · $4,200.00 · due 2026-09-01) — this activates the same button you would click in that row."

The dialog is deliberately calm rather than alarming. It is not a red warning; it is a receipt shown
before the fact. It also explains itself: it lists the evidence that made the tool destructive
("*delete* in text — deletes data irreversibly"), so the user can tell the difference between a
genuinely dangerous call and an over-cautious classification. Three answers are offered — allow once,
allow for this session, deny — because a user who is deliberately asking the agent to clean up twelve
invoices should not be interrogated twelve times, while a user who is not should be interrupted every
time. Denial produces a clean, agent-readable error (`Blocked by user. Tool requires explicit
consent.`) instead of a hang or a silent no-op, so the agent can explain what happened rather than
retrying.

For the person who owns the site, the improvement is that they get all of this without writing tools.
The demo dashboard in this repository contains zero lines of ToolFence code — no tool definitions, no
registration, no hooks. It is a plain React app, and every tool in the inspector was derived from its
markup at runtime. A `MutationObserver` regenerates the tool list when the page changes, so deleting a
row or creating an invoice updates what the agent can see without anyone maintaining a manifest. The
practical effect is that writing accessible HTML — which a team should be doing anyway — is now also
how you ship an agent interface.

## What people and agents can now do together

On the demo dashboard, a user can say *"show me the overdue invoices and delete the oldest one"* and
watch a division of labour that feels correct. The agent handles the tedious half by itself:
`filter_invoices` sets the status filter, `list_invoices` reads back the visible rows as structured
data, `read_account_summary` pulls the totals. None of that interrupts anyone, because none of it can
cause harm. Then the agent proposes the one step that is irreversible, and the human makes that
decision with the specific row and the specific arguments in front of them. The agent does the work;
the person keeps the authority.

That split scales past a single call. Because `list_invoices` returns real structured rows rather than
a screenshot, an agent can reason over them — find the three oldest overdue invoices, compare them
against a total, decide which one is worth chasing — and then act on exactly the row it reasoned about,
selected by its identifier rather than by pixel position. And because reads are free, a user can ask
open-ended questions of a page they are already looking at without a permission dialog for every step.

The audit log is what makes the arrangement trustworthy afterwards. Every call is recorded — timestamp,
tool, capability, the literal arguments, the decision, how long it took, and whether it came from a
real agent or from the in-page simulator. Reads included. A user who returns to the tab can see
precisely what the agent did while they were away, and export the record as JSON. That is a materially
different relationship from an agent that clicks around a page and leaves no trace. It also gives the
site owner a control surface: the same panel exposes per-capability policy (allow / ask / block), a
strict mode that also asks about anything the classifier is unsure of, and revocable session grants.

## How WebMCP is implemented

Registration is isolated in a single file, `packages/core/src/register.ts`. It feature-detects
`navigator.modelContext` and supports both spellings the draft spec has used — `registerTool(...)` per
tool, and `provideContext({ tools })` for the whole set — returning a handle so a rescan can unregister
the previous generation instead of duplicating tools. Every tool is registered with MCP's standard
behaviour annotations derived from our own classification: `readOnlyHint` for reads, `destructiveHint`
and `openWorldHint` for destructive tools, `idempotentHint` for tools that can safely be repeated. That
means an agent gets our risk assessment through the protocol's own vocabulary, before it ever hits the
firewall. Results come back in the MCP envelope (`content: [{ type: "text", ... }]`) with
`structuredContent` carrying the parsed rows, and `isError` set when the firewall blocked the call.

The pipeline behind it is four pure-ish stages. `scan(document)` is a genuine pure function — a
`Document` in, a serialisable `ScanResult` out, no global state and no DOM writes — which is what makes
it testable against jsdom fixtures. `generate()` turns candidates into `ToolSchema`s with JSON Schema
arguments and a declarative `ExecutionPlan`. `classify()` assigns the capability from `RISK_SIGNALS`, a
single exported constant holding the entire risk lexicon; adding a dangerous verb is a one-line change.
`bind()` produces the handler, which re-resolves its target elements from selectors at call time — React
re-renders would otherwise leave stale node references — and writes into controlled inputs through the
prototype value setter plus a bubbling `input` event, the only way React notices a programmatic write.

The firewall is the single choke point: nothing in ToolFence executes a handler except through
`Firewall.guard()`. It resolves policy, asks for consent when required, runs the handler, and writes an
audit entry on every path including failures. It fails closed by construction — a consent UI that
throws or unmounts is treated as a denial, and a `Firewall` built without a prompt denies everything
rather than allowing it. Grouping is what keeps the tool list sane: buttons repeated across table rows
collapse into one parameterised tool (`delete_invoice(invoice)`) rather than one tool per row, with the
identifier column discovered from `<th scope="row">`.

Two properties are deliberate and worth stating. First, the optional AI naming pass can rewrite tool
names and descriptions but **cannot** touch a capability, a classification or an execution plan — those
are copied from the heuristic output, so no model, and no page trying to influence one, can talk a
destructive tool into looking safe. Second, when `navigator.modelContext` does not exist the page
degrades rather than breaking: it still scans, generates, classifies and logs, and a **Run agent
script** button replays a three-step agent session through the identical firewall path. Judges opening
the demo in an ordinary browser see the whole system work.
