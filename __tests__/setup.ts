import { randomUUID } from "node:crypto";
import path from "node:path";

// Runs before this test file's own imports resolve (Vitest isolates each test
// file's module registry), so lib/db.ts — transitively imported by every
// lib/*.ts import in a test file — picks up a brand-new SQLITE_DB_PATH per
// file. Unit test files never share state and don't need manual table
// clearing between tests.
process.env.SQLITE_DB_PATH = path.join(
  process.cwd(),
  "data",
  `test-${randomUUID()}.db`
);
