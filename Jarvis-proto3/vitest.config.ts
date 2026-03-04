import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "desktop/tests/**/*.test.ts"],
    exclude: ["**/.tmp/**", "**/dist/**", "**/node_modules/**"],
    testTimeout: 30000,
    hookTimeout: 30000
  }
});
