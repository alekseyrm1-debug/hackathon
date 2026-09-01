// Pure function: Document in, ScanResult out. Reads the accessibility layer of a
// page (roles, aria-*, semantic tags, label associations) and returns tool candidates.
// It never mutates the DOM and keeps no global state.

import {
  accessibleName,
  cssPath,
  humanizeIdentifier,
  isHidden,
  normalizeText,
  sectionName,
  toSnakeCase,
  visibleText,
} from "./dom";
import type {
  Candidate,
  CandidateEvidence,
  CollectionColumn,
  CollectionShape,
  ControlKind,
  FieldCandidate,
  JsonPrimitive,
  ScanOptions,
  ScanResult,
  SkippedNode,
} from "./types";

const DEFAULT_IGNORE = ["[data-toolfence-ignore]", "[hidden]", "[aria-hidden='true']"] as const;
const DEFAULT_MAX_CANDIDATES = 40;

/** Columns whose header reads like a button column are not data. */
const ACTION_COLUMN = /^(actions?|controls?|options?|)$/i;

interface ScanState {
  readonly doc: Document;
  readonly consumed: Set<Element>;
  readonly skipped: SkippedNode[];
  readonly ignore: readonly string[];
  counter: number;
}

/**
 * Extracts every tool-shaped affordance from a document.
 * Detection order matters: collections claim their row buttons before the
 * standalone-button pass can turn each one into its own tool.
 */
export function scan(doc: Document, options: ScanOptions = {}): ScanResult {
  const root = options.root ?? doc.body;
  const state: ScanState = {
    doc,
    consumed: new Set<Element>(),
    skipped: [],
    ignore: options.ignoreSelectors ?? DEFAULT_IGNORE,
    counter: 0,
  };

  const candidates: Candidate[] = [];
  if (!root) {
    return {
      scannedAt: Date.now(),
      title: doc.title,
      url: doc.defaultView?.location?.href ?? "",
      rootSelector: "body",
      candidates: [],
      skipped: [],
    };
  }

  const collections = collectCollections(root, state);
  const primaryCollection = collections.shapes[0] ?? null;

  candidates.push(...collections.candidates);
  candidates.push(...collectQueryGroups(root, state, primaryCollection));
  candidates.push(...collectForms(root, state));
  candidates.push(...collectSummaries(root, state));
  candidates.push(...collectStandaloneActions(root, state));

  const max = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
  const limited = candidates.slice(0, max);
  for (const extra of candidates.slice(max)) {
    state.skipped.push({ selector: extra.selector, reason: `candidate limit of ${max} reached` });
  }

  return {
    scannedAt: Date.now(),
    title: doc.title,
    url: doc.defaultView?.location?.href ?? "",
    rootSelector: root === doc.body ? "body" : cssPath(root),
    candidates: limited,
    skipped: state.skipped,
  };
}

// ---------------------------------------------------------------------------
// Collections (tables) and the row actions inside them
// ---------------------------------------------------------------------------

function collectCollections(
  root: Element,
  state: ScanState,
): { candidates: Candidate[]; shapes: CollectionShape[] } {
  const candidates: Candidate[] = [];
  const shapes: CollectionShape[] = [];
  const tables = queryAll(root, "table, [role='table'], [role='grid']", state);

  for (const table of tables) {
    const shape = describeCollection(table, state);
    if (!shape) {
      state.skipped.push({ selector: cssPath(table), reason: "table has no readable header row" });
      continue;
    }
    shapes.push(shape);

    const label = collectionLabel(table);
    candidates.push({
      id: nextId(state, "collection", label),
      kind: "collection",
      label,
      context: contextFor(table, `${shape.rowCount} rows, columns: ${shape.columns.map((c) => c.label).join(", ")}`),
      selector: shape.tableSelector,
      fields: [],
      collection: shape,
      evidence: evidenceFor(table, { readOnlyHint: true }),
    });

    candidates.push(...collectRowActions(table, shape, state));
  }

  return { candidates, shapes };
}

