// The README makes a claim a judge can check in one command: the third-party
// demo pages contain no reference to ToolFence. This test is that command, so
// the claim cannot quietly stop being true.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PAGES = ["helpdesk.html", "dispatch.html"];

describe("the pages ToolFence did not write", () => {
  for (const page of PAGES) {
    it(`${page} does not mention ToolFence, in markup or in prose`, () => {
      const source = readFileSync(resolve(process.cwd(), "apps/web/public/demo-sites", page), "utf8");

      expect(source).not.toMatch(/toolfence/i);
      expect(source).not.toMatch(/data-tf-|data-tool-/i);
      // No script tag pointing anywhere but the page's own inline behaviour.
      expect(source).not.toMatch(/<script[^>]+src=/i);
    });
  }
});
