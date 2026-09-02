import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./__tests__/setup.ts"],
    // Each test *file* gets its own isolated SQLite DB via setup.ts assigning
    // SQLITE_DB_PATH before lib/db.ts is first imported. The HTTP integration
    // test also shells out to `next build`/`next start` itself, so keep files
    // from racing each other over the same spare port / build directory.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": rootDir,
    },
  },
});
