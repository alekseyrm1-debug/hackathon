// Vitest runs the core library against a jsdom document, which is the closest
// thing to a real page that a headless test can use.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["packages/core/test/**/*.test.ts"],
    globals: false,
  },
});
