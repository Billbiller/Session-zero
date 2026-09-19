import { describe, it, expect } from "vitest";
import db, { seedBoardContent } from "@/lib/db";
import { BOARD_TOPICS } from "@/lib/types";
import { listThreads, deleteThread } from "@/lib/boards";
import { isSiteAdmin } from "@/lib/access";

interface SeedAccountRow {
  id: string;
  display_name: string;
  is_admin: number;
}

function findSeedAccount(): SeedAccountRow | null {
  const row = db
    .prepare("SELECT id, display_name, is_admin FROM users WHERE email = ?")
    .get("team@sessionzero.internal") as SeedAccountRow | undefined;
  return row ?? null;
}

// Backlog #58: pre-populate each community board (#37) with a couple of
// starter threads, authored under a dedicated site/staff account rather
// than a real user or the (usually-nonexistent) ADMIN_EMAIL account.
// seedBoardContent() is NOT invoked automatically in the test environment
// (see lib/db.ts's NODE_ENV guard) so each test here calls it explicitly
// against its own file-isolated database.
describe("community board seed content (backlog #58)", () => {
  it("creates a dedicated, clearly-labeled system account to author the seed content", () => {
    expect(findSeedAccount()).toBeNull();
    seedBoardContent();
    const account = findSeedAccount();
    expect(account).not.toBeNull();
    expect(account?.display_name).toBe("Session Zero Team");
    // Content attribution, not a moderation grant -- this account isn't
    // meant to be a backdoor around backlog #48's ADMIN_EMAIL-only model.
    expect(isSiteAdmin(account!.id)).toBe(false);
  });

  it("seeds at least two threads on every curated board", () => {
    seedBoardContent();
    for (const slug of BOARD_TOPICS) {
      const result = listThreads(slug);
      expect(result).not.toBeNull();
      expect(result!.items.length).toBeGreaterThanOrEqual(2);
      for (const thread of result!.items) {
        expect(thread.title.length).toBeGreaterThan(0);
      }
    }
  });

  it("authors every seed thread under the system account, not a real/impersonated user", () => {
    seedBoardContent();
    const account = findSeedAccount();
    expect(account).not.toBeNull();
    for (const slug of BOARD_TOPICS) {
      const result = listThreads(slug);
      for (const thread of result!.items) {
        expect(thread.author_id).toBe(account!.id);
      }
    }
  });

  it("is idempotent: calling it repeatedly never duplicates threads or accounts", () => {
    seedBoardContent();
    seedBoardContent();
    seedBoardContent();

    let totalThreads = 0;
    for (const slug of BOARD_TOPICS) {
      totalThreads += listThreads(slug)!.items.length;
    }
    // 2 threads per board, 4 boards -- regardless of how many times seeding
    // runs.
    expect(totalThreads).toBe(8);
  });

  it("does not resurrect a seed thread that's since been deleted", () => {
    seedBoardContent();
    const account = findSeedAccount()!;
    const before = listThreads("new-player-questions")!.items;
    expect(before.length).toBeGreaterThanOrEqual(2);

    // Delete one seed thread the way its own author (or a site admin, per
    // backlog #48) legitimately could.
    deleteThread(before[0].id, account.id);
    seedBoardContent();

    const after = listThreads("new-player-questions")!.items;
    expect(after.length).toBe(before.length - 1);
    expect(after.some((t) => t.id === before[0].id)).toBe(false);
  });
});
