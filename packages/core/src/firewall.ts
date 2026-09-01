// The capability firewall: classifies every generated tool as read/write/destructive
// from documented signals, then gates execution behind policy + user consent and
// records every decision in an audit log.

import type {
  AuditEntry,
  AuditOutcome,
  CallOrigin,
  Candidate,
  Capability,
  Classification,
  ClassificationReason,
  ConsentDecision,
  ConsentPrompt,
  ConsentRequest,
  FirewallPolicy,
  PolicyAction,
  ToolResult,
  ToolSchema,
} from "./types";

/** Where a signal was observed. Surfaced in the UI so decisions are explainable. */
type ReasonSource = ClassificationReason["source"];

export interface RiskSignal {
  readonly id: string;
  readonly capability: Capability;
  readonly weight: number;
  readonly pattern: RegExp;
  readonly sources: readonly ReasonSource[];
  readonly rationale: string;
  /**
   * Fail-safe escalation: when a signal with this flag matches, the tool is
   * classified destructive no matter what the read/write scores say. Being
   * wrong in this direction costs one extra click; being wrong the other way
   * costs the user's data.
   */
  readonly forces?: true;
}

const TEXTUAL: readonly ReasonSource[] = ["text", "aria-label"];

/**
 * The single source of truth for risk classification. Adding a verb here is the
 * only change needed to teach the firewall about a new dangerous action.
 */
export const RISK_SIGNALS: readonly RiskSignal[] = [
  // --- destructive: irreversible, costs money, or leaves the user's control ---
  { id: "delete", capability: "destructive", weight: 5, pattern: /\b(delete|destroy|erase|wipe|purge)\b/i, sources: TEXTUAL, rationale: "Deletes data irreversibly.", forces: true },
  { id: "remove", capability: "destructive", weight: 4, pattern: /\b(remove|discard|drop|trash)\b/i, sources: TEXTUAL, rationale: "Removes an item from a collection.", forces: true },
  { id: "pay", capability: "destructive", weight: 5, pattern: /\b(pay|pays|paying|payment|charge|checkout|purchase|buy|refund)\b/i, sources: TEXTUAL, rationale: "Moves money.", forces: true },
  { id: "transfer", capability: "destructive", weight: 5, pattern: /\b(transfer|withdraw|wire|payout)\b/i, sources: TEXTUAL, rationale: "Transfers funds or ownership.", forces: true },
  { id: "send", capability: "destructive", weight: 4, pattern: /\b(send|email|e-mail|dispatch|notify|message|share|post|publish|tweet)\b/i, sources: TEXTUAL, rationale: "Sends something to a third party — cannot be recalled.", forces: true },
  { id: "order", capability: "destructive", weight: 4, pattern: /\b(place order|submit order|confirm order|book|reserve)\b/i, sources: TEXTUAL, rationale: "Commits to an order or booking.", forces: true },
  { id: "cancel", capability: "destructive", weight: 4, pattern: /\b(cancel|revoke|deactivate|disable|unsubscribe|close account|terminate)\b/i, sources: TEXTUAL, rationale: "Cancels or revokes something that may not be restorable.", forces: true },
  { id: "approve", capability: "destructive", weight: 4, pattern: /\b(approve|accept|sign|authorize|authorise|grant access)\b/i, sources: TEXTUAL, rationale: "Grants an approval on the user's behalf.", forces: true },
  { id: "confirm", capability: "destructive", weight: 3, pattern: /\b(confirm|finalize|finalise|commit)\b/i, sources: TEXTUAL, rationale: "Finalises a pending action.", forces: true },
  { id: "http-delete", capability: "destructive", weight: 5, pattern: /^(delete)$/i, sources: ["form-method"], rationale: "Form declares method=DELETE.", forces: true },

  // --- write: changes stored state, but recoverable ---
  { id: "create", capability: "write", weight: 3, pattern: /\b(create|add|new|register|generate|draft|issue)\b/i, sources: TEXTUAL, rationale: "Creates a new record." },
  { id: "update", capability: "write", weight: 3, pattern: /\b(save|update|edit|modify|change|rename|apply|set)\b/i, sources: TEXTUAL, rationale: "Modifies existing state." },
  { id: "upload", capability: "write", weight: 3, pattern: /\b(upload|import|attach|sync)\b/i, sources: TEXTUAL, rationale: "Writes new content into the app." },
  { id: "submit", capability: "write", weight: 2, pattern: /\b(submit|continue|next|done)\b/i, sources: TEXTUAL, rationale: "Submits a form." },
  { id: "http-write", capability: "write", weight: 2, pattern: /^(post|put|patch)$/i, sources: ["form-method"], rationale: "Form declares a state-changing HTTP method." },
  { id: "submit-type", capability: "write", weight: 2, pattern: /^submit$/i, sources: ["input-type"], rationale: 'Control is type="submit".' },

  // --- read: display-only ---
  { id: "search", capability: "read", weight: 3, pattern: /\b(search|find|lookup|query|filter|sort|browse)\b/i, sources: TEXTUAL, rationale: "Narrows or reorders what is displayed." },
  { id: "view", capability: "read", weight: 3, pattern: /\b(view|show|open|details|preview|inspect|list|get|read|export|download)\b/i, sources: TEXTUAL, rationale: "Displays existing information." },
  { id: "figures", capability: "read", weight: 2, pattern: /\b(summary|overview|totals?|balance|statistics|stats|metrics)\b/i, sources: TEXTUAL, rationale: "Names a block of displayed figures." },
  { id: "searchbox-role", capability: "read", weight: 3, pattern: /^(search|searchbox)$/i, sources: ["role"], rationale: "ARIA role marks this as a search control." },
  { id: "search-input", capability: "read", weight: 3, pattern: /^search$/i, sources: ["input-type"], rationale: 'Input is type="search".' },
];

