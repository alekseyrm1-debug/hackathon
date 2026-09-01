// Turns a ToolSchema into an executable handler that drives the real page.
// Every handler resolves its elements at call time (so React re-renders cannot
// stale them), routes through the firewall, and always resolves — never throws.

import {
  accessibleName,
  normalizeText,
  resolve,
  setControlValue,
  visibleText,
} from "./dom";
import type { Firewall } from "./firewall";
import { bodyRows, headerRowCells, rowKey, stripRowIdentity } from "./scanner";
import { toSnakeCase } from "./dom";
import type {
  BoundTool,
  CallOrigin,
  CollectionShape,
  ExecutionPlan,
  FieldCandidate,
  ToolResult,
  ToolSchema,
} from "./types";

export interface BindOptions {
  readonly document: Document;
  readonly firewall: Firewall;
  /** Where calls are coming from; recorded in the audit log. */
  readonly origin?: CallOrigin;
  /** How long to let the app re-render after an interaction. */
  readonly settleMs?: number;
}

const DEFAULT_SETTLE_MS = 80;

/** Binds a whole tool list in one call. */
export function bind(schemas: readonly ToolSchema[], options: BindOptions): BoundTool[] {
  return schemas.map((schema) => bindOne(schema, options));
}

/** Binds one schema. The returned `execute` is what WebMCP receives. */
export function bindOne(schema: ToolSchema, options: BindOptions): BoundTool {
  const origin: CallOrigin = options.origin ?? "webmcp";

  const preview = (args: Readonly<Record<string, unknown>>): string =>
    describeEffect(schema, args, options.document);

  const execute = async (args: Readonly<Record<string, unknown>>): Promise<ToolResult> => {
    const safeArgs = isRecord(args) ? args : {};
    return options.firewall.guard(schema, safeArgs, () => runPlan(schema, safeArgs, options), {
      effect: preview(safeArgs),
      origin,
    });
  };

  return { schema, execute, preview };
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

async function runPlan(
  schema: ToolSchema,
  args: Readonly<Record<string, unknown>>,
  options: BindOptions,
): Promise<ToolResult> {
  const doc = options.document;
  const settleMs = options.settleMs ?? DEFAULT_SETTLE_MS;
  const plan = schema.plan;

  try {
    switch (plan.type) {
      case "read-collection":
        return readCollection(doc, plan.collection, args);
      case "read-summary":
        return readSummary(doc, plan.selector);
      case "set-value":
        return await applyValues(doc, plan, args, settleMs);
      case "fill-and-submit":
        return await fillAndSubmit(doc, plan, args, settleMs, schema);
      case "click":
        return await clickTarget(doc, plan.selector, settleMs);
      case "row-action":
        return await runRowAction(doc, plan, args, settleMs);
      default:
        return fail(`Unsupported execution plan for tool "${schema.name}".`);
    }
  } catch (error) {
    return fail(errorMessage(error));
  }
}

function readCollection(
  doc: Document,
  shape: CollectionShape,
  args: Readonly<Record<string, unknown>>,
): ToolResult {
  const table = resolve(doc, shape.tableSelector);
  if (!table) return fail("The table is no longer on the page. Reload the page and rescan.");

  const rows = extractRows(table);
  const limit = toPositiveInt(args.limit);
  const sliced = limit === null ? rows : rows.slice(0, limit);

  return {
    ok: true,
    message:
      rows.length === 0
        ? "No rows are currently visible (a filter may be hiding everything)."
        : `Returned ${sliced.length} of ${rows.length} currently visible row(s).`,
    data: { rowCount: rows.length, returned: sliced.length, rows: sliced },
  };
}

function readSummary(doc: Document, selector: string): ToolResult {
  const list = resolve(doc, selector);
  if (!list) return fail("The summary block is no longer on the page. Reload and rescan.");

  const pairs: Record<string, string> = {};
  const children = Array.from(list.children);
  let currentTerm: string | null = null;
  for (const child of children) {
    if (child.tagName === "DT") currentTerm = visibleText(child, 80);
    else if (child.tagName === "DD" && currentTerm) {
      pairs[toSnakeCase(currentTerm)] = visibleText(child, 120);
      currentTerm = null;
    } else {
      // Wrapper elements are common; look one level deeper before giving up.
      const dt = child.querySelector("dt");
      const dd = child.querySelector("dd");
      if (dt && dd) pairs[toSnakeCase(visibleText(dt, 80))] = visibleText(dd, 120);
    }
  }

  const count = Object.keys(pairs).length;
  return {
    ok: count > 0,
    message: count > 0 ? `Read ${count} figure(s).` : "No name/value pairs found in this block.",
    data: pairs,
  };
}

async function applyValues(
  doc: Document,
  plan: Extract<ExecutionPlan, { type: "set-value" }>,
  args: Readonly<Record<string, unknown>>,
  settleMs: number,
): Promise<ToolResult> {
  const applied: string[] = [];
  const problems: string[] = [];

  for (const field of plan.fields) {
    if (!(field.name in args) || args[field.name] === undefined || args[field.name] === null) continue;
    const element = resolve(doc, field.selector);
    if (!element) {
      problems.push(`control "${field.label}" is no longer on the page`);
      continue;
    }
    const value = String(args[field.name]);
    if (setControlValue(element, value)) applied.push(`${field.label} = "${value}"`);
    else problems.push(`could not write to "${field.label}"`);
  }

  if (applied.length === 0 && problems.length === 0) {
    return fail("No known parameters were supplied, so nothing was changed.");
  }

  await settle(doc, settleMs);

  let data: unknown = undefined;
  let tail = "";
  if (plan.readBackSelector) {
    const table = resolve(doc, plan.readBackSelector);
    if (table) {
      const rows = extractRows(table);
      data = { rowCount: rows.length, rows };
      tail = ` ${rows.length} row(s) now match.`;
    }
  }

  const problemTail = problems.length > 0 ? ` Warnings: ${problems.join("; ")}.` : "";
  return {
    ok: applied.length > 0,
    message: `Applied ${applied.join(", ")}.${tail}${problemTail}`,
    data,
  };
}

async function fillAndSubmit(
  doc: Document,
  plan: Extract<ExecutionPlan, { type: "fill-and-submit" }>,
  args: Readonly<Record<string, unknown>>,
  settleMs: number,
  schema: ToolSchema,
): Promise<ToolResult> {
  const form = resolve(doc, plan.formSelector);
  if (!form) return fail("The form is no longer on the page. Reload the page and rescan.");

  const missing = schema.inputSchema.required.filter(
    (name) => args[name] === undefined || args[name] === null || args[name] === "",
  );
  if (missing.length > 0) {
    return fail(`Missing required argument(s): ${missing.join(", ")}.`);
  }

  const applied: string[] = [];
  for (const field of plan.fields) {
    if (!(field.name in args) || args[field.name] === undefined || args[field.name] === null) continue;
    const element = resolve(doc, field.selector);
    if (!element) return fail(`Field "${field.label}" is no longer on the page.`);
    if (!setControlValue(element, String(args[field.name]))) {
      return fail(`Could not write a value into "${field.label}".`);
    }
    applied.push(`${field.label} = "${String(args[field.name])}"`);
  }

  await settle(doc, settleMs);

  const submit = findSubmitControl(doc, form, plan.submitSelector);
  if (!submit) return fail("The form has no submit control that ToolFence can activate.");
  clickElement(submit);
  await settle(doc, settleMs);

  const feedback = liveRegionText(doc);
  return {
    ok: true,
    message: `Submitted "${schema.name}" with ${applied.join(", ") || "no field values"}.${
      feedback ? ` Page reported: ${feedback}` : ""
    }`,
    data: { submitted: applied },
  };
}

async function clickTarget(doc: Document, selector: string, settleMs: number): Promise<ToolResult> {
  const element = resolve(doc, selector);
  if (!element) return fail("That control is no longer on the page. Reload the page and rescan.");
  if (element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true") {
    return fail("That control is currently disabled.");
  }
  clickElement(element);
  await settle(doc, settleMs);
  const feedback = liveRegionText(doc);
  return {
    ok: true,
    message: `Activated "${accessibleName(element) || selector}".${feedback ? ` Page reported: ${feedback}` : ""}`,
  };
}

async function runRowAction(
  doc: Document,
  plan: Extract<ExecutionPlan, { type: "row-action" }>,
  args: Readonly<Record<string, unknown>>,
  settleMs: number,
): Promise<ToolResult> {
  const located = locateRow(doc, plan.collection, args);
  if ("error" in located) return fail(located.error);

  const button = findRowButton(located.row, plan.collection, plan.actionLabel);
  if (!button) {
    return fail(
      `Row "${located.key}" has no "${plan.actionLabel}" control. It may not be available for this row.`,
    );
  }

  clickElement(button);
  await settle(doc, settleMs);
  const feedback = liveRegionText(doc);
  return {
    ok: true,
    message: `Ran "${plan.actionLabel}" on row "${located.key}".${feedback ? ` Page reported: ${feedback}` : ""}`,
    data: { row: located.key },
  };
}

// ---------------------------------------------------------------------------
// Effect preview — the sentence the consent modal shows
// ---------------------------------------------------------------------------

export function describeEffect(
  schema: ToolSchema,
  args: Readonly<Record<string, unknown>>,
  doc: Document,
): string {
  const plan = schema.plan;
  try {
    switch (plan.type) {
      case "row-action": {
        const located = locateRow(doc, plan.collection, args);
        if ("error" in located) {
          return `Would run "${plan.actionLabel}" on a row of the ${plan.collection.keyLabel} table, but that row was not found.`;
        }
        const summary = summariseRow(located.row, plan.collection);
        return `Runs "${plan.actionLabel}" on row ${located.key}${summary ? ` (${summary})` : ""}. This activates the same button a person would click in that row.`;
      }
      case "fill-and-submit": {
        const values = plan.fields
          .filter((f) => f.name in args)
          .map((f) => `${f.label}: ${String(args[f.name])}`);
        return `Fills the form (${values.join(", ") || "no values"}) and presses its submit button, creating a new record on this page.`;
      }
      case "set-value": {
        const values = plan.fields
          .filter((f) => f.name in args)
          .map((f) => `${f.label} = ${String(args[f.name])}`);
        return `Changes the on-screen filters (${values.join(", ") || "no values"}). Stored data is not modified.`;
      }
      case "click": {
        const element = resolve(doc, plan.selector);
        return `Clicks the "${element ? accessibleName(element) : "target"}" button on this page.`;
      }
      case "read-collection":
        return `Reads the rows currently displayed in the "${plan.collection.keyLabel}" table. Nothing on the page changes.`;
      case "read-summary":
        return "Reads the summary figures displayed on the page. Nothing on the page changes.";
      default:
        return "Runs a generated tool against this page.";
    }
  } catch {
    return "Runs a generated tool against this page.";
  }
}

function summariseRow(row: Element, shape: CollectionShape): string {
  const cells = Array.from(row.children);
  return shape.columns
    .filter((column) => column.index !== shape.keyColumnIndex)
    .slice(0, 3)
    .map((column) => {
      const cell = cells[column.index];
      return cell ? `${column.label}: ${visibleText(cell, 40)}` : "";
    })
    .filter((text) => text.length > 0)
    .join(" · ");
}

// ---------------------------------------------------------------------------
// Table helpers
// ---------------------------------------------------------------------------

/** Reads a table's visible rows into plain objects, headers derived live. */
export function extractRows(table: Element): Array<Record<string, string>> {
  const headers = headerRowCells(table).map((cell, index) => ({
    name: toSnakeCase(visibleText(cell, 60)) || `column_${index + 1}`,
    label: visibleText(cell, 60),
    index,
  }));

  return bodyRows(table).map((row) => {
    const cells = Array.from(row.children);
    const record: Record<string, string> = {};
    headers.forEach((header) => {
      const cell = cells[header.index];
      if (!cell) return;
      // A cell that only holds buttons is UI, not data.
      const interactive = cell.querySelector("button, [role='button'], a[href]");
      const text = visibleText(cell, 120);
      if (interactive && normalizeText(text) === normalizeText(interactiveText(cell))) return;
      if (!header.label) return;
      record[header.name] = text;
    });
    return record;
  });
}

function interactiveText(cell: Element): string {
  return Array.from(cell.querySelectorAll("button, [role='button'], a[href]"))
    .map((el) => visibleText(el, 40))
    .join(" ");
}

type LocatedRow = { row: Element; key: string } | { error: string };

function locateRow(
  doc: Document,
  shape: CollectionShape,
  args: Readonly<Record<string, unknown>>,
): LocatedRow {
  const table = resolve(doc, shape.tableSelector);
  if (!table) return { error: "The table is no longer on the page. Reload the page and rescan." };

  const paramName = toSnakeCase(shape.keyLabel) || "row";
  const raw = args[paramName] ?? args.row ?? args.id;
  const wanted = normalizeText(typeof raw === "string" || typeof raw === "number" ? String(raw) : "");
  if (!wanted) {
    return { error: `Argument "${paramName}" is required to pick a row.` };
  }

  const rows = bodyRows(table);
  const keys = rows.map((row) => rowKey(row, shape.keyColumnIndex));

  const exact = keys.findIndex((key) => key === wanted);
  if (exact >= 0) return { row: rows[exact], key: keys[exact] };

  const lower = wanted.toLowerCase();
  const insensitive = keys.findIndex((key) => key.toLowerCase() === lower);
  if (insensitive >= 0) return { row: rows[insensitive], key: keys[insensitive] };

  const partial = keys.findIndex((key) => key.toLowerCase().includes(lower));
  if (partial >= 0) return { row: rows[partial], key: keys[partial] };

  const anyCell = rows.findIndex((row) => visibleText(row, 300).toLowerCase().includes(lower));
  if (anyCell >= 0) return { row: rows[anyCell], key: keys[anyCell] };

  return {
    error: `No row matches "${wanted}". Visible ${shape.keyLabel} values: ${
      keys.slice(0, 8).join(", ") || "none"
    }.`,
  };
}

function findRowButton(row: Element, shape: CollectionShape, actionLabel: string): Element | null {
  const key = rowKey(row, shape.keyColumnIndex);
  const wanted = actionLabel.toLowerCase();
  const buttons = Array.from(row.querySelectorAll("button, [role='button'], a[href]"));
  for (const button of buttons) {
    const stripped = stripRowIdentity(accessibleName(button), key, row).toLowerCase();
    if (stripped === wanted) return button;
  }
  for (const button of buttons) {
    if (accessibleName(button).toLowerCase().includes(wanted)) return button;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function findSubmitControl(doc: Document, form: Element, selector: string | null): Element | null {
  if (selector) {
    const explicit = resolve(doc, selector);
    if (explicit) return explicit;
  }
  return (
    form.querySelector("button[type='submit'], input[type='submit']") ??
    Array.from(form.querySelectorAll("button")).find((btn) => !btn.hasAttribute("type")) ??
    null
  );
}

function clickElement(el: Element): void {
  const view = el.ownerDocument.defaultView;
  if (view && el instanceof view.HTMLElement) {
    el.click();
    return;
  }
  el.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
}

/** Reads any aria-live region so the agent gets the app's own feedback text. */
function liveRegionText(doc: Document): string {
  const region = doc.querySelector("[role='status'], [aria-live='polite'], [aria-live='assertive']");
  if (!region) return "";
  return visibleText(region, 160);
}

/** Yields to the browser so React can flush before we read the DOM back. */
async function settle(doc: Document, ms: number): Promise<void> {
  const view = doc.defaultView;
  if (view && typeof view.requestAnimationFrame === "function") {
    await new Promise<void>((done) => view.requestAnimationFrame(() => done()));
  }
  await new Promise<void>((done) => setTimeout(done, ms));
}

function toPositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fail(message: string): ToolResult {
  return { ok: false, message };
}

/** Re-exported so callers can size UI without importing the scanner directly. */
export type { FieldCandidate };
