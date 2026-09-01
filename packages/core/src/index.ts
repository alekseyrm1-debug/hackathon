// Public surface of @toolfence/core, plus the one-call pipeline that ties the
// stages together: scan -> generate -> bind (through the firewall) -> register.

export * from "./types";
export { scan, bodyRows, headerRowCells, rowKey, stripRowIdentity } from "./scanner";
export { generate } from "./generator";
export type { GenerateOptions } from "./generator";
export { Firewall, classify, RISK_SIGNALS, DEFAULT_POLICY, DENIED_MESSAGE } from "./firewall";
export type { FirewallOptions, GuardContext, RiskSignal } from "./firewall";
export { bind, bindOne, describeEffect, extractRows } from "./binder";
export type { BindOptions } from "./binder";
export { enrich } from "./enrich";
export type { EnrichOptions, EnrichResult } from "./enrich";
export {
  registerTools,
  detectWebMcp,
  toDescriptor,
  toResponse,
  annotationsFor,
} from "./register";
export type {
  Registration,
  RegistrationMode,
  ToolAnnotations,
  WebMcpStatus,
  WebMcpToolDescriptor,
  WebMcpToolResponse,
} from "./register";
export {
  accessibleName,
  cssPath,
  getControlValue,
  normalizeText,
  setControlValue,
  toSnakeCase,
  visibleText,
} from "./dom";

import { bind } from "./binder";
import type { Firewall } from "./firewall";
import { generate, type GenerateOptions } from "./generator";
import { registerTools, type Registration } from "./register";
import { scan } from "./scanner";
import type { BoundTool, CallOrigin, ScanOptions, ScanResult, ToolSchema } from "./types";

export interface PipelineOptions {
  readonly document: Document;
  readonly firewall: Firewall;
  readonly scan?: ScanOptions;
  readonly generate?: GenerateOptions;
  readonly origin?: CallOrigin;
  /** Register with navigator.modelContext. Defaults to true. */
  readonly register?: boolean;
}

export interface PipelineResult {
  readonly scanResult: ScanResult;
  readonly schemas: readonly ToolSchema[];
  readonly tools: readonly BoundTool[];
  readonly registration: Registration;
}

/**
 * One call from a live page to registered WebMCP tools. The caller keeps the
 * returned registration so a rescan can unregister the previous generation.
 */
export function runPipeline(options: PipelineOptions): PipelineResult {
  const scanResult = scan(options.document, options.scan);
  const schemas = generate(scanResult, options.generate);
  const tools = bind(schemas, {
    document: options.document,
    firewall: options.firewall,
    origin: options.origin,
  });
  const registration =
    options.register === false
      ? { mode: "unavailable" as const, toolCount: 0, unregister: () => undefined }
      : registerTools(tools);
  return { scanResult, schemas, tools, registration };
}
