// A framework-free ToolFence UI for pages that are not ours.
//
// The React components in `apps/web` only exist inside our own demo. To prove
// the claim on the tin — that ToolFence works on a page that has never heard of
// it — the same pipeline needs an interface it can carry with it. This file is
// that interface: plain DOM, no dependencies, rendered inside a shadow root so
// the host page's CSS and ours cannot reach each other.
//
// The shadow root also solves a subtler problem. `scan()` never crosses a shadow
// boundary, so the overlay's own buttons are invisible to the scanner and can
// never become tools. The panel cannot generate tools for itself.

import type {
  AuditEntry,
  BoundTool,
  Capability,
  ConsentDecision,
  ConsentRequest,
  JsonSchemaProperty,
  ToolResult,
} from "./types";
import type { WebMcpStatus } from "./register";

export interface OverlayHandle {
  /** The element mounted on the host page. Carries `data-toolfence-ignore`. */
  readonly host: HTMLElement;
  /** Hand to `Firewall#setPrompt`. Resolves from the dialog; Escape denies. */
  readonly prompt: (request: ConsentRequest) => Promise<ConsentDecision>;
  /** Called after every rescan with the new generation of tools. */
  setTools(tools: readonly BoundTool[], status: WebMcpStatus, skipped: number): void;
  setLog(log: readonly AuditEntry[]): void;
  destroy(): void;
}

const CAPABILITY_LABEL: Record<Capability, string> = {
  read: "read",
  write: "write",
  destructive: "destructive",
};

