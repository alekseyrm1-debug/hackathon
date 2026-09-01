// Shared type vocabulary for the whole ToolFence pipeline:
// scan(Document) -> Candidate[] -> ToolSchema[] -> BoundTool[] -> firewall -> WebMCP.

/** How much damage a tool can do. Ordered from harmless to irreversible. */
export type Capability = "read" | "write" | "destructive";

/** What kind of DOM affordance a candidate was derived from. */
export type CandidateKind =
  | "query" // a search box or filter control: changes what is displayed, not the data
  | "form" // a group of fields plus a submit action
  | "action" // a standalone button / role=button
  | "row-action" // the same action repeated once per row of a collection
  | "collection" // a table or grid whose rows can be read back
  | "summary"; // a definition list (dl/dt/dd) of key figures

/** Which HTML control backs a parameter, so the binder knows how to drive it. */
export type ControlKind = "text" | "number" | "date" | "select" | "checkbox" | "textarea" | "radio";

/** JSON Schema primitive types we emit. Kept narrow on purpose. */
export type JsonPrimitive = "string" | "number" | "integer" | "boolean";

/** One input parameter of a generated tool, plus how to reach its element. */
export interface FieldCandidate {
  /** Parameter name in snake_case, unique inside its candidate. */
  readonly name: string;
  /** Human label taken from the accessible name. */
  readonly label: string;
  readonly control: ControlKind;
  readonly jsonType: JsonPrimitive;
  readonly required: boolean;
  /** CSS selector resolved against the live document at call time. */
  readonly selector: string;
  readonly placeholder?: string;
  /** Allowed values for selects / radio groups. */
  readonly options?: readonly string[];
  readonly min?: number;
  readonly max?: number;
  readonly description: string;
}

/** A column of a detected collection. */
export interface CollectionColumn {
  readonly name: string;
  readonly label: string;
  readonly index: number;
}

/** Everything the scanner learned about one tool-shaped affordance on the page. */
export interface Candidate {
  /** Stable id derived from position + accessible name. */
  readonly id: string;
  readonly kind: CandidateKind;
  /** Accessible name of the affordance ("Delete invoice", "Search invoices"). */
  readonly label: string;
  /** Free-text hint assembled from surrounding landmarks, for the generator. */
  readonly context: string;
  /** Selector for the element the tool acts on (form, button, table...). */
  readonly selector: string;
  readonly fields: readonly FieldCandidate[];
  /** Collections and row-actions carry their table's shape. */
  readonly collection?: CollectionShape;
  /** Raw evidence the firewall classifies against. */
  readonly evidence: CandidateEvidence;
}

/** Shape of a table/grid backing a `collection` or `row-action` candidate. */
export interface CollectionShape {
  /** Selector of the table element. */
  readonly tableSelector: string;
  readonly columns: readonly CollectionColumn[];
  /** Index of the column that identifies a row (a th[scope=row] if present). */
  readonly keyColumnIndex: number;
  readonly keyLabel: string;
  /** Sample of current row keys, used for tool descriptions and previews. */
  readonly sampleKeys: readonly string[];
  readonly rowCount: number;
}

/** Untyped-but-structured facts the classifier reads. Never DOM nodes. */
export interface CandidateEvidence {
  readonly tagName: string;
  readonly role: string | null;
  readonly ariaLabel: string | null;
  readonly text: string;
  readonly inputType: string | null;
  readonly formMethod: string | null;
  readonly isSubmit: boolean;
  /** Text of the nearest landmark/heading, e.g. "Invoices". */
  readonly section: string | null;
  /** true when the control only re-renders the current view. */
  readonly readOnlyHint: boolean;
}

/** JSON Schema (draft 2020-12 subset) for a tool's arguments. */
export interface JsonSchemaProperty {
  readonly type: JsonPrimitive;
  readonly description: string;
  readonly enum?: readonly string[];
  readonly minimum?: number;
  readonly maximum?: number;
}

export interface JsonSchemaObject {
  readonly type: "object";
  readonly properties: Readonly<Record<string, JsonSchemaProperty>>;
  readonly required: readonly string[];
  readonly additionalProperties: false;
}

/** A WebMCP-shaped tool definition produced by the generator. */
export interface ToolSchema {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonSchemaObject;
  /** Provenance: which candidate produced this tool. */
  readonly candidateId: string;
  readonly capability: Capability;
  readonly classification: Classification;
  /** Everything the binder needs to execute, carried along explicitly. */
  readonly plan: ExecutionPlan;
  /** True once an AI enrichment pass rewrote name/description. */
  readonly enriched: boolean;
}

