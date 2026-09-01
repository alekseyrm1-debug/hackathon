// Turns scanner candidates into WebMCP ToolSchemas: a stable tool name, an
// agent-readable description, a JSON Schema for the arguments, and an execution
// plan the binder can run. Heuristic only — no network, no API key.

import { toSnakeCase } from "./dom";
import { classify } from "./firewall";
import type {
  Candidate,
  Capability,
  ExecutionPlan,
  FieldCandidate,
  JsonSchemaObject,
  JsonSchemaProperty,
  ScanResult,
  ToolSchema,
} from "./types";

/** Verbs that already read as an action, so the name needs no prefix. */
const VERB_PREFIX =
  /^(list|read|get|search|find|filter|sort|view|show|open|create|add|new|save|update|edit|delete|remove|send|pay|cancel|confirm|approve|submit|export|import|apply|clear|mark)_/;

const MAX_NAME_LENGTH = 60;

export interface GenerateOptions {
  /** Prefix applied to every tool name, e.g. "invoices". Off by default. */
  readonly namespace?: string;
}

/** ScanResult -> ToolSchema[]. Deterministic: same page, same tools, same order. */
export function generate(scanResult: ScanResult, options: GenerateOptions = {}): ToolSchema[] {
  const used = new Set<string>();
  const tools: ToolSchema[] = [];

  for (const candidate of scanResult.candidates) {
    const classification = classify(candidate);
    const name = uniqueName(toolName(candidate, classification.capability, options.namespace), used);
    tools.push({
      name,
      description: describe(candidate, classification.capability),
      inputSchema: buildSchema(candidate),
      candidateId: candidate.id,
      capability: classification.capability,
      classification,
      plan: buildPlan(candidate),
      enriched: false,
    });
  }

  return tools;
}

// ---------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------

function toolName(candidate: Candidate, capability: Capability, namespace?: string): string {
  const base = rawName(candidate, capability);
  const prefixed = namespace ? `${toSnakeCase(namespace)}_${base}` : base;
  return prefixed.slice(0, MAX_NAME_LENGTH).replace(/_+$/, "");
}

function rawName(candidate: Candidate, capability: Capability): string {
  const label = toSnakeCase(candidate.label);
  const subject = candidate.collection ? singular(toSnakeCase(candidate.collection.keyLabel)) : "";

  switch (candidate.kind) {
    case "collection":
      return label.startsWith("list_") ? label : `list_${label}`;
    case "summary":
      return label.startsWith("read_") ? label : `read_${label}`;
    case "query":
      return VERB_PREFIX.test(`${label}_`) ? label : `search_${label}`;
    case "form":
      return VERB_PREFIX.test(`${label}_`) ? label : `submit_${label}`;
    case "row-action": {
      const target = singular(toSnakeCase(collectionSubjectOf(candidate))) || subject;
      if (!target || label.includes(target)) return label;
      return `${label}_${target}`;
    }
    case "action":
    default:
      return VERB_PREFIX.test(`${label}_`) ? label : `${capability === "read" ? "read" : "run"}_${label}`;
  }
}

/** Row actions are named after what the table holds, from its context string. */
function collectionSubjectOf(candidate: Candidate): string {
  const match = /Section "([^"]+)"/.exec(candidate.context);
  if (match) return match[1];
  const inside = /row action inside (.+)$/.exec(candidate.context);
  return inside ? inside[1] : "";
}