function describeCollection(table: Element, state: ScanState): CollectionShape | null {
  const headerCells = headerRowCells(table);
  if (headerCells.length === 0) return null;

  const columns: CollectionColumn[] = [];
  headerCells.forEach((cell, index) => {
    const label = visibleText(cell, 60);
    if (ACTION_COLUMN.test(label)) return;
    columns.push({ name: toSnakeCase(label), label, index });
  });
  if (columns.length === 0) return null;

  const rows = bodyRows(table);
  const keyColumnIndex = detectKeyColumn(rows, columns);
  const keyColumn = columns.find((c) => c.index === keyColumnIndex) ?? columns[0];
  const sampleKeys = rows
    .slice(0, 6)
    .map((row) => rowKey(row, keyColumnIndex))
    .filter((key) => key.length > 0);

  void state;
  return {
    tableSelector: cssPath(table),
    columns,
    keyColumnIndex,
    keyLabel: keyColumn.label,
    sampleKeys,
    rowCount: rows.length,
  };
}

/** The identifying column is the one holding `th[scope=row]`, else the first column. */
function detectKeyColumn(rows: readonly Element[], columns: readonly CollectionColumn[]): number {
  for (const row of rows) {
    const cells = Array.from(row.children);
    const index = cells.findIndex(
      (cell) => cell.tagName === "TH" || cell.getAttribute("role") === "rowheader",
    );
    if (index >= 0) return index;
  }
  return columns[0]?.index ?? 0;
}

// A row is a <tr> or anything carrying role="row", because plenty of real
// dashboards build their grid out of <div>s. Likewise a data cell is a <td>, a
// role="cell" (ARIA table) or a role="gridcell" (ARIA grid).
const ROW_SELECTOR = "tr, [role='row']";

function isDataCell(cell: Element): boolean {
  const role = cell.getAttribute("role");
  return cell.tagName === "TD" || role === "cell" || role === "gridcell";
}

export function headerRowCells(table: Element): Element[] {
  const thead = table.querySelector("thead, [role='rowgroup'][data-header]");
  const headerRow = thead?.querySelector(ROW_SELECTOR) ?? table.querySelector(ROW_SELECTOR);
  if (!headerRow) return [];
  const cells = Array.from(headerRow.children).filter(
    (cell) => cell.tagName === "TH" || cell.getAttribute("role") === "columnheader",
  );
  return cells.length > 0 ? cells : [];
}

export function bodyRows(table: Element): Element[] {
  const tbody = table.querySelector("tbody");
  const scope = tbody ?? table;
  return Array.from(scope.querySelectorAll(ROW_SELECTOR)).filter((row) => {
    if (row.closest("thead")) return false;
    return Array.from(row.children).some(isDataCell);
  });
}

export function rowKey(row: Element, keyColumnIndex: number): string {
  const cells = Array.from(row.children);
  const cell = cells[keyColumnIndex] ?? cells[0];
  return cell ? visibleText(cell, 80) : "";
}

/**
 * Buttons repeated across rows become ONE tool with a row parameter, not one
 * tool per row. This is what keeps a 200-row table from generating 600 tools.
 */
function collectRowActions(table: Element, shape: CollectionShape, state: ScanState): Candidate[] {
  const rows = bodyRows(table);
  const groups = new Map<string, { label: string; buttons: Element[] }>();

  for (const row of rows) {
    const key = rowKey(row, shape.keyColumnIndex);
    const buttons = Array.from(row.querySelectorAll("button, [role='button'], a[href]")).filter(
      (btn) => !isIgnored(btn, state) && !isHidden(btn),
    );
    for (const button of buttons) {
      const raw = accessibleName(button);
      const action = stripRowIdentity(raw, key, row);
      if (!action) continue;
      const groupKey = action.toLowerCase();
      const existing = groups.get(groupKey);
      if (existing) existing.buttons.push(button);
      else groups.set(groupKey, { label: action, buttons: [button] });
    }
  }

  const minOccurrences = rows.length >= 2 ? 2 : 1;
  const candidates: Candidate[] = [];

  for (const group of groups.values()) {
    if (group.buttons.length < minOccurrences) continue;
    for (const button of group.buttons) state.consumed.add(button);

    const field: FieldCandidate = {
      name: toSnakeCase(shape.keyLabel) || "row",
      label: shape.keyLabel,
      control: "text",
      jsonType: "string",
      required: true,
      selector: shape.tableSelector,
      description: `Identifier of the row to act on, taken from the "${shape.keyLabel}" column${
        shape.sampleKeys.length > 0 ? ` (for example ${shape.sampleKeys.slice(0, 3).join(", ")})` : ""
      }.`,
      options: shape.sampleKeys.length > 0 && shape.sampleKeys.length <= 12 ? shape.sampleKeys : undefined,
    };

    candidates.push({
      id: nextId(state, "row-action", group.label),
      kind: "row-action",
      label: group.label,
      context: contextFor(table, `row action inside ${collectionLabel(table)}`),
      selector: shape.tableSelector,
      fields: [field],
      collection: shape,
      evidence: {
        ...evidenceFor(group.buttons[0], { readOnlyHint: false }),
        text: group.label,
      },
    });
  }

  return candidates;
}

