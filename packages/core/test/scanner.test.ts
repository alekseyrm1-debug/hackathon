// Scanner tests: does ordinary semantic HTML produce the right candidates?

import { describe, expect, it } from "vitest";
import { scan } from "../src/scanner";
import type { Candidate, CandidateKind } from "../src/types";
import { fragmentDocument, invoiceDocument } from "./fixture";

function byKind(candidates: readonly Candidate[], kind: CandidateKind): Candidate[] {
  return candidates.filter((candidate) => candidate.kind === kind);
}

describe("scan", () => {
  it("finds the table, its row actions, the filter bar, the form and the summary list", () => {
    const result = scan(invoiceDocument());
    const kinds = result.candidates.map((candidate) => candidate.kind);

    expect(kinds).toContain("collection");
    expect(kinds).toContain("row-action");
    expect(kinds).toContain("query");
    expect(kinds).toContain("form");
    expect(kinds).toContain("summary");
  });

  it("collapses a repeated row button into one candidate with a row parameter", () => {
    const result = scan(invoiceDocument());
    const rowActions = byKind(result.candidates, "row-action");

    // Three buttons per row across three rows must yield three tools, not nine.
    expect(rowActions).toHaveLength(3);
    expect(rowActions.map((candidate) => candidate.label).sort()).toEqual([
      "Delete invoice",
      "Send invoice to client",
      "View invoice",
    ]);

    const remove = rowActions.find((candidate) => candidate.label === "Delete invoice");
    expect(remove?.fields).toHaveLength(1);
    expect(remove?.fields[0]?.name).toBe("invoice");
    expect(remove?.fields[0]?.required).toBe(true);
  });

  it("describes the collection shape, ignoring the button column", () => {
    const result = scan(invoiceDocument());
    const collection = byKind(result.candidates, "collection")[0];

    expect(collection).toBeDefined();
    expect(collection.collection?.columns.map((column) => column.label)).toEqual([
      "Invoice",
      "Client",
      "Amount",
      "Status",
    ]);
    expect(collection.collection?.keyLabel).toBe("Invoice");
    expect(collection.collection?.rowCount).toBe(3);
    expect(collection.collection?.sampleKeys).toContain("INV-1042");
  });

  it("groups the search box and the status select into a single filter candidate", () => {
    const result = scan(invoiceDocument());
    const queries = byKind(result.candidates, "query");

    expect(queries).toHaveLength(1);
    expect(queries[0].label).toBe("Filter invoices");
    expect(queries[0].fields.map((field) => field.name).sort()).toEqual(["search", "status"]);

    const status = queries[0].fields.find((field) => field.name === "status");
    expect(status?.options).toEqual(["all", "paid", "overdue"]);
  });

  it("reads field names from <label> associations, never from class names", () => {
    const doc = fragmentDocument(`
      <form aria-label="Create invoice" method="post">
        <label for="c" class="text-sm font-bold text-slate-700">Client name</label>
        <input id="c" class="rounded-xl border px-3" required />
        <button type="submit" class="bg-indigo-600">Create invoice</button>
      </form>
    `);
    const form = scan(doc).candidates.find((candidate) => candidate.kind === "form");

    expect(form?.fields[0]?.name).toBe("client_name");
    expect(form?.fields[0]?.label).toBe("Client name");
    expect(form?.fields[0]?.required).toBe(true);
  });

  it("skips subtrees marked with data-toolfence-ignore so the inspector is not scanned", () => {
    const doc = fragmentDocument(`
      <section aria-label="App"><button type="button">Archive project</button></section>
      <aside data-toolfence-ignore><button type="button">Rescan page</button></aside>
    `);
    const labels = scan(doc).candidates.map((candidate) => candidate.label);

    expect(labels).toContain("Archive project");
    expect(labels).not.toContain("Rescan page");
  });

  it("is a pure function: it does not mutate the document", () => {
    const doc = invoiceDocument();
    const before = doc.body.innerHTML;
    scan(doc);
    expect(doc.body.innerHTML).toBe(before);
  });

  it("returns an empty result instead of throwing on an empty page", () => {
    const doc = fragmentDocument("");
    const result = scan(doc);
    expect(result.candidates).toEqual([]);
  });
});

describe("grids that are not tables", () => {
  it("reads rows and cells declared with ARIA roles instead of table tags", () => {
    const doc = fragmentDocument(`
      <div role="grid" aria-label="Servers">
        <div role="row">
          <span role="columnheader">Host</span>
          <span role="columnheader">Region</span>
          <span role="columnheader">Actions</span>
        </div>
        <div role="row">
          <span role="rowheader">web-01</span>
          <span role="gridcell">eu-west</span>
          <span role="gridcell"><a href="#" role="button" aria-label="Restart web-01">Restart</a></span>
        </div>
        <div role="row">
          <span role="rowheader">web-02</span>
          <span role="gridcell">us-east</span>
          <span role="gridcell"><a href="#" role="button" aria-label="Restart web-02">Restart</a></span>
        </div>
      </div>
    `);

    const result = scan(doc);
    const collection = result.candidates.find((candidate) => candidate.kind === "collection");

    expect(collection?.collection?.rowCount).toBe(2);
    expect(collection?.collection?.keyLabel).toBe("Host");
    expect(collection?.collection?.sampleKeys).toEqual(["web-01", "web-02"]);

    // The two anchors collapse into one row action, keyed by the host column.
    const actions = result.candidates.filter((candidate) => candidate.kind === "row-action");
    expect(actions).toHaveLength(1);
    expect(actions[0].label).toBe("Restart");
    expect(result.skipped).toEqual([]);
  });
});
