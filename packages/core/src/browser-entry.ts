// Bundle entry for the injectable build. Everything the library exports stays
// reachable as `window.ToolFence.*`, and loading the script starts ToolFence on
// the current page — a bookmarklet has no second chance to call anything.

import * as core from "./index";
import { current, start, stop, type StartOptions, type ToolFenceInstance } from "./standalone";
import { mountOverlay } from "./overlay";

const api = { ...core, mountOverlay, start, stop, current };

declare global {
  interface Window {
    ToolFence?: typeof api;
  }
}

window.ToolFence = api;

// Auto-start unless the page (or a previous injection) already did.
if (!current()) {
  const options: StartOptions = {};
  const instance: ToolFenceInstance = start(options);
  void instance;
}
