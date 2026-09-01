// The second page ToolFence did not write, and the harder of the two.
//
// `helpdesk.html` still had two things in common with our own demo: a real
// <table> and real <button> elements. `dispatch.html` has neither. Its board is
// an ARIA grid built from <div>s, its row actions are anchors with
// role="button", its domain is freight, and its dangerous verbs — transfer, pay,
// cancel — are ones no other test exercises end to end.
//
// If the scanner only understood <table> and <button>, this file would fail.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { start, stop } from "../src/standalone";
import type { ConsentRequest, ToolResult } from "../src/types";

const DISPATCH = readFileSync(
  resolve(process.cwd(), "apps/web/public/demo-sites/dispatch.html"),
  "utf8",
);

function loadDispatch(): void {
  document.documentElement.innerHTML = DISPATCH.replace(/^[\s\S]*?<html[^>]*>/i, "").replace(
    /<\/html>\s*$/i,
    "",
  );
  for (const script of Array.from(document.querySelectorAll("script"))) {
    new Function(script.textContent ?? "")();
  }
}

function capabilities(instance: ReturnType<typeof start>): Record<string, string> {
  return Object.fromEntries(instance.tools.map((tool) => [tool.schema.name, tool.schema.capability]));
}

afterEach(() => {
  stop();
  document.documentElement.innerHTML = "<head></head><body></body>";
});

describe("a div-based grid on a page in a domain nothing was tuned for", () => {
  it("reads a role='grid' with no <table> in it at all", () => {
    expect(DISPATCH).not.toMatch(/<table/i);
    loadDispatch();
    const instance = start({ overlay: false, policy: { destructive: "prompt" } });

    const list = instance.tools.find((tool) => tool.schema.plan.type === "read-collection");
    expect(list).toBeDefined();
    expect(list!.schema.name).toBe("list_active_loads");
    // Nothing was skipped for want of a header row.
    expect(instance.scanResult?.skipped).toEqual([]);
  });

  it("groups the anchor row actions into one tool each, not one per load", () => {
    loadDispatch();
    const instance = start({ overlay: false, policy: { destructive: "prompt" } });

    // Six loads × four actions each is 24 controls. They must collapse to four.
    const rowActions = instance.tools.filter((tool) => tool.schema.plan.type === "row-action");
    expect(rowActions.map((tool) => tool.schema.name).sort()).toEqual([
      "hold_load",
      "pay_carrier_for_load",
      "track_load",
      "transfer_load_to_another_carrier",
    ]);
    for (const tool of rowActions) {
      expect(Object.keys(tool.schema.inputSchema.properties)).toEqual(["load"]);
    }
  });

  it("classifies freight vocabulary the way a dispatcher would", () => {
    loadDispatch();
    const byCapability = capabilities(start({ overlay: false, policy: { destructive: "prompt" } }));

    // Money and irreversibility stop, whatever the domain calls them.
    expect(byCapability["pay_carrier_for_load"]).toBe("destructive");
    expect(byCapability["transfer_load_to_another_carrier"]).toBe("destructive");
    expect(byCapability["cancel_all_delayed_shipments"]).toBe("destructive");
    expect(byCapability["submit_book_load"]).toBe("destructive");

    // Recoverable state changes do not.
    expect(byCapability["hold_load"]).toBe("write");

    // Reading and filtering never interrupt anyone.
    expect(byCapability["list_active_loads"]).toBe("read");
    expect(byCapability["search_loads"]).toBe("read");
    expect(byCapability["filter_by_lane"]).toBe("read");
    expect(byCapability["read_shift_totals"]).toBe("read");
  });

  it("reads the grid back as structured rows keyed by its own column headers", async () => {
    loadDispatch();
    const instance = start({ overlay: false });
    const list = instance.tools.find((tool) => tool.schema.plan.type === "read-collection");

    const result = await list!.execute({});
    expect(result.ok).toBe(true);

    const rows = (result.data as { rows: Array<Record<string, string>> }).rows;
    expect(rows).toHaveLength(6);
    expect(rows[0].load).toBe("HF-4118");
    expect(rows[0].carrier).toBe("Kestrel Haulage");
    expect(rows[0].destination).toBe("Gothenburg");
  });

  it("stops a carrier payment at the consent gate and leaves the money unspent", async () => {
    loadDispatch();
    const instance = start({ overlay: false, policy: { destructive: "prompt" } });

    const seen: ConsentRequest[] = [];
    instance.firewall.setPrompt(async (request) => {
      seen.push(request);
      return "deny";
    });

    const pay = instance.tools.find((tool) => tool.schema.name === "pay_carrier_for_load");
    const result: ToolResult = await pay!.execute({ load: "HF-4116" });

    expect(result.ok).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.message).toMatch(/consent/i);

    expect(seen).toHaveLength(1);
    expect(seen[0].effect).toMatch(/HF-4116/);
    expect(seen[0].reasons.some((reason) => /money/i.test(reason.rationale))).toBe(true);

    // The payout counter never moved.
    expect(document.getElementById("fig-paid")?.textContent).toBe("$0");
    expect(instance.firewall.auditLog.at(-1)?.outcome).toBe("denied");
  });

  it("drives an allowed anchor action through the page's own click handler", async () => {
    loadDispatch();
    const instance = start({ overlay: false, policy: { write: "allow" } });

    const hold = instance.tools.find((tool) => tool.schema.name === "hold_load");
    const result = await hold!.execute({ load: "HF-4111" });

    expect(result.ok).toBe(true);
    expect(document.getElementById("status")?.textContent).toMatch(/HF-4111 placed on hold/);
  });
});