const STYLES = `
:host { all: initial; }
* { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
.panel {
  position: fixed; top: 16px; right: 16px; width: 380px; max-width: calc(100vw - 32px);
  max-height: calc(100vh - 32px); display: flex; flex-direction: column;
  background: #0b1020; color: #e6e9f2; border: 1px solid #26304d; border-radius: 12px;
  box-shadow: 0 18px 48px rgba(0,0,0,.45); font-size: 13px; line-height: 1.45; z-index: 2147483000;
}
.panel[data-collapsed="true"] .body { display: none; }
header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #26304d; }
header h1 { margin: 0; font-size: 13px; font-weight: 650; letter-spacing: .01em; flex: 1; }
header h1 small { display: block; font-weight: 400; color: #8d97b5; font-size: 11px; }
.icon-btn {
  background: #171f38; color: #c4cbe0; border: 1px solid #2d3757; border-radius: 6px;
  padding: 3px 8px; font-size: 11px; cursor: pointer;
}
.icon-btn:hover { background: #202a49; }
.body { overflow: auto; padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 10px; }
.status { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #8d97b5; }
.dot { width: 7px; height: 7px; border-radius: 50%; background: #57608a; }
.dot[data-on="true"] { background: #34d399; }
.tool { border: 1px solid #232c48; border-radius: 9px; padding: 8px 10px; background: #0f1730; }
.tool-head { display: flex; align-items: center; gap: 8px; }
.tool-name { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12px; color: #dbe2f7; flex: 1; word-break: break-all; }
.chip { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; padding: 2px 6px; border-radius: 999px; border: 1px solid; }
.chip[data-cap="read"] { color: #6ee7b7; border-color: #16543f; background: #082f22; }
.chip[data-cap="write"] { color: #fcd34d; border-color: #5c4410; background: #2e2205; }
.chip[data-cap="destructive"] { color: #fca5a5; border-color: #6b1f1f; background: #330f0f; }
.tool p { margin: 6px 0 0; color: #9aa4c2; font-size: 12px; }
.args { margin-top: 8px; display: none; flex-direction: column; gap: 6px; }
.tool[data-open="true"] .args { display: flex; }
label { display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: #8d97b5; }
input, select { background: #060a16; color: #e6e9f2; border: 1px solid #2d3757; border-radius: 6px; padding: 5px 7px; font-size: 12px; }
.run { align-self: flex-start; background: #2f5fe0; border: 0; color: #fff; border-radius: 6px; padding: 5px 12px; font-size: 12px; cursor: pointer; }
.run:hover { background: #3a6bf0; }
.result { margin-top: 6px; font-size: 11px; color: #9aa4c2; white-space: pre-wrap; word-break: break-word; }
.result[data-ok="false"] { color: #fca5a5; }
h2 { margin: 4px 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: .07em; color: #6f79a0; }
.log { display: flex; flex-direction: column; gap: 4px; }
.log-row { display: flex; gap: 6px; font-size: 11px; color: #8d97b5; border-left: 2px solid #2d3757; padding-left: 6px; }
.log-row[data-outcome="denied"] { border-color: #b91c1c; color: #fca5a5; }
.log-row[data-outcome="blocked"] { border-color: #b91c1c; color: #fca5a5; }
.log-row code { font-family: ui-monospace, Menlo, monospace; color: #c4cbe0; }
.empty { color: #6f79a0; font-size: 12px; }
/* Narrow viewports — and the framed demo — get a panel that leaves the host
   page readable behind it. */
@media (max-width: 820px) {
  .panel { width: 300px; top: 8px; right: 8px; max-height: calc(100vh - 16px); }
}

.scrim {
  position: fixed; inset: 0; background: rgba(4,7,16,.72); z-index: 2147483001;
  display: flex; align-items: center; justify-content: center; padding: 20px;
}
.dialog {
  width: 440px; max-width: 100%; max-height: 90vh; overflow: auto; background: #0f1730;
  border: 1px solid #2d3757; border-radius: 12px; padding: 18px; color: #e6e9f2;
  box-shadow: 0 24px 64px rgba(0,0,0,.6);
}
.dialog h3 { margin: 0 0 4px; font-size: 15px; }
.dialog .lede { margin: 0 0 12px; color: #9aa4c2; font-size: 12px; }
.block { background: #060a16; border: 1px solid #232c48; border-radius: 8px; padding: 10px; margin-bottom: 10px; }
.block dt { font-size: 10px; text-transform: uppercase; letter-spacing: .07em; color: #6f79a0; margin-bottom: 3px; }
.block dd { margin: 0 0 8px; font-size: 12px; font-family: ui-monospace, Menlo, monospace; color: #dbe2f7; word-break: break-word; }
.block dd:last-child { margin-bottom: 0; }
.why { list-style: none; padding: 0; margin: 0; }
.why li { font-size: 11px; color: #9aa4c2; padding: 3px 0; }
.why b { color: #fca5a5; font-weight: 600; }
.actions { display: flex; gap: 8px; margin-top: 14px; }
.actions button { flex: 1; border-radius: 8px; padding: 8px 10px; font-size: 12px; cursor: pointer; border: 1px solid #2d3757; }
.deny { background: #1b2440; color: #e6e9f2; }
.once { background: #2f5fe0; color: #fff; border-color: #2f5fe0; }
.session { background: #171f38; color: #c4cbe0; }
.actions button:hover { filter: brightness(1.15); }
`;

