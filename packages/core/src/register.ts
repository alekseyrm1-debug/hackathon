// The only file that touches the WebMCP surface. A spec change should require
// edits here and nowhere else. Registration degrades gracefully: when
// navigator.modelContext is absent the page keeps working and the in-page
// simulator can still drive the same bound tools.

import type { BoundTool, Capability, ToolResult } from "./types";

/** MCP-standard behaviour hints, derived from our capability classes. */
export interface ToolAnnotations {
  readonly title: string;
  readonly readOnlyHint: boolean;
  readonly destructiveHint: boolean;
  readonly idempotentHint: boolean;
  readonly openWorldHint: boolean;
}

export interface WebMcpContent {
  readonly type: "text";
  readonly text: string;
}

export interface WebMcpToolResponse {
  readonly content: readonly WebMcpContent[];
  readonly structuredContent?: unknown;
  readonly isError?: boolean;
}

export interface WebMcpToolDescriptor {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: unknown;
  readonly annotations?: ToolAnnotations;
  execute(args: Readonly<Record<string, unknown>>): Promise<WebMcpToolResponse>;
}

/** The shape we expect on `navigator.modelContext`. Both known spellings. */
interface ModelContextLike {
  registerTool?: (tool: WebMcpToolDescriptor) => unknown;
  provideContext?: (context: { tools: readonly WebMcpToolDescriptor[] }) => unknown;
  unregisterTool?: (name: string) => unknown;
}

export type RegistrationMode = "registerTool" | "provideContext" | "unavailable";

export interface WebMcpStatus {
  readonly available: boolean;
  readonly mode: RegistrationMode;
  /** User-facing explanation, shown in the banner when unavailable. */
  readonly detail: string;
}

export interface Registration {
  readonly mode: RegistrationMode;
  readonly toolCount: number;
  /** Removes the tools again. Safe to call more than once. */
  unregister(): void;
}

const UNAVAILABLE_DETAIL =
  "WebMCP not detected. Enable chrome://flags/#enable-webmcp-testing, or open this page in ChatGPT's browser. " +
  "The tool inspector and the Simulate agent call button work without it.";

function getModelContext(): ModelContextLike | null {
  if (typeof navigator === "undefined") return null;
  const candidate = (navigator as Navigator & { modelContext?: unknown }).modelContext;
  if (typeof candidate !== "object" || candidate === null) return null;
  return candidate as ModelContextLike;
}

/** Feature detection used by the UI banner. Never throws. */
export function detectWebMcp(): WebMcpStatus {
  const context = getModelContext();
  if (!context) return { available: false, mode: "unavailable", detail: UNAVAILABLE_DETAIL };
  if (typeof context.registerTool === "function") {
    return { available: true, mode: "registerTool", detail: "navigator.modelContext.registerTool is available." };
  }
  if (typeof context.provideContext === "function") {
    return {
      available: true,
      mode: "provideContext",
      detail: "navigator.modelContext.provideContext is available.",
    };
  }
  return {
    available: false,
    mode: "unavailable",
    detail: "navigator.modelContext exists but exposes no known registration method.",
  };
}

/** Capability -> MCP annotations, so agents can reason about risk themselves. */
export function annotationsFor(tool: BoundTool): ToolAnnotations {
  const capability: Capability = tool.schema.capability;
  return {
    title: tool.schema.name,
    readOnlyHint: capability === "read",
    destructiveHint: capability === "destructive",
    idempotentHint: capability === "read",
    // Destructive tools here send email / move money, i.e. they reach outside.
    openWorldHint: capability === "destructive",
  };
}

/** Wraps a BoundTool as the descriptor object WebMCP expects. */
export function toDescriptor(tool: BoundTool): WebMcpToolDescriptor {
  return {
    name: tool.schema.name,
    description: tool.schema.description,
    inputSchema: tool.schema.inputSchema,
    annotations: annotationsFor(tool),
    async execute(args) {
      const result = await tool.execute(args ?? {});
      return toResponse(result);
    },
  };
}

/** Uniform MCP response envelope, including the firewall's block messages. */
export function toResponse(result: ToolResult): WebMcpToolResponse {
  const text = result.data === undefined ? result.message : `${result.message}\n\n${safeJson(result.data)}`;
  return {
    content: [{ type: "text", text }],
    structuredContent: result.data,
    isError: !result.ok,
  };
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * Registers every bound tool with the browser. Returns a handle so a rescan can
 * replace the previous generation cleanly instead of duplicating tools.
 */
export function registerTools(tools: readonly BoundTool[]): Registration {
  const status = detectWebMcp();
  const context = getModelContext();

  if (!status.available || !context) {
    return { mode: "unavailable", toolCount: 0, unregister: () => undefined };
  }

  const descriptors = tools.map(toDescriptor);

  if (status.mode === "registerTool" && typeof context.registerTool === "function") {
    const handles: unknown[] = [];
    for (const descriptor of descriptors) {
      try {
        handles.push(context.registerTool(descriptor));
      } catch {
        // One bad tool must not stop the rest from registering.
      }
    }
    let released = false;
    return {
      mode: "registerTool",
      toolCount: descriptors.length,
      unregister: () => {
        if (released) return;
        released = true;
        for (let index = 0; index < handles.length; index += 1) {
          releaseHandle(handles[index], descriptors[index].name, context);
        }
      },
    };
  }

  if (typeof context.provideContext === "function") {
    try {
      context.provideContext({ tools: descriptors });
    } catch {
      return { mode: "unavailable", toolCount: 0, unregister: () => undefined };
    }
    let released = false;
    return {
      mode: "provideContext",
      toolCount: descriptors.length,
      unregister: () => {
        if (released) return;
        released = true;
        try {
          context.provideContext?.({ tools: [] });
        } catch {
          // Nothing further we can do; the page is being torn down anyway.
        }
      },
    };
  }

  return { mode: "unavailable", toolCount: 0, unregister: () => undefined };
}

/** Handles come back in several shapes across drafts of the spec. */
function releaseHandle(handle: unknown, name: string, context: ModelContextLike): void {
  try {
    if (typeof handle === "function") {
      (handle as () => void)();
      return;
    }
    if (typeof handle === "object" && handle !== null) {
      const record = handle as Record<string, unknown>;
      const unregister = record.unregister ?? record.dispose ?? record.remove;
      if (typeof unregister === "function") {
        (unregister as () => void).call(handle);
        return;
      }
    }
    context.unregisterTool?.(name);
  } catch {
    // Unregistering is best-effort; a stale tool is better than a crash.
  }
}
