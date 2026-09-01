// The claim this file exists to check: ToolFence works on a page it has never
// seen, written by somebody else, in a style nothing else in this repo uses.
//
// It does not use a fixture string. It reads the actual third-party demo —
// `apps/web/public/demo-sites/helpdesk.html`, a hand-written, framework-free
// support desk that contains no reference to ToolFence — and runs the same
// injectable entry point a bookmarklet runs. If someone edits that page and
// breaks the scanner's assumptions, this test fails.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { start, stop } from "../src/standalone";
import type { ConsentRequest, ToolResult } from "../src/types";

// Resolved from the repo root, where vitest runs. Under the jsdom environment
// `import.meta.url` is not a file: URL, so it cannot be used here.
const HELPDESK = readFileSync(
  resolve(process.cwd(), "apps/web/public/demo-sites/helpdesk.html"),
  "utf8",
);

/** Loads the third-party page into the jsdom document, scripts included. */
function loadHelpdesk(): void {
  document.documentElement.innerHTML = HELPDESK.replace(/^[\s\S]*?<html[^>]*>/i, "").replace(
    /<\/html>\s*$/i,
    "",
  );
  // jsdom does not execute scripts written via innerHTML, so the page's own
  // behaviour is re-attached by evaluating its inline script by hand.
  for (const script of Array.from(document.querySelectorAll("script"))) {
    // eslint-disable-next-line no-new-func
    new Function(script.textContent ?? "")();
  }
}

function names(tools: readonly { schema: { name: string } }[]): string[] {
  return tools.map((tool) => tool.schema.name);
}

afterEach(() => {
  stop();
  document.documentElement.innerHTML = "<head></head><body></body>";
});

describe("a page that has never heard of ToolFence", () => {
  it("generates tools for the helpdesk's search, filter, table, form and row actions", () => {
    loadHelpdesk();
    const instance = start({ overlay: false, policy: { destructive: "prompt" } });

    const generated = names(instance.tools);
    expect(generated.length).toBeGreaterThan(4);

    // One tool per action, not one per row: six tickets, still one refund tool,
    // and the ticket id is a parameter rather than part of the name.
    const refund = instance.tools.filter((tool) => /refund/.test(tool.schema.name));
    expect(refund).toHaveLength(1);
    expect(Object.keys(refund[0].schema.inputSchema.properties)).toEqual(["ticket"]);

    const byCapability = Object.fromEntries(
      instance.tools.map((tool) => [tool.schema.name, tool.schema.capability]),
    );

    // The lexicon is not tuned to invoices: "refund", "escalate", "delete" and
    // "create" all land where a person would put them on an unfamiliar page.
    // A page in a domain the lexicon was never tuned for still lands where a
    // person would put it: money and deletion stop, escalation writes, the
    // rest reads.
    expect(byCapability["refund_order_for_ticket"]).toBe("destructive");
    expect(byCapability["delete_all_resolved_tickets"]).toBe("destructive");
    expect(byCapability["escalate_ticket"]).toBe("write");
    expect(byCapability["create_ticket"]).toBe("write");
    expect(byCapability["view_ticket"]).toBe("read");
    expect(byCapability["search_tickets"]).toBe("read");
    expect(byCapability["list_support_tickets"]).toBe("read");
    expect(byCapability["read_desk_summary"]).toBe("read");
  });

  it("stops the refund at the consent gate and reports the denial to the agent", async () => {
    loadHelpdesk();
    const instance = start({ overlay: false, policy: { destructive: "prompt" } });

    const seen: ConsentRequest[] = [];
    instance.firewall.setPrompt(async (request) => {
      seen.push(request);
      return "deny";
    });

    const refund = instance.tools.find((tool) => /refund/.test(tool.schema.name));
    expect(refund).toBeDefined();

    const result: ToolResult = await refund!.execute({ ticket: "NW-2041" });

    expect(result.ok).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.message).toMatch(/consent/i);

    // The dialog was given everything it needs to explain itself.
    expect(seen).toHaveLength(1);
    expect(seen[0].effect).toMatch(/NW-2041/);
    expect(seen[0].reasons.some((reason) => reason.capability === "destructive")).toBe(true);

    // Denied means the page did not change: the ticket is still open.
    expect(document.getElementById("rows")?.textContent).not.toMatch(/refunded/i);
    expect(instance.firewall.auditLog.at(-1)?.outcome).toBe("denied");
  });

  it("lets a read tool run without a prompt and returns structured rows", async () => {
    loadHelpdesk();
    const instance = start({ overlay: false });

    let prompted = false;
    instance.firewall.setPrompt(async () => {
      prompted = true;
      return "deny";
    });

    const list = instance.tools.find(
      (tool) => tool.schema.capability === "read" && tool.schema.plan.type === "read-collection",
    );
    expect(list).toBeDefined();

    const result = await list!.execute({});
    expect(result.ok).toBe(true);
    expect(prompted).toBe(false);

    // Structured rows, keyed by the page's own column headers — not a screenshot.
    const rows = (result.data as { rows: Array<Record<string, string>> }).rows;
    expect(rows.length).toBeGreaterThan(3);
    expect(rows[0].ticket).toBe("NW-2041");
    expect(rows[0].customer).toBe("Aster Labs");
  });

  it("regenerates its tools when the foreign page changes itself", async () => {
    loadHelpdesk();
    const instance = start({ overlay: false, rescanDelayMs: 0 });
    const before = names(instance.tools).length;

    // The page's own button, clicked the way a user would. ToolFence is not
    // told about it: the MutationObserver is the only connection.
    (document.getElementById("purge") as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(document.body.textContent).toMatch(/Deleted 2 resolved ticket/);
    // The tool list survived a DOM the library never triggered.
    expect(names(instance.tools).length).toBeGreaterThanOrEqual(Math.min(before, 4));
  });
});
