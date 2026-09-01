// Generator tests: candidates must become valid, uniquely named WebMCP tools.

import { describe, expect, it } from "vitest";
import { generate } from "../src/generator";
import { scan } from "../src/scanner";
import type { JsonSchemaObject, ToolSchema } from "../src/types";
import { fragmentDocument, invoiceDocument } from "./fixture";

function tools(): ToolSchema[] {
  return generate(scan(invoiceDocument()));
}

function find(list: readonly ToolSchema[], name: string): ToolSchema {
  const tool = list.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`No tool named ${name}. Got: ${list.map((t) => t.name).join(", ")}`);
  return tool;
}

/** Asserts the object is a JSON Schema an MCP client would accept. */
function expectValidSchema(schema: JsonSchemaObject): void {
  expect(schema.type).toBe("object");
  expect(schema.additionalProperties).toBe(false);
  expect(Array.isArray(schema.required)).toBe(true);
  for (const name of schema.required) {
    expect(Object.keys(schema.properties)).toContain(name);
  }
  for (const [name, property] of Object.entries(schema.properties)) {
    expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
    expect(["string", "number", "integer", "boolean"]).toContain(property.type);
    expect(property.description.length).toBeGreaterThan(0);
  }
}

describe("generate", () => {
  it("produces the expected tool names for the invoices dashboard", () => {
    const names = tools().map((tool) => tool.name);

    expect(names).toContain("list_invoices");
    expect(names).toContain("filter_invoices");
    expect(names).toContain("create_invoice");
    expect(names).toContain("delete_invoice");
    expect(names).toContain("send_invoice_to_client");
    expect(names).toContain("view_invoice");
    expect(names).toContain("read_account_summary");
  });

  it("gives every tool a unique, MCP-safe name", () => {
    const names = tools().map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name).toMatch(/^[a-z][a-z0-9_]{0,63}$/);
    }
  });

  it("emits a valid JSON Schema for every tool", () => {
    for (const tool of tools()) {
      expectValidSchema(tool.inputSchema);
    }
  });

  it("marks required form fields as required and keeps filters optional", () => {
    const list = tools();
    const create = find(list, "create_invoice");
    expect([...create.inputSchema.required].sort()).toEqual(["amount", "client_name"]);
    expect(create.inputSchema.properties.amount?.type).toBe("number");
    expect(create.inputSchema.properties.amount?.minimum).toBe(1);

    const filter = find(list, "filter_invoices");
    expect(filter.inputSchema.required).toEqual([]);
    expect(filter.inputSchema.properties.status?.enum).toEqual(["all", "paid", "overdue"]);
  });

  it("gives a row action exactly one required identifier parameter", () => {
    const remove = find(tools(), "delete_invoice");
    expect(remove.inputSchema.required).toEqual(["invoice"]);
    expect(remove.inputSchema.properties.invoice?.description).toContain("INV-1042");
    expect(remove.plan.type).toBe("row-action");
  });

  it("writes descriptions that tell the agent what the capability means", () => {
    const list = tools();
    expect(find(list, "delete_invoice").description).toContain("confirm");
    expect(find(list, "list_invoices").description).toContain("Read-only");
  });

  it("disambiguates duplicate labels instead of colliding", () => {
    const doc = fragmentDocument(`
      <section aria-label="One"><button type="button">Archive</button></section>
      <section aria-label="Two"><button type="button" aria-label="Archive ">Archive</button></section>
    `);
    const names = generate(scan(doc)).map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