/** Default posture: reads are free, writes are logged, destructive needs a human. */
export const DEFAULT_POLICY: FirewallPolicy = {
  read: "allow",
  write: "allow",
  destructive: "prompt",
  strictUnknown: false,
  strictThreshold: 0.5,
};

const CAPABILITY_RANK: Record<Capability, number> = { read: 0, write: 1, destructive: 2 };

/**
 * Classifies a scanner candidate. Pure and synchronous — the same candidate
 * always yields the same capability, which is what makes the firewall testable.
 */
export function classify(candidate: Candidate): Classification {
  const observations: Array<{ source: ReasonSource; value: string }> = [
    { source: "text", value: `${candidate.label} ${candidate.evidence.text}` },
    { source: "aria-label", value: candidate.evidence.ariaLabel ?? "" },
    { source: "role", value: candidate.evidence.role ?? "" },
    { source: "input-type", value: candidate.evidence.inputType ?? "" },
    { source: "form-method", value: candidate.evidence.formMethod ?? "" },
  ];

  const reasons: ClassificationReason[] = [];
  const scores: Record<Capability, number> = { read: 0, write: 0, destructive: 0 };
  let forced = false;

  for (const signal of RISK_SIGNALS) {
    for (const observation of observations) {
      if (!signal.sources.includes(observation.source)) continue;
      const value = observation.value.trim();
      if (!value) continue;
      const match = signal.pattern.exec(value);
      if (!match) continue;
      // Only the first source that fires for a given signal is recorded.
      if (reasons.some((r) => r.signalId === signal.id)) break;
      reasons.push({
        signalId: signal.id,
        source: observation.source,
        matched: match[0],
        capability: signal.capability,
        weight: signal.weight,
        rationale: signal.rationale,
      });
      scores[signal.capability] += signal.weight;
      if (signal.forces) forced = true;
      break;
    }
  }

  // Structural signals the lexicon cannot see.
  if (candidate.evidence.readOnlyHint) {
    reasons.push({
      signalId: "read-only-structure",
      source: "structure",
      matched: candidate.kind,
      capability: "read",
      weight: 3,
      rationale: "Element only displays or filters data; it has no submit path.",
    });
    scores.read += 3;
  }
  if (candidate.kind === "form" || candidate.kind === "action" || candidate.kind === "row-action") {
    reasons.push({
      signalId: "mutating-structure",
      source: "structure",
      matched: candidate.kind,
      capability: "write",
      weight: 1,
      rationale: "Interactive control that triggers an application action.",
    });
    scores.write += 1;
  }

  const lexicalMatched = reasons.some((r) => r.source !== "structure");
  const capability = forced ? "destructive" : pickCapability(scores);
  const total = scores.read + scores.write + scores.destructive;
  const share = total > 0 ? scores[capability] / total : 0;
  const confidence = forced
    ? Math.max(0.8, share)
    : lexicalMatched
      ? Math.min(0.95, 0.4 + share * 0.6)
      : 0.35;

  return { capability, confidence: round2(confidence), reasons };
}

