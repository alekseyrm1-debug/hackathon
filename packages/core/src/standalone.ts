// The injectable build of ToolFence: everything needed to walk onto a page that
// has no idea we exist, generate its tools, and put the dangerous ones behind a
// consent dialog.
//
// `apps/web` reaches the same pipeline through React. This entry point reaches
// it through a bookmarklet or a `<script>` tag, which is what makes the claim
// checkable on someone else's site rather than only on our demo.

import { bind } from "./binder";
import { Firewall, DEFAULT_POLICY } from "./firewall";
import { generate } from "./generator";
import { mountOverlay, type OverlayHandle } from "./overlay";
import { detectWebMcp, registerTools, type Registration } from "./register";
import { scan } from "./scanner";
import type { BoundTool, FirewallPolicy, ScanResult } from "./types";

export interface StartOptions {
  /** Limit the scan to a subtree. Defaults to `document.body`. */
  readonly root?: Element | null;
  /** Mount the built-in panel. Set false to drive the pipeline headlessly. */
  readonly overlay?: boolean;
  readonly policy?: Partial<FirewallPolicy>;
  /** Debounce for MutationObserver-driven rescans, in ms. */
  readonly rescanDelayMs?: number;
}

export interface ToolFenceInstance {
  readonly firewall: Firewall;
  readonly tools: readonly BoundTool[];
  readonly scanResult: ScanResult | null;
  rescan(): void;
  stop(): void;
}

/** Never scan our own UI, hidden nodes, or anything opted out by the page. */
const IGNORE_SELECTORS = [
  "#toolfence-overlay",
  "[data-toolfence-ignore]",
  "[hidden]",
  "[aria-hidden='true']",
];

let active: ToolFenceInstance | null = null;

/**
 * Starts ToolFence on the current document. Calling it twice is a no-op that
 * returns the running instance — a bookmarklet gets clicked twice.
 */
export function start(options: StartOptions = {}): ToolFenceInstance {
  if (active) return active;

  const doc = document;
  const firewall = new Firewall({ policy: { ...DEFAULT_POLICY, ...options.policy } });
  const overlay: OverlayHandle | null = options.overlay === false ? null : mountOverlay(doc);
  if (overlay) firewall.setPrompt(overlay.prompt);

  let tools: readonly BoundTool[] = [];
  let scanResult: ScanResult | null = null;
  let registration: Registration | null = null;
  let signature = "";
  let timer: ReturnType<typeof setTimeout> | undefined;

  const unsubscribe = firewall.subscribe((log) => overlay?.setLog(log));

  function rescan(force: boolean): void {
    const root = options.root ?? doc.body;
    const result = scan(doc, { root, ignoreSelectors: IGNORE_SELECTORS });
    const schemas = generate(result);

    const next = JSON.stringify(
      schemas.map((tool) => [tool.name, tool.capability, tool.description, tool.inputSchema]),
    );
    if (!force && next === signature) return;
    signature = next;

    const bound = bind(schemas, { document: doc, firewall, origin: "webmcp" });
    // Unregister the previous generation first: a rescan replaces the tool
    // list, it does not add a second copy of it.
    registration?.unregister();
    registration = registerTools(bound);

    scanResult = result;
    tools = bound;
    overlay?.setTools(bound, detectWebMcp(), result.skipped.length);
  }

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => rescan(false), options.rescanDelayMs ?? 300);
  };

  // The host page never calls us. This observer is the entire integration:
  // when its DOM changes, the tool list regenerates on its own.
  const observer = new MutationObserver(schedule);
  observer.observe(options.root ?? doc.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["aria-label", "aria-hidden", "role", "type", "required", "disabled", "hidden"],
  });

  rescan(true);

  const instance: ToolFenceInstance = {
    firewall,
    get tools() {
      return tools;
    },
    get scanResult() {
      return scanResult;
    },
    rescan: () => rescan(true),
    stop: () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
      unsubscribe();
      registration?.unregister();
      overlay?.destroy();
      active = null;
    },
  };

  active = instance;
  return instance;
}

/** Stops the running instance, if any. */
export function stop(): void {
  active?.stop();
}

/** The instance currently attached to this page, or null. */
export function current(): ToolFenceInstance | null {
  return active;
}