function singular(word: string): string {
  if (word.length > 3 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith("ses")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function uniqueName(name: string, used: Set<string>): string {
  const safe = name || "tool";
  if (!used.has(safe)) {
    used.add(safe);
    return safe;
  }
  let index = 2;
  while (used.has(`${safe}_${index}`)) index += 1;
  const result = `${safe}_${index}`;
  used.add(result);
  return result;
}

// ---------------------------------------------------------------------------
// Descriptions
// ---------------------------------------------------------------------------

const CAPABILITY_NOTE: Record<Capability, string> = {
  read: "Read-only: returns information without changing anything.",
  write: "Changes application state. The change is recorded in the audit log.",
  destructive:
    "Irreversible or outbound action. ToolFence will ask the user to confirm before it runs; the call may be denied.",
};

function describe(candidate: Candidate, capability: Capability): string {
  const parts: string[] = [];
  const section = sectionOf(candidate.context);

  switch (candidate.kind) {
    case "collection": {
      const columns = candidate.collection?.columns.map((c) => c.label).join(", ") ?? "";
      parts.push(
        `Read the rows currently displayed in the "${candidate.label}" table${
          columns ? ` with columns: ${columns}` : ""
        }. Reflects any filter that is active, so call a search tool first to narrow the result.`,
      );
      break;
    }
    case "summary":
      parts.push(`Read the "${candidate.label}" figures shown on the page as name/value pairs.`);
      break;
    case "query":
      parts.push(
        `Filter what the page shows using "${candidate.label}". Sets the controls and returns the resulting rows. Omitted parameters are left unchanged.`,
      );
      break;
    case "form":
      parts.push(
        `Fill in and submit the "${candidate.label}" form${
          section ? ` in the ${section} section` : ""
        }, then report the outcome.`,
      );
      break;
    case "row-action": {
      const shape = candidate.collection;
      parts.push(
        `Run the "${candidate.label}" action on one row of the "${
          shape ? shape.keyLabel : "table"
        }" collection, selected by its identifier.`,
      );
      if (shape && shape.sampleKeys.length > 0) {
        parts.push(`Current identifiers include: ${shape.sampleKeys.slice(0, 4).join(", ")}.`);
      }
      break;
    }
    case "action":
    default:
      parts.push(`Activate the "${candidate.label}" control${section ? ` in the ${section} section` : ""}.`);
      break;
  }

  parts.push(CAPABILITY_NOTE[capability]);
  return parts.join(" ");
}

function sectionOf(context: string): string | null {
  const match = /Section "([^"]+)"/.exec(context);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// JSON Schema
// ---------------------------------------------------------------------------

function buildSchema(candidate: Candidate): JsonSchemaObject {
  const properties: Record<string, JsonSchemaProperty> = {};
  const required: string[] = [];

  if (candidate.kind === "collection") {
    properties.limit = {
      type: "integer",
      description: "Maximum number of rows to return. Omit to return every visible row.",
      minimum: 1,
    };
    return frozenSchema(properties, required);
  }

  for (const field of candidate.fields) {
    properties[field.name] = propertyFor(field);
    // Query controls are always optional: an agent may set only one filter.
    if (field.required && candidate.kind !== "query") required.push(field.name);
  }

  return frozenSchema(properties, required);
}

function propertyFor(field: FieldCandidate): JsonSchemaProperty {
  const property: {
    type: JsonSchemaProperty["type"];
    description: string;
    enum?: readonly string[];
    minimum?: number;
    maximum?: number;
  } = {
    type: field.jsonType,
    description: field.description,
  };
  if (field.options && field.options.length > 0) property.enum = field.options;
  if (field.min !== undefined) property.minimum = field.min;
  if (field.max !== undefined) property.maximum = field.max;
  return property;
}

function frozenSchema(
  properties: Record<string, JsonSchemaProperty>,
  required: string[],
): JsonSchemaObject {
  return { type: "object", properties, required, additionalProperties: false };
}

// ---------------------------------------------------------------------------
// Execution plans
// ---------------------------------------------------------------------------

function buildPlan(candidate: Candidate): ExecutionPlan {
  switch (candidate.kind) {
    case "collection":
      return { type: "read-collection", collection: requireCollection(candidate) };
    case "summary":
      return { type: "read-summary", selector: candidate.selector };
    case "query":
      return {
        type: "set-value",
        fields: candidate.fields,
        readBackSelector: candidate.collection?.tableSelector ?? null,
      };
    case "form":
      return {
        type: "fill-and-submit",
        formSelector: candidate.selector,
        // The binder re-locates the submit control inside the form at call time,
        // which survives React re-renders that a captured selector would not.
        submitSelector: null,
        fields: candidate.fields,
      };
    case "row-action":
      return { type: "row-action", collection: requireCollection(candidate), actionLabel: candidate.label };
    case "action":
    default:
      return { type: "click", selector: candidate.selector };
  }
}

function requireCollection(candidate: Candidate) {
  if (!candidate.collection) {
    throw new Error(`Candidate ${candidate.id} is a ${candidate.kind} without a collection shape`);
  }
  return candidate.collection;
}
