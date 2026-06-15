import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
    include: [
      "tests/**/*.test.ts",
      "tests/**/*.test.tsx",
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
    ],
  },
});
