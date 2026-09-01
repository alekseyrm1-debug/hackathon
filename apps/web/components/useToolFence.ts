// Wires @toolfence/core into React: one firewall per page, a rescan loop driven
// by a MutationObserver, and a consent prompt that resolves from the modal.
"use client";

import {
  DEFAULT_POLICY,
  Firewall,
  bind,
  detectWebMcp,
  enrich,
  generate,
  registerTools,
  scan,
  type AuditEntry,
  type BoundTool,
  type ConsentDecision,
  type ConsentRequest,
  type FirewallPolicy,
  type Registration,
  type RegistrationMode,
  type ScanResult,
  type WebMcpStatus,
} from "@toolfence/core";
import { useCallback, useEffect, useRef, useState } from "react";

export interface PendingConsent {
  readonly request: ConsentRequest;
  readonly resolve: (decision: ConsentDecision) => void;
}

export interface EnrichmentState {
  readonly enabled: boolean;
  readonly status: "idle" | "running" | "done" | "unavailable";
  readonly reason: string;
}

export interface ToolFenceController {
  readonly tools: readonly BoundTool[];
  readonly scanResult: ScanResult | null;
  readonly log: readonly AuditEntry[];
  readonly policy: FirewallPolicy;
  readonly grants: readonly string[];
  readonly pending: PendingConsent | null;
  readonly webmcp: WebMcpStatus;
  readonly registrationMode: RegistrationMode;
  readonly lastScanAt: number | null;
  readonly ai: EnrichmentState;
  rescan(): void;
  decide(decision: ConsentDecision): void;
  updatePolicy(patch: Partial<FirewallPolicy>): void;
  revokeGrants(): void;
  clearLog(): void;
  setAiEnabled(enabled: boolean): void;
}

const IGNORE_SELECTORS = ["[data-toolfence-ignore]", "[hidden]", "[aria-hidden='true']"];

const DETECTING: WebMcpStatus = {
  available: false,
  mode: "unavailable",
  detail: "Checking for navigator.modelContext…",
};

const AI_OFF = "AI mode is off. Tool names and descriptions come from the page's own labels.";

export function useToolFence(rootSelector: string): ToolFenceController {
  const [firewall] = useState(() => new Firewall({ policy: DEFAULT_POLICY }));
  const [tools, setTools] = useState<readonly BoundTool[]>([]);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [log, setLog] = useState<readonly AuditEntry[]>([]);
  const [policy, setPolicy] = useState<FirewallPolicy>(() => firewall.getPolicy());
  const [grants, setGrants] = useState<readonly string[]>([]);
  const [pending, setPending] = useState<PendingConsent | null>(null);
  const [webmcp, setWebmcp] = useState<WebMcpStatus>(DETECTING);
  const [registrationMode, setRegistrationMode] = useState<RegistrationMode>("unavailable");
  const [lastScanAt, setLastScanAt] = useState<number | null>(null);
  const [ai, setAi] = useState<EnrichmentState>({ enabled: false, status: "idle", reason: AI_OFF });

  const registrationRef = useRef<Registration | null>(null);
  const signatureRef = useRef("");
  const aiEnabledRef = useRef(false);
  const runIdRef = useRef(0);

  // The modal supplies the answer; core never imports React.
  useEffect(() => {
    firewall.setPrompt(
      (request: ConsentRequest) =>
        new Promise<ConsentDecision>((resolve) => {
          setPending({ request, resolve });
        }),
    );
  }, [firewall]);

  useEffect(
    () =>
      firewall.subscribe((entries) => {
        setLog(entries);
        setGrants(firewall.listSessionGrants());
      }),
    [firewall],
  );

  const rescan = useCallback(
    async (force: boolean): Promise<void> => {
      if (typeof document === "undefined") return;
      const runId = ++runIdRef.current;

      const root = document.querySelector(rootSelector);
      const result = scan(document, { root, ignoreSelectors: IGNORE_SELECTORS });
      let schemas = generate(result);

      const signature = JSON.stringify(
        schemas.map((tool) => [tool.name, tool.capability, tool.description, tool.inputSchema]),
      );
      if (!force && signature === signatureRef.current) return;
      signatureRef.current = signature;

      if (aiEnabledRef.current) {
        setAi({ enabled: true, status: "running", reason: "Asking the model for clearer tool names…" });
        const enriched = await enrich(schemas, result);
        if (runId !== runIdRef.current) return; // A newer scan already won.
        schemas = [...enriched.tools];
        setAi({
          enabled: true,
          status: enriched.enriched ? "done" : "unavailable",
          reason: enriched.reason,
        });
        signatureRef.current = JSON.stringify(
          schemas.map((tool) => [tool.name, tool.capability, tool.description, tool.inputSchema]),
        );
      }

      const bound = bind(schemas, { document, firewall, origin: "webmcp" });
      registrationRef.current?.unregister();
      const registration = registerTools(bound);
      registrationRef.current = registration;

      setRegistrationMode(registration.mode);
      setScanResult(result);
      setTools(bound);
      setLastScanAt(Date.now());
    },
    [firewall, rootSelector],
  );

  // Initial scan plus a debounced rescan whenever the app's DOM changes. The
  // demo app never calls into ToolFence — this observer is the only link.
  useEffect(() => {
    setWebmcp(detectWebMcp());
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void rescan(false);
      }, 300);
    };

    void rescan(true);

    const root = document.querySelector(rootSelector);
    const observer = new MutationObserver(schedule);
    if (root) {
      observer.observe(root, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["aria-label", "aria-hidden", "role", "type", "required", "disabled", "hidden"],
      });
    }

    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
      registrationRef.current?.unregister();
      registrationRef.current = null;
    };
  }, [rescan, rootSelector]);

  const decide = useCallback(
    (decision: ConsentDecision) => {
      setPending((current) => {
        current?.resolve(decision);
        return null;
      });
      setGrants(firewall.listSessionGrants());
    },
    [firewall],
  );

  const updatePolicy = useCallback(
    (patch: Partial<FirewallPolicy>) => {
      firewall.setPolicy(patch);
      setPolicy(firewall.getPolicy());
    },
    [firewall],
  );

  const revokeGrants = useCallback(() => {
    firewall.revokeSessionGrants();
    setGrants([]);
  }, [firewall]);

  const clearLog = useCallback(() => {
    firewall.clearLog();
  }, [firewall]);

  const setAiEnabled = useCallback(
    (enabled: boolean) => {
      aiEnabledRef.current = enabled;
      setAi({ enabled, status: enabled ? "running" : "idle", reason: enabled ? "Asking the model…" : AI_OFF });
      void rescan(true);
    },
    [rescan],
  );

  return {
    tools,
    scanResult,
    log,
    policy,
    grants,
    pending,
    webmcp,
    registrationMode,
    lastScanAt,
    ai,
    rescan: () => {
      void rescan(true);
    },
    decide,
    updatePolicy,
    revokeGrants,
    clearLog,
    setAiEnabled,
  };
}