/**
 * "Delete invoice INV-1042" -> "Delete invoice". Row-specific text is removed so
 * buttons in different rows collapse into one group.
 */
export function stripRowIdentity(rawName: string, key: string, row: Element): string {
  let name = normalizeText(rawName);
  if (!name) return "";
  const tokens = new Set<string>();
  if (key) tokens.add(key);
  for (const cell of Array.from(row.children)) {
    // The cell holding the buttons describes the actions, not the row. On a
    // grid with one action per row its text *is* the button label, and
    // stripping it would erase the very name we are trying to keep.
    if (cell.querySelector("button, [role='button'], a[href]")) continue;
    const text = visibleText(cell, 60);
    if (text && text.length > 2 && text.split(" ").length <= 4) tokens.add(text);
  }
  for (const token of tokens) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    name = name.replace(new RegExp(escaped, "gi"), " ");
  }
  return normalizeText(name);
}

function collectionLabel(table: Element): string {
  const aria = normalizeText(table.getAttribute("aria-label"));
  if (aria) return aria;
  const caption = table.querySelector("caption");
  if (caption) return visibleText(caption, 80);
  return sectionName(table) ?? "table";
}

// ---------------------------------------------------------------------------
// Query controls (search + filters), grouped into a single read tool
// ---------------------------------------------------------------------------

function collectQueryGroups(
  root: Element,
  state: ScanState,
  primaryCollection: CollectionShape | null,
): Candidate[] {
  const controls = queryAll(
    root,
    "input[type='search'], [role='searchbox'], form[role='search'] input, form[role='search'] select, [role='search'] input, [role='search'] select, select",
    state,
  ).filter((el) => !state.consumed.has(el));

  const groups = new Map<Element, Element[]>();
  for (const control of controls) {
    if (isHidden(control)) continue;
    // A control inside a data-entry form belongs to that form, not to a filter bar.
    const owningForm = control.closest("form");
    if (owningForm && owningForm.getAttribute("role") !== "search" && !owningForm.closest("[role='search']")) {
      continue;
    }
    const container =
      control.closest("[role='search'], form[role='search'], [role='toolbar'], [role='group']") ?? control;
    const bucket = groups.get(container);
    if (bucket) bucket.push(control);
    else groups.set(container, [control]);
  }

  const candidates: Candidate[] = [];
  for (const [container, members] of groups) {
    const fields = members
      .map((el) => describeField(el))
      .filter((field): field is FieldCandidate => field !== null);
    if (fields.length === 0) continue;
    for (const el of members) state.consumed.add(el);

    const label = queryGroupLabel(container, members);
    candidates.push({
      id: nextId(state, "query", label),
      kind: "query",
      label,
      context: contextFor(container, "narrows the visible rows; does not change stored data"),
      selector: cssPath(container),
      fields,
      collection: primaryCollection ?? undefined,
      evidence: evidenceFor(container, { readOnlyHint: true }),
    });
  }
  return candidates;
}

