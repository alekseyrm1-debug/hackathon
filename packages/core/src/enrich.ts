// Optional AI enrichment. Sends the structured scan (never the raw page, never
// user data) to a server route that asks a model for better tool names and
// descriptions. If the route is missing, unconfigured, or slow, the heuristic
// tools are returned unchanged — the demo never depends on an API key.
//
// Security property: enrichment may rewrite names and prose only. Capability,
// classification and execution plan are copied from the heuristic tool, so a
// model cannot talk the firewall into letting a destructive tool through.

import type { ScanResult, ToolSchema } from "./types";

export interface EnrichOptions {
  /** Server route that proxies the model. Defaults to the app's own route. */
  readonly endpoint?: string;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

export interface EnrichResult {
  readonly tools: readonly ToolSchema[];
  readonly enriched: boolean;
  /** Human explanation, shown in the inspector next to the AI toggle. */
  readonly reason: string;
}

interface EnrichRequestTool {
  readonly name: string;
  readonly capability: string;
  readonly description: string;
  readonly parameters: readonly { name: string; description: string }[];
}

interface EnrichResponseTool {
  readonly name?: unknown;
  readonly originalName?: unknown;
  readonly description?: unknown;
  readonly parameters?: unknown;
}

const DEFAULT_ENDPOINT = "/api/enrich";
const DEFAULT_TIMEOUT_MS = 20_000;
const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

/** Best-effort enrichment. Always resolves; never rejects. */
export async function enrich(
  tools: readonly ToolSchema[],
  scanResult: ScanResult,
  options: EnrichOptions = {},
): Promise<EnrichResult> {
  if (tools.length === 0) {
    return { tools, enriched: false, reason: "Nothing to enrich — no tools were generated." };
  }
  if (typeof fetch !== "function") {
    return { tools, enriched: false, reason: "This environment has no fetch(); using heuristic names." };
  }

  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        page: { title: scanResult.title, url: scanResult.url },
        tools: tools.map(toRequestTool),
      }),
    });

    if (response.status === 501) {
      return {
        tools,
        enriched: false,
        reason: "AI mode is not configured on this deployment (no API key). Heuristic names are in use.",
      };
    }
    if (!response.ok) {
      return { tools, enriched: false, reason: `Enrichment route returned ${response.status}. Keeping heuristic names.` };
    }

    const payload: unknown = await response.json();
    const rewrites = parseResponse(payload);
    if (rewrites.size === 0) {
      return { tools, enriched: false, reason: "The model returned no usable rewrites. Keeping heuristic names." };
    }

    const used = new Set<string>();
    const merged = tools.map((tool) => applyRewrite(tool, rewrites.get(tool.name), used));
    const changed = merged.filter((tool) => tool.enriched).length;
    return {
      tools: merged,
      enriched: changed > 0,
      reason: `AI mode rewrote ${changed} of ${tools.length} tool description(s). Capabilities were not changed.`,
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      tools,
      enriched: false,
      reason: aborted
        ? "Enrichment timed out. Heuristic names are in use."
        : `Enrichment unavailable (${error instanceof Error ? error.message : String(error)}). Heuristic names are in use.`,
    };
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

function toRequestTool(tool: ToolSchema): EnrichRequestTool {
  return {
    name: tool.name,
    capability: tool.capability,
    description: tool.description,
    parameters: Object.entries(tool.inputSchema.properties).map(([name, property]) => ({
      name,
      description: property.description,
    })),
  };
}

function parseResponse(payload: unknown): Map<string, EnrichResponseTool> {
  const map = new Map<string, EnrichResponseTool>();
  if (typeof payload !== "object" || payload === null) return map;
  const tools = (payload as { tools?: unknown }).tools;
  if (!Array.isArray(tools)) return map;

  for (const entry of tools) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as EnrichResponseTool;
    const key = typeof record.originalName === "string" ? record.originalName : undefined;
    if (key) map.set(key, record);
  }
  return map;
}

/** Copies only prose across. Everything security-relevant stays as generated. */
function applyRewrite(
  tool: ToolSchema,
  rewrite: EnrichResponseTool | undefined,
  used: Set<string>,
): ToolSchema {
  if (!rewrite) {
    used.add(tool.name);
    return tool;
  }

  const description =
    typeof rewrite.description === "string" && rewrite.description.trim().length > 10
      ? rewrite.description.trim().slice(0, 600)
      : tool.description;

  let name = tool.name;
  if (typeof rewrite.name === "string") {
    const proposed = rewrite.name.trim().toLowerCase();
    if (TOOL_NAME_PATTERN.test(proposed) && !used.has(proposed)) name = proposed;
  }
  used.add(name);

  const properties = { ...tool.inputSchema.properties };
  if (Array.isArray(rewrite.parameters)) {
    for (const parameter of rewrite.parameters) {
      if (typeof parameter !== "object" || parameter === null) continue;
      const record = parameter as { name?: unknown; description?: unknown };
      if (typeof record.name !== "string" || typeof record.description !== "string") continue;
      const existing = properties[record.name];
      if (!existing) continue;
      properties[record.name] = { ...existing, description: record.description.trim().slice(0, 300) };
    }
  }

  const enriched = name !== tool.name || description !== tool.description;
  return {
    ...tool,
    name,
    description,
    inputSchema: { ...tool.inputSchema, properties },
    enriched,
  };
}
