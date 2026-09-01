// Low-level DOM helpers shared by the scanner and the binder: accessible-name
// computation, stable CSS selectors, visibility checks, and React-safe input writes.

/** Attributes that make an element invisible to assistive tech (and to us). */
const HIDDEN_ATTRS = ["hidden"] as const;

/** Elements whose text should never contribute to an accessible name. */
const NAME_EXCLUDED = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT"]);

/** Collapse whitespace and trim. Every name we produce goes through this. */
export function normalizeText(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

/** Visible text of an element, ignoring script/style subtrees. */
export function visibleText(el: Element, limit = 200): string {
  const parts: string[] = [];
  const walk = (node: Node): void => {
    if (parts.join(" ").length > limit) return;
    if (node.nodeType === 3) {
      parts.push(node.nodeValue ?? "");
      return;
    }
    if (node.nodeType !== 1) return;
    const element = node as Element;
    if (NAME_EXCLUDED.has(element.tagName)) return;
    if (element.getAttribute("aria-hidden") === "true") return;
    for (const child of Array.from(element.childNodes)) walk(child);
  };
  walk(el);
  return normalizeText(parts.join(" ")).slice(0, limit);
}

/**
 * A pragmatic subset of the accessible-name computation (accname spec):
 * aria-label > aria-labelledby > <label> > title > text content > placeholder > name.
 * Deliberately never looks at class names — those are meaningless on Tailwind sites.
 */
export function accessibleName(el: Element): string {
  const ariaLabel = normalizeText(el.getAttribute("aria-label"));
  if (ariaLabel) return ariaLabel;

  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const doc = el.ownerDocument;
    const names = labelledBy
      .split(/\s+/)
      .map((id) => doc.getElementById(id))
      .filter((node): node is HTMLElement => node !== null)
      .map((node) => visibleText(node));
    const joined = normalizeText(names.join(" "));
    if (joined) return joined;
  }

  const labelText = labelFor(el);
  if (labelText) return labelText;

  const title = normalizeText(el.getAttribute("title"));
  if (title) return title;

  const text = visibleText(el, 120);
  if (text) return text;

  const placeholder = normalizeText(el.getAttribute("placeholder"));
  if (placeholder) return placeholder;

  const nameAttr = normalizeText(el.getAttribute("name"));
  if (nameAttr) return humanizeIdentifier(nameAttr);

  return "";
}

/** Text of the <label> associated with a form control, wrapping or `for=`. */
export function labelFor(el: Element): string {
  const doc = el.ownerDocument;
  const id = el.getAttribute("id");
  if (id) {
    // Escape the id so ids containing ":" (React useId) do not break the query.
    const escaped = cssEscape(id);
    const label = doc.querySelector(`label[for="${escaped}"]`);
    if (label) return visibleText(label, 120);
  }
  const wrapping = el.closest("label");
  if (wrapping) {
    const clone = wrapping.cloneNode(true) as Element;
    for (const control of Array.from(clone.querySelectorAll("input, select, textarea, button"))) {
      control.remove();
    }
    return visibleText(clone, 120);
  }
  return "";
}

/** Minimal CSS.escape polyfill so selectors work in jsdom and older engines. */
export function cssEscape(value: string): string {
  const native = (globalThis as { CSS?: { escape?: (v: string) => string } }).CSS?.escape;
  if (typeof native === "function") return native(value);
  return value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
}

/**
 * True when an element is meaningfully hidden. Layout-based checks are wrapped
 * in try/catch because jsdom has no layout engine and tests must still pass.
 */
export function isHidden(el: Element): boolean {
  for (const attr of HIDDEN_ATTRS) {
    if (el.hasAttribute(attr)) return true;
  }
  if (el.closest('[aria-hidden="true"]')) return true;
  if (el.closest("[inert]")) return true;
  const style = el.getAttribute("style") ?? "";
  if (/display\s*:\s*none/i.test(style) || /visibility\s*:\s*hidden/i.test(style)) return true;
  try {
    const view = el.ownerDocument.defaultView;
    if (view && typeof view.getComputedStyle === "function") {
      const computed = view.getComputedStyle(el);
      if (computed.display === "none" || computed.visibility === "hidden") return true;
    }
  } catch {
    // No layout engine available — attribute checks above are enough.
  }
  return false;
}

/**
 * Builds a selector that survives React re-renders: prefers a unique id, then
 * a `tag:nth-of-type()` path. Never uses class names.
 */