/** Declarative instructions the binder turns into DOM operations. */
export type ExecutionPlan =
  | { readonly type: "fill-and-submit"; readonly formSelector: string; readonly submitSelector: string | null; readonly fields: readonly FieldCandidate[] }
  | { readonly type: "set-value"; readonly fields: readonly FieldCandidate[]; readonly readBackSelector: string | null }
  | { readonly type: "click"; readonly selector: string }
  | { readonly type: "row-action"; readonly collection: CollectionShape; readonly actionLabel: string }
  | { readonly type: "read-collection"; readonly collection: CollectionShape }
  | { readonly type: "read-summary"; readonly selector: string };

/** Why the firewall gave a tool its capability. Shown to the user verbatim. */
export interface ClassificationReason {
  readonly signalId: string;
  readonly source: "text" | "aria-label" | "role" | "input-type" | "form-method" | "structure";
  readonly matched: string;
  readonly capability: Capability;
  readonly weight: number;
  readonly rationale: string;
}

export interface Classification {
  readonly capability: Capability;
  /** 0..1 — how strongly the evidence points at this capability. */
  readonly confidence: number;
  readonly reasons: readonly ClassificationReason[];
}

/** A tool schema plus a callable handler that drives the real page. */
export interface BoundTool {
  readonly schema: ToolSchema;
  /** Executes the tool against the document. Always resolves; never throws. */
  readonly execute: (args: Readonly<Record<string, unknown>>) => Promise<ToolResult>;
  /** Human sentence describing what running it with these args would do. */
  readonly preview: (args: Readonly<Record<string, unknown>>) => string;
}

/** Uniform result envelope handed back to the agent. */
export interface ToolResult {
  readonly ok: boolean;
  readonly message: string;
  readonly data?: unknown;
  /** Set when the firewall stopped the call. */
  readonly blocked?: boolean;
}

/** What the consent modal is asked to approve. */
export interface ConsentRequest {
  readonly id: string;
  readonly toolName: string;
  readonly toolDescription: string;
  readonly capability: Capability;
  readonly args: Readonly<Record<string, unknown>>;
  /** One sentence: what will change on the page. */
  readonly effect: string;
  readonly reasons: readonly ClassificationReason[];
  readonly requestedAt: number;
}

export type ConsentDecision = "allow-once" | "allow-session" | "deny";

/** The UI supplies this; core stays framework-free. */
export type ConsentPrompt = (request: ConsentRequest) => Promise<ConsentDecision>;

export type AuditOutcome =
  | "allowed" // policy permitted it outright
  | "allowed-once" // user approved this single call
  | "allowed-session" // user approved this tool for the session
  | "auto-allowed-session" // covered by an earlier session grant
  | "denied" // user refused
  | "blocked" // policy forbade it without asking
  | "error"; // handler threw

export interface AuditEntry {
  readonly id: string;
  readonly at: number;
  readonly toolName: string;
  readonly capability: Capability;
  readonly args: Readonly<Record<string, unknown>>;
  readonly outcome: AuditOutcome;
  readonly durationMs: number;
  readonly message: string;
  /** Where the call came from: a real agent or the in-page simulator. */
  readonly origin: CallOrigin;
}

export type CallOrigin = "webmcp" | "simulator";

/** Per-capability policy. `prompt` is what makes the firewall a firewall. */
export type PolicyAction = "allow" | "prompt" | "block";

export interface FirewallPolicy {
  readonly read: PolicyAction;
  readonly write: PolicyAction;
  readonly destructive: PolicyAction;
  /**
   * When true, any tool classified with confidence below `strictThreshold`
   * is escalated to `prompt`, even if its capability would be allowed.
   * Fail-safe mode for pages the heuristics do not understand well.
   */
  readonly strictUnknown: boolean;
  readonly strictThreshold: number;
}

/** Result of a scan. Pure data — safe to serialise, log, or send to a model. */
export interface ScanResult {
  readonly scannedAt: number;
  readonly title: string;
  readonly url: string;
  readonly rootSelector: string;
  readonly candidates: readonly Candidate[];
  /** Affordances that were seen but deliberately skipped, with the reason. */
  readonly skipped: readonly SkippedNode[];
}

export interface SkippedNode {
  readonly selector: string;
  readonly reason: string;
}

export interface ScanOptions {
  /** Limit the scan to a subtree. Defaults to the document body. */
  readonly root?: Element | null;
  /** Elements matching these selectors (and their subtrees) are ignored. */
  readonly ignoreSelectors?: readonly string[];
  /** Cap on candidates, so a huge page cannot produce a huge tool list. */
  readonly maxCandidates?: number;
}
