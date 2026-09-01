// Firewall tests: classification must be right, and a denied consent must mean
// the handler never runs. These two properties are the whole security claim.

import { describe, expect, it, vi } from "vitest";
import { bind } from "../src/binder";
import { DENIED_MESSAGE, Firewall, classify } from "../src/firewall";
import { generate } from "../src/generator";
import { scan } from "../src/scanner";
import type { Candidate, ConsentDecision, ConsentRequest, ToolSchema } from "../src/types";
import { fragmentDocument, invoiceDocument } from "./fixture";

function schemas(): ToolSchema[] {
  return generate(scan(invoiceDocument()));
}

function capabilityOf(name: string): string {
  const tool = schemas().find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`No tool named ${name}`);
  return tool.capability;
}

function candidateFor(html: string): Candidate {
  const candidates = scan(fragmentDocument(html)).candidates;
  const action = candidates.find((c) => c.kind === "action" || c.kind === "form" || c.kind === "query");
  if (!action) throw new Error("fixture produced no actionable candidate");
  return action;
}

describe("classify", () => {
  it("marks delete, send and pay buttons destructive", () => {
    expect(classify(candidateFor('<button type="button">Delete account</button>')).capability).toBe(
      "destructive",
    );
    expect(classify(candidateFor('<button type="button">Send to client</button>')).capability).toBe(
      "destructive",
    );
    expect(classify(candidateFor('<button type="button">Pay now</button>')).capability).toBe(
      "destructive",
    );
    expect(classify(candidateFor('<button type="button">Cancel subscription</button>')).capability).toBe(
      "destructive",
    );
  });

  it("marks search and filter controls read", () => {
    const search = candidateFor(`
      <form role="search" aria-label="Search orders">
        <label for="s">Search</label><input id="s" type="search" />
      </form>
    `);
    expect(classify(search).capability).toBe("read");
  });

  it("marks a create form write", () => {
    const form = candidateFor(`
      <form aria-label="Create project" method="post">
        <label for="n">Name</label><input id="n" />
        <button type="submit">Create project</button>
      </form>
    `);
    expect(classify(form).capability).toBe("write");
  });

  it("escalates to destructive even when read signals are also present", () => {
    // "Export" is a read verb, but "delete" must still win — fail safe.
    const mixed = candidateFor('<button type="button">Export and delete archive</button>');
    expect(classify(mixed).capability).toBe("destructive");
  });

  it("explains itself: every classification carries the signals that fired", () => {
    const result = classify(candidateFor('<button type="button">Delete invoice</button>'));
    expect(result.reasons.some((reason) => reason.signalId === "delete")).toBe(true);
    expect(result.reasons[0]?.rationale.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("classifies the real dashboard the way a person would", () => {
    expect(capabilityOf("list_invoices")).toBe("read");
    expect(capabilityOf("filter_invoices")).toBe("read");
    expect(capabilityOf("view_invoice")).toBe("read");
    expect(capabilityOf("create_invoice")).toBe("write");
    expect(capabilityOf("delete_invoice")).toBe("destructive");
    expect(capabilityOf("send_invoice_to_client")).toBe("destructive");
  });
});

describe("Firewall.guard", () => {
  const destructive = (): ToolSchema => {
    const tool = schemas().find((candidate) => candidate.name === "delete_invoice");
    if (!tool) throw new Error("delete_invoice missing");
    return tool;
  };

  it("does not run the handler when consent is denied", async () => {
    const firewall = new Firewall({ prompt: async () => "deny" });
    const handler = vi.fn(async () => ({ ok: true, message: "ran" }));

    const result = await firewall.guard(destructive(), { invoice: "INV-1042" }, handler, {
      effect: "deletes a row",
      origin: "simulator",
    });

    expect(handler).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.message).toBe(DENIED_MESSAGE);
    expect(firewall.auditLog.at(-1)?.outcome).toBe("denied");
  });

  it("fails closed when the consent UI throws", async () => {
    const firewall = new Firewall({
      prompt: async () => {
        throw new Error("modal unmounted");
      },
    });
    const handler = vi.fn(async () => ({ ok: true, message: "ran" }));

    const result = await firewall.guard(destructive(), {}, handler, {
      effect: "deletes a row",
      origin: "simulator",
    });

    expect(handler).not.toHaveBeenCalled();
    expect(result.message).toBe(DENIED_MESSAGE);
  });

  it("runs read tools without ever asking for consent", async () => {
    const prompt = vi.fn<(request: ConsentRequest) => Promise<ConsentDecision>>(async () => "deny");
    const firewall = new Firewall({ prompt });
    const list = schemas().find((candidate) => candidate.name === "list_invoices");
    if (!list) throw new Error("list_invoices missing");

    const result = await firewall.guard(list, {}, async () => ({ ok: true, message: "3 rows" }), {
      effect: "reads rows",
      origin: "simulator",
    });

    expect(prompt).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(firewall.auditLog.at(-1)?.outcome).toBe("allowed");
  });

  it('asks once for "allow for this session", then stops asking for that tool', async () => {
    const prompt = vi.fn<(request: ConsentRequest) => Promise<ConsentDecision>>(
      async () => "allow-session",
    );
    const firewall = new Firewall({ prompt });
    const schema = destructive();
    const run = async () => ({ ok: true, message: "deleted" });

    await firewall.guard(schema, { invoice: "INV-1042" }, run, { effect: "x", origin: "simulator" });
    await firewall.guard(schema, { invoice: "INV-1041" }, run, { effect: "x", origin: "simulator" });

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(firewall.listSessionGrants()).toEqual(["delete_invoice"]);
    expect(firewall.auditLog.map((entry) => entry.outcome)).toEqual([
      "allowed-session",
      "auto-allowed-session",
    ]);

    firewall.revokeSessionGrants();
    await firewall.guard(schema, { invoice: "INV-1040" }, run, { effect: "x", origin: "simulator" });
    expect(prompt).toHaveBeenCalledTimes(2);
  });

  it('asks again for every call after "allow once"', async () => {
    const prompt = vi.fn<(request: ConsentRequest) => Promise<ConsentDecision>>(async () => "allow-once");
    const firewall = new Firewall({ prompt });
    const schema = destructive();
    const run = async () => ({ ok: true, message: "deleted" });

    await firewall.guard(schema, {}, run, { effect: "x", origin: "simulator" });
    await firewall.guard(schema, {}, run, { effect: "x", origin: "simulator" });

    expect(prompt).toHaveBeenCalledTimes(2);
  });

  it("escalates low-confidence tools to a prompt in strict mode", async () => {
    const prompt = vi.fn<(request: ConsentRequest) => Promise<ConsentDecision>>(async () => "deny");
    const firewall = new Firewall({ prompt, policy: { strictUnknown: true, strictThreshold: 0.5 } });
    const unknown = generate(scan(fragmentDocument('<button type="button">Frobnicate</button>')))[0];

    expect(unknown.classification.confidence).toBeLessThan(0.5);
    await firewall.guard(unknown, {}, async () => ({ ok: true, message: "ran" }), {
      effect: "unknown",
      origin: "simulator",
    });
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it("blocks outright when policy says block, without prompting", async () => {
    const prompt = vi.fn<(request: ConsentRequest) => Promise<ConsentDecision>>(async () => "allow-once");
    const firewall = new Firewall({ prompt, policy: { destructive: "block" } });
    const handler = vi.fn(async () => ({ ok: true, message: "ran" }));

    const result = await firewall.guard(destructive(), {}, handler, { effect: "x", origin: "simulator" });

    expect(prompt).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    expect(result.blocked).toBe(true);
    expect(firewall.auditLog.at(-1)?.outcome).toBe("blocked");
  });

  it("passes the exact arguments and the effect sentence to the consent prompt", async () => {
    const seen: ConsentRequest[] = [];
    const firewall = new Firewall({
      prompt: async (request) => {
        seen.push(request);
        return "deny";
      },
    });

    await firewall.guard(destructive(), { invoice: "INV-1042" }, async () => ({ ok: true, message: "" }), {
      effect: "Runs Delete invoice on row INV-1042",
      origin: "webmcp",
    });

    expect(seen).toHaveLength(1);
    expect(seen[0].args).toEqual({ invoice: "INV-1042" });
    expect(seen[0].effect).toContain("INV-1042");
    expect(seen[0].capability).toBe("destructive");
    expect(seen[0].reasons.length).toBeGreaterThan(0);
  });

  it("records failures instead of throwing them at the agent", async () => {
    const firewall = new Firewall({ prompt: async () => "allow-once" });
    const result = await firewall.guard(
      destructive(),
      {},
      async () => {
        throw new Error("boom");
      },
      { effect: "x", origin: "simulator" },
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain("boom");
    expect(firewall.auditLog.at(-1)?.outcome).toBe("error");
  });
});

describe("firewall + binder end to end", () => {
  it("a denied delete leaves the page untouched", async () => {
    const doc = invoiceDocument();
    const firewall = new Firewall({ prompt: async () => "deny" });
    const tools = bind(generate(scan(doc)), { document: doc, firewall, origin: "simulator" });
    const remove = tools.find((tool) => tool.schema.name === "delete_invoice");
    if (!remove) throw new Error("delete_invoice missing");

    const rowsBefore = doc.querySelectorAll("tbody tr").length;
    const result = await remove.execute({ invoice: "INV-1042" });

    expect(result.blocked).toBe(true);
    expect(doc.querySelectorAll("tbody tr").length).toBe(rowsBefore);
  });
});