/** Escapes text for the few places the overlay builds markup from strings. */
function esc(value: string): string {
  return value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

function formatArgs(args: Readonly<Record<string, unknown>>): string {
  const keys = Object.keys(args);
  if (keys.length === 0) return "(no arguments)";
  return keys.map((key) => `${key}: ${JSON.stringify(args[key])}`).join("\n");
}

/**
 * Builds one input per property of a tool's JSON Schema and reads the values
 * back with the schema's own types, so the simulator sends an agent-shaped
 * argument object rather than a bag of strings.
 */
function buildArgInputs(
  doc: Document,
  container: HTMLElement,
  properties: Readonly<Record<string, JsonSchemaProperty>>,
  required: readonly string[],
): () => Record<string, unknown> {
  const readers: Array<[string, () => unknown]> = [];

  for (const [name, property] of Object.entries(properties)) {
    const label = doc.createElement("label");
    label.textContent = `${name}${required.includes(name) ? " *" : ""}`;

    let control: HTMLInputElement | HTMLSelectElement;
    if (property.enum && property.enum.length > 0) {
      const select = doc.createElement("select");
      for (const option of ["", ...property.enum]) {
        const el = doc.createElement("option");
        el.value = option;
        el.textContent = option === "" ? "—" : option;
        select.appendChild(el);
      }
      control = select;
    } else {
      const input = doc.createElement("input");
      input.type = property.type === "number" || property.type === "integer" ? "number" : "text";
      input.placeholder = property.description.slice(0, 60);
      control = input;
    }
    label.appendChild(control);
    container.appendChild(label);

    readers.push([
      name,
      () => {
        const raw = control.value.trim();
        if (raw === "") return undefined;
        if (property.type === "number" || property.type === "integer") return Number(raw);
        if (property.type === "boolean") return raw === "true";
        return raw;
      },
    ]);
  }

  return () => {
    const args: Record<string, unknown> = {};
    for (const [name, read] of readers) {
      const value = read();
      if (value !== undefined) args[name] = value;
    }
    return args;
  };
}

/**
 * Mounts the panel on `doc` and returns the handle the runtime drives it with.
 * Nothing here touches the host page beyond appending one element to `<body>`.
 */
export function mountOverlay(doc: Document): OverlayHandle {
  const host = doc.createElement("div");
  host.id = "toolfence-overlay";
  host.setAttribute("data-toolfence-ignore", "");
  const shadow = host.attachShadow({ mode: "open" });

  const style = doc.createElement("style");
  style.textContent = STYLES;
  shadow.appendChild(style);

  const panel = doc.createElement("div");
  panel.className = "panel";
  panel.dataset.collapsed = "false";
  panel.innerHTML = `
    <header>
      <h1>ToolFence<small class="page"></small></h1>
      <button class="icon-btn toggle" type="button">Hide</button>
    </header>
    <div class="body">
      <div class="status"><span class="dot"></span><span class="status-text">Scanning…</span></div>
      <div class="tools"></div>
      <h2>Audit log</h2>
      <div class="log"><span class="empty">No calls yet.</span></div>
    </div>`;
  shadow.appendChild(panel);
  doc.body.appendChild(host);

  const pageLabel = panel.querySelector(".page") as HTMLElement;
  const statusDot = panel.querySelector(".dot") as HTMLElement;
  const statusText = panel.querySelector(".status-text") as HTMLElement;
  const toolsEl = panel.querySelector(".tools") as HTMLElement;
  const logEl = panel.querySelector(".log") as HTMLElement;
  const toggle = panel.querySelector(".toggle") as HTMLButtonElement;

  pageLabel.textContent = doc.title || doc.location.host;

  toggle.addEventListener("click", () => {
    const collapsed = panel.dataset.collapsed === "true";
    panel.dataset.collapsed = collapsed ? "false" : "true";
    toggle.textContent = collapsed ? "Hide" : "Show";
  });

  function renderTools(tools: readonly BoundTool[], status: WebMcpStatus, skipped: number): void {
    statusDot.dataset.on = String(status.available);
    const generated = `${tools.length} tool${tools.length === 1 ? "" : "s"} generated`;
    const skippedNote = skipped > 0 ? ` · ${skipped} control${skipped === 1 ? "" : "s"} skipped` : "";
    statusText.textContent = status.available
      ? `${generated} · registered via ${status.mode}${skippedNote}`
      : `${generated} · no WebMCP in this browser, simulator only${skippedNote}`;

    toolsEl.textContent = "";
    if (tools.length === 0) {
      const empty = doc.createElement("span");
      empty.className = "empty";
      empty.textContent = "No tool-shaped controls found on this page.";
      toolsEl.appendChild(empty);
      return;
    }

    for (const tool of tools) {
      const card = doc.createElement("div");
      card.className = "tool";
      card.dataset.open = "false";
      card.innerHTML = `
        <div class="tool-head">
          <span class="tool-name">${esc(tool.schema.name)}</span>
          <span class="chip" data-cap="${tool.schema.capability}">${CAPABILITY_LABEL[tool.schema.capability]}</span>
          <button class="icon-btn expand" type="button">Call</button>
        </div>
        <p>${esc(tool.schema.description)}</p>
        <div class="args"></div>
        <div class="result" hidden></div>`;

      const args = card.querySelector(".args") as HTMLElement;
      const result = card.querySelector(".result") as HTMLElement;
      const readArgs = buildArgInputs(
        doc,
        args,
        tool.schema.inputSchema.properties,
        tool.schema.inputSchema.required,
      );

      const run = doc.createElement("button");
      run.className = "run";
      run.type = "button";
      run.textContent = "Call tool";
      args.appendChild(run);

      (card.querySelector(".expand") as HTMLButtonElement).addEventListener("click", () => {
        card.dataset.open = card.dataset.open === "true" ? "false" : "true";
      });

      run.addEventListener("click", () => {
        run.disabled = true;
        void tool
          .execute(readArgs())
          .then((res: ToolResult) => {
            result.hidden = false;
            result.dataset.ok = String(res.ok);
            result.textContent = res.message;
          })
          .finally(() => {
            run.disabled = false;
          });
      });

      toolsEl.appendChild(card);
    }
  }

  function renderLog(log: readonly AuditEntry[]): void {
    logEl.textContent = "";
    if (log.length === 0) {
      const empty = doc.createElement("span");
      empty.className = "empty";
      empty.textContent = "No calls yet.";
      logEl.appendChild(empty);
      return;
    }
    for (const entry of [...log].reverse().slice(0, 12)) {
      const row = doc.createElement("div");
      row.className = "log-row";
      row.dataset.outcome = entry.outcome;
      row.innerHTML = `<code>${esc(entry.toolName)}</code><span>${esc(entry.outcome)}</span>`;
      logEl.appendChild(row);
    }
  }

  // One dialog at a time: the firewall awaits each prompt before running the
  // handler, so a second request cannot arrive while this one is open.
  function prompt(request: ConsentRequest): Promise<ConsentDecision> {
    return new Promise<ConsentDecision>((resolve) => {
      const scrim = doc.createElement("div");
      scrim.className = "scrim";
      const reasons = request.reasons
        .filter((reason) => reason.capability === "destructive")
        .map((reason) => `<li><b>${esc(reason.matched)}</b> in ${esc(reason.source)} — ${esc(reason.rationale)}</li>`)
        .join("");

      scrim.innerHTML = `
        <div class="dialog" role="alertdialog" aria-modal="true">
          <h3>Allow this tool to run?</h3>
          <p class="lede">An agent is asking to run a ${esc(request.capability)} tool on this page.</p>
          <dl class="block">
            <dt>Tool</dt><dd>${esc(request.toolName)}</dd>
            <dt>Arguments</dt><dd>${esc(formatArgs(request.args))}</dd>
            <dt>What changes</dt><dd>${esc(request.effect)}</dd>
          </dl>
          ${reasons ? `<ul class="why">${reasons}</ul>` : ""}
          <div class="actions">
            <button class="deny" type="button">Deny</button>
            <button class="session" type="button">Allow this session</button>
            <button class="once" type="button">Allow once</button>
          </div>
        </div>`;

      const finish = (decision: ConsentDecision) => {
        doc.removeEventListener("keydown", onKey, true);
        scrim.remove();
        resolve(decision);
      };
      // Escape fails closed. So does anything else that removes the dialog.
      const onKey = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          event.preventDefault();
          finish("deny");
        }
      };

      (scrim.querySelector(".deny") as HTMLButtonElement).addEventListener("click", () => finish("deny"));
      (scrim.querySelector(".once") as HTMLButtonElement).addEventListener("click", () => finish("allow-once"));
      (scrim.querySelector(".session") as HTMLButtonElement).addEventListener("click", () =>
        finish("allow-session"),
      );
      doc.addEventListener("keydown", onKey, true);

      shadow.appendChild(scrim);
      (scrim.querySelector(".deny") as HTMLButtonElement).focus();
    });
  }

  return {
    host,
    prompt,
    setTools: renderTools,
    setLog: renderLog,
    destroy: () => host.remove(),
  };
}
