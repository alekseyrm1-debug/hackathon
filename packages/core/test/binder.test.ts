// Binder tests: generated handlers must actually drive the page — read real
// rows, write through React-style setters, and click the right row's button.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { bind } from "../src/binder";
import { Firewall } from "../src/firewall";
import { generate } from "../src/generator";
import { scan } from "../src/scanner";
import type { BoundTool } from "../src/types";
import { invoiceDocument } from "./fixture";

let doc: Document;
let tools: BoundTool[];

function tool(name: string): BoundTool {
  const found = tools.find((candidate) => candidate.schema.name === name);
  if (!found) throw new Error(`No tool named ${name}`);
  return found;
}

beforeEach(() => {
  doc = invoiceDocument();
  const firewall = new Firewall({ prompt: async () => "allow-once" });
  tools = bind(generate(scan(doc)), { document: doc, firewall, origin: "simulator", settleMs: 0 });
});

describe("read tools", () => {
  it("returns the table rows as structured data", async () => {
    const result = await tool("list_invoices").execute({});
    const payload = result.data as { rowCount: number; rows: Array<Record<string, string>> };

    expect(result.ok).toBe(true);
    expect(payload.rowCount).toBe(3);
    expect(payload.rows[0]).toMatchObject({
      invoice: "INV-1042",
      client: "Acme Corp",
      amount: "$4,200.00",
      status: "Overdue",
    });
    // The button column is UI, not data.
    expect(Object.keys(payload.rows[0])).not.toContain("actions");
  });

  it("honours the limit argument", async () => {
    const result = await tool("list_invoices").execute({ limit: 2 });
    const payload = result.data as { returned: number };
    expect(payload.returned).toBe(2);
  });

  it("reads the summary figures as name/value pairs", async () => {
    const result = await tool("read_account_summary").execute({});
    expect(result.data).toEqual({
      outstanding: "$12,400.00",
      overdue: "$4,200.00",
      paid_this_month: "$8,900.00",
    });
  });
});

describe("write tools", () => {
  it("writes through the native setter so a controlled input would notice", async () => {
    const input = doc.querySelector<HTMLInputElement>("#q");
    if (!input) throw new Error("search input missing");
    const events: string[] = [];
    input.addEventListener("input", () => events.push("input"));

    const result = await tool("filter_invoices").execute({ search: "Acme", status: "overdue" });

    expect(result.ok).toBe(true);
    expect(input.value).toBe("Acme");
    expect(doc.querySelector<HTMLSelectElement>("#status")?.value).toBe("overdue");
    expect(events).toContain("input");
  });

  it("fills a form and presses its submit button", async () => {
    const form = doc.querySelector<HTMLFormElement>("form[aria-label='Create invoice']");
    if (!form) throw new Error("create form missing");
    const submitted = vi.fn((event: Event) => event.preventDefault());
    form.addEventListener("submit", submitted);

    const result = await tool("create_invoice").execute({
      client_name: "Initech",
      amount: 990,
      due_date: "2026-10-01",
    });

    expect(result.ok).toBe(true);
    expect(submitted).toHaveBeenCalledTimes(1);
    expect(doc.querySelector<HTMLInputElement>("#client")?.value).toBe("Initech");
    expect(doc.querySelector<HTMLInputElement>("#amount")?.value).toBe("990");
  });

  it("refuses to submit when a required argument is missing", async () => {
    const form = doc.querySelector<HTMLFormElement>("form[aria-label='Create invoice']");
    const submitted = vi.fn((event: Event) => event.preventDefault());
    form?.addEventListener("submit", submitted);

    const result = await tool("create_invoice").execute({ client_name: "Initech" });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("amount");
    expect(submitted).not.toHaveBeenCalled();
  });
});

describe("row actions", () => {
  it("clicks the button belonging to the requested row only", async () => {
    const clicked: string[] = [];
    for (const button of Array.from(doc.querySelectorAll("tbody button"))) {
      button.addEventListener("click", () => clicked.push(button.getAttribute("aria-label") ?? ""));
    }

    const result = await tool("delete_invoice").execute({ invoice: "INV-1041" });

    expect(result.ok).toBe(true);
    expect(clicked).toEqual(["Delete invoice INV-1041"]);
  });

  it("matches a row case-insensitively and by partial identifier", async () => {
    const clicked: string[] = [];
    for (const button of Array.from(doc.querySelectorAll("tbody button"))) {
      button.addEventListener("click", () => clicked.push(button.getAttribute("aria-label") ?? ""));
    }

    await tool("send_invoice_to_client").execute({ invoice: "inv-1040" });
    expect(clicked).toEqual(["Send invoice INV-1040 to client"]);
  });

  it("returns a readable error, and clicks nothing, for an unknown row", async () => {
    const clicked = vi.fn();
    for (const button of Array.from(doc.querySelectorAll("tbody button"))) {
      button.addEventListener("click", clicked);
    }

    const result = await tool("delete_invoice").execute({ invoice: "INV-9999" });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("INV-1042");
    expect(clicked).not.toHaveBeenCalled();
  });

  it("previews the concrete row a destructive call would hit", () => {
    const preview = tool("delete_invoice").preview({ invoice: "INV-1042" });
    expect(preview).toContain("INV-1042");
    expect(preview).toContain("Acme Corp");
  });

  it("never throws when the element has gone away", async () => {
    doc.querySelector("table")?.remove();
    const result = await tool("delete_invoice").execute({ invoice: "INV-1042" });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("no longer on the page");
  });
});