function queryGroupLabel(container: Element, members: readonly Element[]): string {
  const aria = normalizeText(container.getAttribute("aria-label"));
  if (aria) return aria;
  if (members.length === 1) return accessibleName(members[0]) || "Search";
  return sectionName(container) ?? "Filter results";
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

function collectForms(root: Element, state: ScanState): Candidate[] {
  const forms = queryAll(root, "form, [role='form']", state).filter(
    (form) => form.getAttribute("role") !== "search",
  );
  const candidates: Candidate[] = [];

  for (const form of forms) {
    const controls = Array.from(form.querySelectorAll("input, select, textarea")).filter(
      (el) => !isIgnored(el, state) && !state.consumed.has(el) && !isHidden(el) && !isNonDataControl(el),
    );
    const fields = controls
      .map((el) => describeField(el))
      .filter((field): field is FieldCandidate => field !== null);

    const submit = findSubmit(form, state);
    if (fields.length === 0 && !submit) {
      state.skipped.push({ selector: cssPath(form), reason: "form has no fields and no submit control" });
      continue;
    }

    for (const el of controls) state.consumed.add(el);
    if (submit) state.consumed.add(submit);

    const label = formLabel(form, submit);
    candidates.push({
      id: nextId(state, "form", label),
      kind: "form",
      label,
      context: contextFor(form, `form with ${fields.length} field(s)`),
      selector: cssPath(form),
      fields,
      evidence: {
        ...evidenceFor(submit ?? form, { readOnlyHint: false }),
        formMethod: (form.getAttribute("method") ?? "get").toLowerCase(),
        isSubmit: submit !== null,
        text: submit ? accessibleName(submit) : label,
      },
    });
  }

  return candidates;
}

function findSubmit(form: Element, state: ScanState): Element | null {
  const explicit = form.querySelector("button[type='submit'], input[type='submit']");
  if (explicit && !isIgnored(explicit, state)) return explicit;
  const implicit = Array.from(form.querySelectorAll("button")).find(
    (btn) => !btn.hasAttribute("type") && !isIgnored(btn, state),
  );
  return implicit ?? null;
}

function formLabel(form: Element, submit: Element | null): string {
  const aria = normalizeText(form.getAttribute("aria-label"));
  if (aria) return aria;
  const legend = form.querySelector("legend, h1, h2, h3");
  if (legend) return visibleText(legend, 80);
  if (submit) return accessibleName(submit);
  return "Submit form";
}

/** Buttons, hidden inputs and reset controls carry no data. */
function isNonDataControl(el: Element): boolean {
  const type = (el.getAttribute("type") ?? "").toLowerCase();
  return ["hidden", "submit", "button", "reset", "image", "file"].includes(type);
}

// ---------------------------------------------------------------------------
// Summaries (definition lists of key figures)
// ---------------------------------------------------------------------------

function collectSummaries(root: Element, state: ScanState): Candidate[] {
  const lists = queryAll(root, "dl", state);
  return lists
    .filter((dl) => dl.querySelector("dt") !== null)
    .map((dl) => {
      const label =
        normalizeText(dl.getAttribute("aria-label")) || sectionName(dl) || "Summary figures";
      return {
        id: nextId(state, "summary", label),
        kind: "summary" as const,
        label,
        context: contextFor(dl, "key/value figures shown on the page"),
        selector: cssPath(dl),
        fields: [],
        evidence: evidenceFor(dl, { readOnlyHint: true }),
      };
    });
}

// ---------------------------------------------------------------------------
// Standalone buttons that nothing else claimed
// ---------------------------------------------------------------------------

function collectStandaloneActions(root: Element, state: ScanState): Candidate[] {
  const buttons = queryAll(root, "button, [role='button']", state).filter(
    (btn) =>
      !state.consumed.has(btn) &&
      !isHidden(btn) &&
      !btn.hasAttribute("disabled") &&
      btn.getAttribute("aria-disabled") !== "true",
  );

  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  for (const button of buttons) {
    const label = accessibleName(button);
    if (!label) {
      state.skipped.push({ selector: cssPath(button), reason: "button has no accessible name" });
      continue;
    }
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    state.consumed.add(button);

    candidates.push({
      id: nextId(state, "action", label),
      kind: "action",
      label,
      context: contextFor(button, "standalone button"),
      selector: cssPath(button),
      fields: [],
      evidence: evidenceFor(button, { readOnlyHint: false }),
    });
  }
  return candidates;
}

// ---------------------------------------------------------------------------
// Field description
// ---------------------------------------------------------------------------

function describeField(el: Element): FieldCandidate | null {
  const label = accessibleName(el);
  if (!label) return null;

  const tag = el.tagName.toLowerCase();
  const type = (el.getAttribute("type") ?? "text").toLowerCase();
  const control = controlKind(tag, type);
  const jsonType = jsonTypeFor(control, type);

  const options =
    tag === "select"
      ? Array.from(el.querySelectorAll("option"))
          .map((opt) => opt.getAttribute("value") ?? visibleText(opt, 40))
          .filter((value) => value.length > 0)
      : undefined;

  const min = numericAttr(el, "min");
  const max = numericAttr(el, "max");
  const placeholder = normalizeText(el.getAttribute("placeholder")) || undefined;

  return {
    name: toSnakeCase(label) || toSnakeCase(el.getAttribute("name") ?? "value"),
    label,
    control,
    jsonType,
    required: el.hasAttribute("required") || el.getAttribute("aria-required") === "true",
    selector: cssPath(el),
    placeholder,
    options: options && options.length > 0 ? options : undefined,
    min,
    max,
    description: fieldDescription(label, control, type, placeholder, options),
  };
}

function fieldDescription(
  label: string,
  control: ControlKind,
  type: string,
  placeholder: string | undefined,
  options: readonly string[] | undefined,
): string {
  const parts = [`${label}.`];
  if (control === "select" && options && options.length > 0) {
    parts.push(`One of: ${options.join(", ")}.`);
  }
  if (control === "date" || type === "date") parts.push("ISO date, YYYY-MM-DD.");
  if (control === "number") parts.push("Numeric value.");
  if (placeholder) parts.push(`Example: ${placeholder}.`);
  return parts.join(" ");
}

function controlKind(tag: string, type: string): ControlKind {
  if (tag === "textarea") return "textarea";
  if (tag === "select") return "select";
  if (type === "number" || type === "range") return "number";
  if (type === "date" || type === "datetime-local" || type === "month") return "date";
  if (type === "checkbox") return "checkbox";
  if (type === "radio") return "radio";
  return "text";
}

function jsonTypeFor(control: ControlKind, type: string): JsonPrimitive {
  if (control === "number") return type === "range" ? "number" : "number";
  if (control === "checkbox") return "boolean";
  return "string";
}

function numericAttr(el: Element, name: string): number | undefined {
  const raw = el.getAttribute(name);
  if (raw === null) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function queryAll(root: Element, selector: string, state: ScanState): Element[] {
  const found = Array.from(root.querySelectorAll(selector));
  const self = root.matches(selector) ? [root] : [];
  return [...self, ...found].filter((el) => {
    if (isIgnored(el, state)) {
      state.skipped.push({ selector: cssPath(el), reason: "inside an ignored subtree" });
      return false;
    }
    return true;
  });
}

function isIgnored(el: Element, state: ScanState): boolean {
  for (const selector of state.ignore) {
    try {
      if (el.closest(selector)) return true;
    } catch {
      // Malformed ignore selector — treat as non-matching rather than crashing.
    }
  }
  return false;
}

function evidenceFor(el: Element, overrides: Partial<CandidateEvidence>): CandidateEvidence {
  const tag = el.tagName.toLowerCase();
  const form = el.closest("form");
  return {
    tagName: tag,
    role: el.getAttribute("role"),
    ariaLabel: el.getAttribute("aria-label"),
    text: accessibleName(el),
    inputType: el.getAttribute("type"),
    formMethod: form ? (form.getAttribute("method") ?? "get").toLowerCase() : null,
    isSubmit: (el.getAttribute("type") ?? "").toLowerCase() === "submit",
    section: sectionName(el),
    readOnlyHint: false,
    ...overrides,
  };
}

function contextFor(el: Element, detail: string): string {
  const section = sectionName(el);
  return section ? `Section "${section}". ${detail}` : detail;
}

function nextId(state: ScanState, kind: string, label: string): string {
  state.counter += 1;
  return `${kind}-${toSnakeCase(label) || humanizeIdentifier(kind)}-${state.counter}`;
}