export function cssPath(el: Element): string {
  const doc = el.ownerDocument;
  const id = el.getAttribute("id");
  if (id) {
    const candidate = `#${cssEscape(id)}`;
    if (safeQueryCount(doc, candidate) === 1) return candidate;
  }

  const segments: string[] = [];
  let current: Element | null = el;
  while (current && current.nodeType === 1 && current.tagName !== "HTML") {
    const tag = current.tagName.toLowerCase();
    const parent: Element | null = current.parentElement;
    if (!parent) {
      segments.unshift(tag);
      break;
    }
    const sameTag = Array.from(parent.children).filter((c) => c.tagName === current!.tagName);
    const index = sameTag.indexOf(current) + 1;
    segments.unshift(sameTag.length > 1 ? `${tag}:nth-of-type(${index})` : tag);
    if (tag === "body") break;
    current = parent;
  }
  return segments.join(" > ");
}

function safeQueryCount(doc: Document, selector: string): number {
  try {
    return doc.querySelectorAll(selector).length;
  } catch {
    return 0;
  }
}

/** Resolves a selector produced by `cssPath`, returning null instead of throwing. */
export function resolve(doc: Document, selector: string): Element | null {
  try {
    return doc.querySelector(selector);
  } catch {
    return null;
  }
}

/** "invoice_number" / "invoiceNumber" -> "invoice number". */
export function humanizeIdentifier(raw: string): string {
  return normalizeText(
    raw
      .replace(/[-_]+/g, " ")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .toLowerCase(),
  );
}

/** "Send to client" -> "send_to_client". Always a valid MCP tool-name fragment. */
export function toSnakeCase(raw: string): string {
  const slug = normalizeText(raw)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "tool";
}

/**
 * React tracks input state on the DOM node, so `el.value = x` is silently
 * ignored. Writing through the prototype setter and dispatching a bubbling
 * `input` event is the only reliable way to drive a controlled component.
 */
export function setControlValue(el: Element, value: string): boolean {
  const view = el.ownerDocument.defaultView;
  if (!view) return false;

  if (el instanceof view.HTMLInputElement) {
    if (el.type === "checkbox" || el.type === "radio") {
      const shouldCheck = value === "true" || value === "on" || value === el.value;
      const setter = Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, "checked")?.set;
      setter?.call(el, shouldCheck);
      el.dispatchEvent(new view.Event("click", { bubbles: true }));
      el.dispatchEvent(new view.Event("change", { bubbles: true }));
      return true;
    }
    const setter = Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, "value")?.set;
    setter?.call(el, value);
    el.dispatchEvent(new view.Event("input", { bubbles: true }));
    el.dispatchEvent(new view.Event("change", { bubbles: true }));
    return true;
  }

  if (el instanceof view.HTMLTextAreaElement) {
    const setter = Object.getOwnPropertyDescriptor(view.HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(el, value);
    el.dispatchEvent(new view.Event("input", { bubbles: true }));
    el.dispatchEvent(new view.Event("change", { bubbles: true }));
    return true;
  }

  if (el instanceof view.HTMLSelectElement) {
    const setter = Object.getOwnPropertyDescriptor(view.HTMLSelectElement.prototype, "value")?.set;
    setter?.call(el, value);
    el.dispatchEvent(new view.Event("input", { bubbles: true }));
    el.dispatchEvent(new view.Event("change", { bubbles: true }));
    return true;
  }

  return false;
}

/** Reads the current value of a control, whatever its kind. */
export function getControlValue(el: Element): string {
  const view = el.ownerDocument.defaultView;
  if (!view) return "";
  if (el instanceof view.HTMLInputElement) {
    return el.type === "checkbox" || el.type === "radio" ? String(el.checked) : el.value;
  }
  if (el instanceof view.HTMLTextAreaElement) return el.value;
  if (el instanceof view.HTMLSelectElement) return el.value;
  return normalizeText(el.textContent);
}

/** Nearest landmark or heading text, used to give tools page context. */
export function sectionName(el: Element): string | null {
  const landmark = el.closest("section, article, main, form, [role='region'], [role='form']");
  if (!landmark) return null;
  const labelled = normalizeText(landmark.getAttribute("aria-label"));
  if (labelled) return labelled;
  const heading = landmark.querySelector("h1, h2, h3, h4, legend, caption");
  if (heading) return visibleText(heading, 80) || null;
  return null;
}