function pickCapability(scores: Record<Capability, number>): Capability {
  let best: Capability = "write";
  let bestScore = -1;
  for (const capability of ["read", "write", "destructive"] as const) {
    const score = scores[capability];
    if (score > bestScore || (score === bestScore && CAPABILITY_RANK[capability] > CAPABILITY_RANK[best])) {
      best = capability;
      bestScore = score;
    }
  }
  return bestScore <= 0 ? "write" : best;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface FirewallOptions {
  /** Supplied by the UI. If omitted, every prompt resolves to "deny". */
  readonly prompt?: ConsentPrompt;
  readonly policy?: Partial<FirewallPolicy>;
  /** Cap on retained audit entries. Oldest are dropped first. */
  readonly maxLogEntries?: number;
}

export interface GuardContext {
  /** One human sentence describing what will change on the page. */
  readonly effect: string;
  readonly origin: CallOrigin;
}

export const DENIED_MESSAGE = "Blocked by user. Tool requires explicit consent.";

type AuditListener = (log: readonly AuditEntry[]) => void;

/**
 * Wraps every tool call. Nothing in ToolFence executes a handler without going
 * through `guard` — that is the single choke point the whole design relies on.
 */
export class Firewall {
  private policy: FirewallPolicy;
  private prompt: ConsentPrompt;
  private readonly sessionGrants = new Set<string>();
  private readonly listeners = new Set<AuditListener>();
  private readonly maxLogEntries: number;
  private log: AuditEntry[] = [];
  private sequence = 0;

  constructor(options: FirewallOptions = {}) {
    this.policy = { ...DEFAULT_POLICY, ...options.policy };
    this.prompt = options.prompt ?? (async () => "deny");
    this.maxLogEntries = options.maxLogEntries ?? 200;
  }

  getPolicy(): FirewallPolicy {
    return this.policy;
  }

  setPolicy(patch: Partial<FirewallPolicy>): void {
    this.policy = { ...this.policy, ...patch };
  }

  /** Lets the UI attach its consent modal after construction. */
  setPrompt(prompt: ConsentPrompt): void {
    this.prompt = prompt;
  }

  get auditLog(): readonly AuditEntry[] {
    return this.log;
  }

  hasSessionGrant(toolName: string): boolean {
    return this.sessionGrants.has(toolName);
  }

  listSessionGrants(): readonly string[] {
    return Array.from(this.sessionGrants);
  }

  revokeSessionGrants(): void {
    this.sessionGrants.clear();
  }

  clearLog(): void {
    this.log = [];
    this.emit();
  }

  subscribe(listener: AuditListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Effective policy action for a tool, including strict-mode escalation. */
  resolveAction(schema: ToolSchema): PolicyAction {
    const base = this.policy[schema.capability];
    if (this.sessionGrants.has(schema.name)) return "allow";
    if (
      base === "allow" &&
      this.policy.strictUnknown &&
      schema.classification.confidence < this.policy.strictThreshold
    ) {
      return "prompt";
    }
    return base;
  }

  /**
   * The choke point. Resolves policy, asks for consent when required, runs the
   * handler, and always writes an audit entry — including for failures.
   */
  async guard(
    schema: ToolSchema,
    args: Readonly<Record<string, unknown>>,
    run: () => Promise<ToolResult>,
    context: GuardContext,
  ): Promise<ToolResult> {
    const startedAt = Date.now();
    const hadGrant = this.sessionGrants.has(schema.name);
    const action = this.resolveAction(schema);

    if (action === "block") {
      return this.record(schema, args, "blocked", startedAt, context.origin, {
        ok: false,
        blocked: true,
        message: `Blocked by policy: ${schema.capability} tools are disabled on this page.`,
      });
    }

    let outcome: AuditOutcome = hadGrant ? "auto-allowed-session" : "allowed";

    if (action === "prompt") {
      const request: ConsentRequest = {
        id: `consent-${++this.sequence}-${startedAt}`,
        toolName: schema.name,
        toolDescription: schema.description,
        capability: schema.capability,
        args,
        effect: context.effect,
        reasons: schema.classification.reasons,
        requestedAt: startedAt,
      };

      let decision: ConsentDecision;
      try {
        decision = await this.prompt(request);
      } catch {
        // A UI that disappears mid-prompt must fail closed, never open.
        decision = "deny";
      }

      if (decision === "deny") {
        return this.record(schema, args, "denied", startedAt, context.origin, {
          ok: false,
          blocked: true,
          message: DENIED_MESSAGE,
        });
      }
      if (decision === "allow-session") {
        this.sessionGrants.add(schema.name);
        outcome = "allowed-session";
      } else {
        outcome = "allowed-once";
      }
    }

    try {
      const result = await run();
      return this.record(schema, args, result.ok ? outcome : "error", startedAt, context.origin, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.record(schema, args, "error", startedAt, context.origin, {
        ok: false,
        message: `Tool failed: ${message}`,
      });
    }
  }

  private record(
    schema: ToolSchema,
    args: Readonly<Record<string, unknown>>,
    outcome: AuditOutcome,
    startedAt: number,
    origin: CallOrigin,
    result: ToolResult,
  ): ToolResult {
    const entry: AuditEntry = {
      id: `audit-${++this.sequence}-${startedAt}`,
      at: startedAt,
      toolName: schema.name,
      capability: schema.capability,
      args,
      outcome,
      durationMs: Math.max(0, Date.now() - startedAt),
      message: result.message,
      origin,
    };
    this.log = [...this.log, entry].slice(-this.maxLogEntries);
    this.emit();
    return result;
  }

  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.log);
      } catch {
        // A broken subscriber must not break tool execution.
      }
    }
  }
}
