# Demo video script — 3 minutes 20, second by second

**Format:** screen recording with voice-over. 1600×1000 browser window, no webcam.
**Rule for the first 15 seconds:** the product is already running and moving before you say a word.

**Before you hit record**

- Two tabs open: `/playground` and `/foreign`, in that order. Close the console, hide bookmarks.
- The firewall panel is scrolled into view in the right column.
- The audit log is empty. Filters are cleared. All 7 invoices are visible.
- Rehearse once. The 40-second consent beat is the whole submission — do not rush it.

---

## 0:00 – 0:15 · Cold open, no narration

**On screen:** The playground, already loaded. Move the cursor to the inspector and scroll it slowly so
the seven generated tools pass by with their green / amber / red capability chips. Click **Inspect** on
`delete_invoice` and let the "Why this capability" list expand. No talking.

**Why:** A judge sees a finished product working before hearing a single claim.

---

## 0:15 – 0:35 · The problem

**On screen:** Scroll back to the top. Hover the invoices table, then the create form, then the row
buttons — as if pointing at them.

**Say:**
> "This is an ordinary invoices dashboard. To expose it to an agent through WebMCP, someone has to
> hand-write a tool for the search box, the filter, the table, the create form, and every button in
> every row. That's a day of work before an agent can do anything — which is why almost nobody has done
> it. And when they do, a second problem shows up: `delete` and `search` end up in the same flat list,
> and the agent can't tell them apart."

---

## 0:35 – 1:15 · Generation, live

**On screen:** Point at the left column, then the right. Press **Rescan**. The tool count re-appears.
Then, in the dashboard, delete one invoice by hand — the tool descriptions in the inspector update with
the new row identifiers.

**Say:**
> "The app on the left contains zero lines of ToolFence code. No tool definitions, no registration, no
> hooks. It's a plain React component.
>
> ToolFence reads its accessibility tree — roles, aria-labels, label associations, `th scope=row` — and
> generates these seven WebMCP tools at runtime. Notice what it did with the table: three buttons on
> every row didn't become twenty-one tools. They became three, each taking the row identifier as a
> parameter.
>
> And when the page changes, the tools regenerate. I deleted a row by hand — the identifiers in the
> tool descriptions just updated."

---

## 1:15 – 1:45 · The agent reads

**On screen:** Press **Run agent script**. The transcript panel appears. Let steps 1 and 2 land —
`filter_invoices`, then `list_invoices` returning structured JSON rows. Pause the pointer on the JSON.

**Say:**
> "Here's a scripted agent session. It filters to overdue invoices, then reads them back — not a
> screenshot, actual structured rows it can reason over. Both of those ran instantly with no
> interruption, because ToolFence classified them as `read`. Nothing that can't hurt you should ever
> ask permission."

---

## 1:45 – 2:25 · The firewall stops the delete

**On screen:** The third step fires and the consent dialog appears. **Stop moving the mouse.** Let it
sit for two full seconds. Then move the cursor slowly across the dialog: tool name, the arguments JSON,
the "what will change" sentence, the "why it needs approval" evidence line. Then click **Deny**. Point
at the table — still seven rows. Point at the audit log — `denied by user`.

**Say:**
> "Third step: delete. This one stops.
>
> The dialog names the tool. It shows the literal arguments the agent sent. It says what changes on the
> page — not 'an app wants permission', but: runs *Delete invoice* on row INV-1048, Acme Corp, four
> thousand two hundred dollars. And it shows *why* it was classified destructive: the word 'delete', in
> the button's own accessible name.
>
> I'll deny it. The row is still there. And the agent gets a clean error back — 'blocked by user, tool
> requires explicit consent' — so it can explain what happened instead of retrying blindly."

---

## 2:25 – 2:45 · The audit log

**On screen:** Scroll to the firewall panel. Click one log row open to show the recorded arguments.
Then change the `write` policy dropdown to **ask the user**, and tick **Strict mode**.

**Say:**
> "Every call is recorded — reads included. Tool, capability, the exact arguments, the decision, and
> whether it came from a real agent or the simulator. You can come back to a tab and see precisely what
> the agent did while you were away, and export it as JSON.
>
> And the policy is yours. Ask before writes too. Or turn on strict mode, and ToolFence will also stop
> anything it isn't confident about."

---

## 2:45 – 3:05 · The page we didn't write

**On screen:** Open `/foreign` in the second tab. Scroll the frame briefly so the support desk reads as
a different product. Press **Inject ToolFence**. Wait for the panel. Open `refund_order_for_ticket`,
pick `NW-2041`, press **Call tool**, let the dialog appear, and click **Deny**.

**Say:**
> "One more thing, because a demo on your own app proves nothing. This is a static HTML support desk —
> no React, no Tailwind, no mention of ToolFence in its source. I'm injecting the script the way a
> bookmarklet would. Nine tools, from markup written for humans. And the refund — a word nothing here
> was tuned for — still stops."

---

## 3:05 – 3:20 · Close

**On screen:** Scroll up so the whole playground is visible — dashboard, tools, audit log. Hold still.

**Say:**
> "Generation makes WebMCP cheap to adopt. The firewall is what makes that safe. It's one framework-free
> TypeScript library, MIT licensed, and it works on any page with decent accessible markup — including
> pages that have never heard of WebMCP.
>
> That's ToolFence."

---

## Shot list checklist

| Beat | Must be visible on screen |
|---|---|
| Cold open | Capability chips in three colours, "Why this capability" expanded |
| Problem | The table's row buttons and the create form |
| Generation | Tool count, `delete_invoice` taking a row parameter, descriptions updating after a manual delete |
| Read | Transcript panel with structured JSON rows |
| Consent | Tool name · arguments JSON · "what will change" · "why it needs approval" · three buttons |
| Denial | Row still present, `denied by user` in the audit log |
| Audit | An expanded log row showing recorded arguments; policy dropdowns and strict mode |
| Third-party page | The helpdesk before injection, the panel after it, and the refund stopping at consent |

## Recording notes

- Record at 1600×1000 or larger and export at 1080p; the JSON in the consent dialog must be legible.
- Voice-over separately if live narration makes you rush. The 0:00–0:15 silence is intentional.
- If WebMCP is available in your browser, open the playground there so the banner is green and the
  first frame says `7 tool(s) registered via navigator.modelContext.registerTool`. If it is not, the
  grey banner is still fine — the **Run agent script** path is identical, and the honesty reads well.
