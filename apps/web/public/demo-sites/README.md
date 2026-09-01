# The pages ToolFence did not write

These two files are the honesty check on the whole project. A generator
demonstrated only on its author's own app proves that the author can write
markup the generator likes, so the repository ships two pages that ToolFence has
no relationship with and runs the real pipeline against both in CI.

Neither file mentions ToolFence — no script tag, no data attribute, no hook, and
not even the word. `packages/core/test/no-references.test.ts` greps them on every
run so that stays true.

| File | What it is | Why it is here |
|---|---|---|
| `helpdesk.html` | Northwind Support Desk — static HTML, hand-written serif CSS, a real `<table>` with `<th scope="row">`, real `<button>` row actions. | A different domain (tickets, refunds, escalations) from the invoices demo, written in a different style by a different hand. |
| `dispatch.html` | Halden Freight dispatch board — dark monospace UI, **no `<table>` at all** (an ARIA `role="grid"` built from `<div>`s) and **no `<button>` in the rows** (anchors with `role="button"`). | Removes the last two things the helpdesk still had in common with our own demo. If the scanner only understood `<table>` and `<button>`, this page would produce nothing. |

The point of the second one is the vocabulary as much as the markup: nothing in
`RISK_SIGNALS` was tuned for freight, and the three actions that can hurt
somebody are worded the way a dispatcher words them — cancel a shipment, pay a
carrier, transfer a load.

Tests: `packages/core/test/foreign-page.test.ts` and
`packages/core/test/dispatch-page.test.ts`.
