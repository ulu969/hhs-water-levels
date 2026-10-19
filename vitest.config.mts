import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // src/lib/db.ts throws at import without this. Nothing in the tests
    // connects; neon() only stores the URL until a query runs.
    env: { DATABASE_URL: "postgresql://test:test@localhost/test" },
  },
});
