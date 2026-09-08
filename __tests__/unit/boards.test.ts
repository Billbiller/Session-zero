import { describe, it, expect } from "vitest";
import { signUp } from "@/lib/auth";
import { isSiteAdmin } from "@/lib/access";
import { BOARD_TOPICS } from "@/lib/types";
import { listNotifications } from "@/lib/notifications";
import { setPreference } from "@/lib/notificationPreferences";
import {
  BoardError,
  isBoardSlug,
  listBoards,
  getBoard,
  listThreads,
  getThread,
  getThreadWithAuthor,
  createThread,
  deleteThread,
  listReplies,
  getReply,
  createReply,
  deleteReply,
  reportThread,
  reportReply,
  hasReportedThread,
  hasReportedReply,
  listReportedContent,
} from "@/lib/boards";

function makeUser(prefix: string) {
  return signUp(prefix, `${prefix}@example.com`, "testpassword123");
}

describe("community discussion boards (backlog #37)", () => {
  it("recognizes every curated board slug and rejects an unknown one", () => {
    for (const slug of BOARD_TOPICS) {
      expect(isBoardSlug(slug)).toBe(true);
    }
    expect(isBoardSlug("not-a-real-board")).toBe(false);
  });

  it("lists every curated board in declared order with a non-empty name/description", () => {
    const boards = listBoards();
    expect(boards.map((b) => b.slug)).toEqual([...BOARD_TOPICS]);
    for (const board of boards) {
      expect(board.name.length).toBeGreaterThan(0);
      expect(board.description.length).toBeGreaterThan(0);
    }
  });

  it("getBoard returns null for an unrecognized slug and the right data for a known one", () => {
    expect(getBoard("not-a-real-board")).toBeNull();
    const board = getBoard("new-player-questions");
    expect(board?.slug).toBe("new-player-questions");
    expect(board?.name).toBe("New Player Questions");
  });

  it("creates a thread, trimming title and body", () => {
    const user = makeUser("bd1");
    const thread = createThread("new-player-questions", user.id, {
      title: "  How do I roll for initiative?  ",
      body: "  Total newbie here, please help.  ",
    });
    expect(thread.title).toBe("How do I roll for initiative?");
    expect(thread.body).toBe("Total newbie here, please help.");
    expect(thread.board_slug).toBe("new-player-questions");
    expect(thread.author_id).toBe(user.id);
  });

  it("rejects a thread on an unknown board", () => {
    const user = makeUser("bd2");
    expect(() =>
      createThread("not-a-real-board", user.id, { title: "T", body: "B" })
    ).toThrow(BoardError);
  });

  it("rejects a blank or over-length title, and a blank or over-length body", () => {
    const user = makeUser("bd3");
    expect(() =>
      createThread("homebrew-showcase", user.id, { title: "   ", body: "B" })
    ).toThrow(BoardError);
    expect(() =>
      createThread("homebrew-showcase", user.id, { title: "x".repeat(201), body: "B" })
    ).toThrow(BoardError);
    expect(() =>
      createThread("homebrew-showcase", user.id, { title: "T", body: "   " })
    ).toThrow(BoardError);
    expect(() =>
      createThread("homebrew-showcase", user.id, { title: "T", body: "x".repeat(10001) })
    ).toThrow(BoardError);
  });

  it("lists a board's threads newest-first, paginated, isolated from other boards", () => {
    const user = makeUser("bd4");
    createThread("lfg-advice", user.id, { title: "First", body: "B" });
    createThread("lfg-advice", user.id, { title: "Second", body: "B" });
    createThread("local-meetups", user.id, { title: "Unrelated", body: "B" });

    const result = listThreads("lfg-advice");
    expect(result?.total).toBe(2);
    expect(result?.items.map((t) => t.title)).toEqual(["Second", "First"]);
    expect(result?.items.every((t) => t.board_slug === "lfg-advice")).toBe(true);
  });

  it("returns null for listThreads on an unrecognized slug, distinct from a real board with zero threads", () => {
    expect(listThreads("not-a-real-board")).toBeNull();
    // A real, recognized board always returns { items, total } -- never
    // null -- regardless of thread count. This file's tests share one
    // SQLite db per Vitest's per-file module isolation (not per-test), so
    // this deliberately doesn't assert an exact zero count for any given
    // board (another test elsewhere in this file may have already
    // posted to it); the point being tested is the null-vs-real-object
    // distinction itself.
    const result = listThreads("local-meetups");
    expect(result).not.toBeNull();
    expect(Array.isArray(result?.items)).toBe(true);
    expect(typeof result?.total).toBe("number");
  });

  it("paginates threads correctly (pageSize limits items, total reflects every match)", () => {
    const user = makeUser("bd5");
    for (let i = 0; i < 3; i++) {
      createThread("homebrew-showcase", user.id, { title: `Thread ${i}`, body: "B" });
    }
    const page1 = listThreads("homebrew-showcase", { page: 1, pageSize: 2 });
    expect(page1?.items).toHaveLength(2);
    expect(page1?.total).toBe(3);
    const page2 = listThreads("homebrew-showcase", { page: 2, pageSize: 2 });
    expect(page2?.items).toHaveLength(1);
  });

  it("enriches a thread listing with the author's display name and reply count", () => {
    const author = makeUser("bd6");
    const replier = makeUser("bd6r");
    const thread = createThread("new-player-questions", author.id, {
      title: "Enrichment check",
      body: "B",
    });
    createReply(thread.id, replier.id, "First reply");
    createReply(thread.id, replier.id, "Second reply");

    const result = listThreads("new-player-questions");
    const found = result?.items.find((t) => t.id === thread.id);
    expect(found?.authorName).toBe("bd6");
    expect(found?.replyCount).toBe(2);
  });

  it("getThread and getThreadWithAuthor return null for an unknown id", () => {
    expect(getThread("nonexistent")).toBeNull();
    expect(getThreadWithAuthor("nonexistent")).toBeNull();
  });

  it("getThreadWithAuthor returns the right author name and reply count", () => {
    const author = makeUser("bd7");
    const thread = createThread("local-meetups", author.id, { title: "T", body: "B" });
    const enriched = getThreadWithAuthor(thread.id);
    expect(enriched?.authorName).toBe("bd7");
    expect(enriched?.replyCount).toBe(0);
  });

  it("lets a thread's own author delete it, and cascades to its replies", () => {
    const author = makeUser("bd8");
    const replier = makeUser("bd8r");
    const thread = createThread("lfg-advice", author.id, { title: "T", body: "B" });
    const reply = createReply(thread.id, replier.id, "a reply");

    deleteThread(thread.id, author.id);

    expect(getThread(thread.id)).toBeNull();
    expect(getReply(reply.id)).toBeNull();
  });

  it("rejects deleting a thread from anyone but its author, and for an unknown thread id", () => {
    const author = makeUser("bd9");
    const stranger = makeUser("bd9s");
    const thread = createThread("lfg-advice", author.id, { title: "T", body: "B" });

    expect(() => deleteThread(thread.id, stranger.id)).toThrow(BoardError);
    expect(getThread(thread.id)).not.toBeNull();
    expect(() => deleteThread("nonexistent", author.id)).toThrow(BoardError);
  });

  it("deleting one thread leaves another board's or another thread's data untouched", () => {
    const author = makeUser("bd10");
    const threadA = createThread("lfg-advice", author.id, { title: "A", body: "B" });
    const threadB = createThread("lfg-advice", author.id, { title: "B", body: "B" });

    deleteThread(threadA.id, author.id);

    expect(getThread(threadA.id)).toBeNull();
    expect(getThread(threadB.id)).not.toBeNull();
  });

  it("posts a reply, trimming its body, and lists replies oldest-first", () => {
    const author = makeUser("bd11");
    const replier1 = makeUser("bd11r1");
    const replier2 = makeUser("bd11r2");
    const thread = createThread("new-player-questions", author.id, { title: "T", body: "B" });

    createReply(thread.id, replier1.id, "  first  ");
    createReply(thread.id, replier2.id, "second");

    const replies = listReplies(thread.id);
    expect(replies.map((r) => r.body)).toEqual(["first", "second"]);
    expect(replies[0].authorName).toBe("bd11r1");
    expect(replies[1].authorName).toBe("bd11r2");
  });

  it("rejects a reply on an unknown thread, and a blank or over-length reply body", () => {
    const author = makeUser("bd12");
    const thread = createThread("new-player-questions", author.id, { title: "T", body: "B" });

    expect(() => createReply("nonexistent", author.id, "hi")).toThrow(BoardError);
    expect(() => createReply(thread.id, author.id, "   ")).toThrow(BoardError);
    expect(() => createReply(thread.id, author.id, "x".repeat(5001))).toThrow(BoardError);
  });

  it("lets the thread's own author reply too (no relationship gate)", () => {
    const author = makeUser("bd13");
    const thread = createThread("new-player-questions", author.id, { title: "T", body: "B" });
    const reply = createReply(thread.id, author.id, "replying to my own thread");
    expect(reply.author_id).toBe(author.id);
  });

  it("lets a reply's own author delete it without affecting the thread or other replies", () => {
    const author = makeUser("bd14");
    const replier = makeUser("bd14r");
    const thread = createThread("homebrew-showcase", author.id, { title: "T", body: "B" });
    const reply1 = createReply(thread.id, replier.id, "one");
    const reply2 = createReply(thread.id, replier.id, "two");

    deleteReply(reply1.id, replier.id);

    expect(getReply(reply1.id)).toBeNull();
    expect(getReply(reply2.id)).not.toBeNull();
    expect(getThread(thread.id)).not.toBeNull();
  });

  it("rejects deleting a reply from anyone but its author, and for an unknown reply id", () => {
    const author = makeUser("bd15");
    const replier = makeUser("bd15r");
    const stranger = makeUser("bd15s");
    const thread = createThread("homebrew-showcase", author.id, { title: "T", body: "B" });
    const reply = createReply(thread.id, replier.id, "a reply");

    expect(() => deleteReply(reply.id, stranger.id)).toThrow(BoardError);
    // Even the thread's own author can't delete someone else's reply --
    // self-moderation means the reply's own author only, no backstop.
    expect(() => deleteReply(reply.id, author.id)).toThrow(BoardError);
    expect(getReply(reply.id)).not.toBeNull();
    expect(() => deleteReply("nonexistent", replier.id)).toThrow(BoardError);
  });

  it("isolates replies per thread", () => {
    const author = makeUser("bd16");
    const threadA = createThread("lfg-advice", author.id, { title: "A", body: "B" });
    const threadB = createThread("lfg-advice", author.id, { title: "B", body: "B" });
    createReply(threadA.id, author.id, "only on A");

    expect(listReplies(threadB.id)).toEqual([]);
    expect(listReplies(threadA.id)).toHaveLength(1);
  });

  describe("board_reply notifications (backlog #43)", () => {
    it("notifies the thread's author when someone else replies", () => {
      const author = makeUser("bd17");
      const replier = makeUser("bd17r");
      const thread = createThread("new-player-questions", author.id, {
        title: "Notify me please",
        body: "B",
      });

      createReply(thread.id, replier.id, "here's a reply");

      const notifs = listNotifications(author.id).items.filter(
        (n) => n.type === "board_reply"
      );
      expect(notifs).toHaveLength(1);
      expect(notifs[0].related_thread_id).toBe(thread.id);
      expect(notifs[0].message).toContain("bd17r");
      expect(notifs[0].message).toContain("Notify me please");
    });

    it("does not notify on a self-reply to your own thread", () => {
      const author = makeUser("bd18");
      const thread = createThread("new-player-questions", author.id, { title: "T", body: "B" });

      createReply(thread.id, author.id, "replying to myself");

      const notifs = listNotifications(author.id).items.filter(
        (n) => n.type === "board_reply"
      );
      expect(notifs).toHaveLength(0);
    });

    it("notifies again on each subsequent reply from someone else (not batched)", () => {
      const author = makeUser("bd19");
      const replier = makeUser("bd19r");
      const thread = createThread("lfg-advice", author.id, { title: "T", body: "B" });

      createReply(thread.id, replier.id, "first");
      createReply(thread.id, replier.id, "second");

      const notifs = listNotifications(author.id).items.filter(
        (n) => n.type === "board_reply"
      );
      expect(notifs).toHaveLength(2);
    });

    it("respects a muted board_reply preference", () => {
      const author = makeUser("bd20");
      const replier = makeUser("bd20r");
      setPreference(author.id, "board_reply", false);
      const thread = createThread("lfg-advice", author.id, { title: "T", body: "B" });

      createReply(thread.id, replier.id, "a reply");

      const notifs = listNotifications(author.id).items.filter(
        (n) => n.type === "board_reply"
      );
      expect(notifs).toHaveLength(0);
    });

    it("nulls out related_thread_id (rather than breaking) when the thread is later deleted", () => {
      const author = makeUser("bd21");
      const replier = makeUser("bd21r");
      const thread = createThread("homebrew-showcase", author.id, {
        title: "Doomed thread",
        body: "B",
      });
      createReply(thread.id, replier.id, "a reply");

      deleteThread(thread.id, author.id);

      const notifs = listNotifications(author.id).items.filter(
        (n) => n.type === "board_reply"
      );
      expect(notifs).toHaveLength(1);
      expect(notifs[0].related_thread_id).toBeNull();
      // The message itself still names the thread, even once it's gone.
      expect(notifs[0].message).toContain("Doomed thread");
    });
  });

  describe("site-admin moderation (backlog #48)", () => {
    // Sets ADMIN_EMAIL just long enough to sign up one admin account, then
    // restores whatever (if anything) it was before -- this file's tests
    // share one process, so a stray ADMIN_EMAIL left set would silently
    // turn every later makeUser() call in this describe block into an
    // admin too.
    function makeAdminUser(prefix: string) {
      const original = process.env.ADMIN_EMAIL;
      process.env.ADMIN_EMAIL = `${prefix}@example.com`;
      try {
        return signUp(prefix, `${prefix}@example.com`, "testpassword123");
      } finally {
        if (original === undefined) delete process.env.ADMIN_EMAIL;
        else process.env.ADMIN_EMAIL = original;
      }
    }

    it("lets a site admin delete another user's thread, cascading to its replies", () => {
      const author = makeUser("bd22");
      const replier = makeUser("bd22r");
      const admin = makeAdminUser("bd22admin");
      expect(isSiteAdmin(admin.id)).toBe(true);
      const thread = createThread("lfg-advice", author.id, { title: "T", body: "B" });
      const reply = createReply(thread.id, replier.id, "a reply");

      deleteThread(thread.id, admin.id);

      expect(getThread(thread.id)).toBeNull();
      expect(getReply(reply.id)).toBeNull();
    });

    it("lets a site admin delete another user's reply without deleting the thread", () => {
      const author = makeUser("bd23");
      const replier = makeUser("bd23r");
      const admin = makeAdminUser("bd23admin");
      const thread = createThread("lfg-advice", author.id, { title: "T", body: "B" });
      const reply = createReply(thread.id, replier.id, "a reply");

      deleteReply(reply.id, admin.id);

      expect(getReply(reply.id)).toBeNull();
      expect(getThread(thread.id)).not.toBeNull();
    });

    it("reports a thread, rejecting an unknown thread and a duplicate report from the same reporter", () => {
      const author = makeUser("bd24");
      const reporter = makeUser("bd24r");
      const thread = createThread("lfg-advice", author.id, { title: "T", body: "B" });

      expect(hasReportedThread(thread.id, reporter.id)).toBe(false);
      const report = reportThread(thread.id, reporter.id, "spam");
      expect(report.thread_id).toBe(thread.id);
      expect(report.reply_id).toBeNull();
      expect(report.reason).toBe("spam");
      expect(hasReportedThread(thread.id, reporter.id)).toBe(true);

      expect(() => reportThread(thread.id, reporter.id)).toThrow(BoardError);
      expect(() => reportThread("nonexistent", reporter.id)).toThrow(BoardError);
    });

    it("reports a reply, rejecting an unknown reply and a duplicate report from the same reporter", () => {
      const author = makeUser("bd25");
      const replier = makeUser("bd25r");
      const reporter = makeUser("bd25rep");
      const thread = createThread("lfg-advice", author.id, { title: "T", body: "B" });
      const reply = createReply(thread.id, replier.id, "a reply");

      expect(hasReportedReply(reply.id, reporter.id)).toBe(false);
      const report = reportReply(reply.id, reporter.id);
      expect(report.reply_id).toBe(reply.id);
      expect(report.thread_id).toBeNull();
      expect(report.reason).toBe("");
      expect(hasReportedReply(reply.id, reporter.id)).toBe(true);

      expect(() => reportReply(reply.id, reporter.id)).toThrow(BoardError);
      expect(() => reportReply("nonexistent", reporter.id)).toThrow(BoardError);
    });

    it("rejects an over-length report reason", () => {
      const author = makeUser("bd26");
      const reporter = makeUser("bd26r");
      const thread = createThread("lfg-advice", author.id, { title: "T", body: "B" });
      expect(() => reportThread(thread.id, reporter.id, "x".repeat(501))).toThrow(BoardError);
    });

    it("allows two different reporters to each report the same thread independently", () => {
      const author = makeUser("bd27");
      const reporter1 = makeUser("bd27r1");
      const reporter2 = makeUser("bd27r2");
      const thread = createThread("lfg-advice", author.id, { title: "T", body: "B" });

      reportThread(thread.id, reporter1.id);
      reportThread(thread.id, reporter2.id);

      const queue = listReportedContent();
      const found = queue.find((item) => item.kind === "thread" && item.id === thread.id);
      expect(found?.reportCount).toBe(2);
    });

    it("listReportedContent sorts by report count descending and reflects both threads and replies", () => {
      const author = makeUser("bd28");
      const replier = makeUser("bd28r");
      const r1 = makeUser("bd28rep1");
      const r2 = makeUser("bd28rep2");
      const r3 = makeUser("bd28rep3");

      const thread = createThread("lfg-advice", author.id, { title: "Popular target", body: "B" });
      const reply = createReply(thread.id, replier.id, "a reply");

      reportThread(thread.id, r1.id);
      reportThread(thread.id, r2.id);
      reportThread(thread.id, r3.id);
      reportReply(reply.id, r1.id);

      const queue = listReportedContent();
      const threadEntry = queue.find((item) => item.kind === "thread" && item.id === thread.id);
      const replyEntry = queue.find((item) => item.kind === "reply" && item.id === reply.id);
      expect(threadEntry?.reportCount).toBe(3);
      expect(replyEntry?.reportCount).toBe(1);
      expect(queue.indexOf(threadEntry!)).toBeLessThan(queue.indexOf(replyEntry!));
    });

    it("removes a deleted thread's reports from the admin queue", () => {
      const author = makeUser("bd29");
      const reporter = makeUser("bd29r");
      const thread = createThread("lfg-advice", author.id, { title: "To be deleted", body: "B" });
      reportThread(thread.id, reporter.id);
      expect(listReportedContent().some((item) => item.id === thread.id)).toBe(true);

      deleteThread(thread.id, author.id);

      expect(listReportedContent().some((item) => item.id === thread.id)).toBe(false);
    });

    it("removes a deleted reply's reports from the admin queue without touching its thread's own report count", () => {
      const author = makeUser("bd30");
      const replier = makeUser("bd30r");
      const reporter = makeUser("bd30rep");
      const thread = createThread("lfg-advice", author.id, { title: "T", body: "B" });
      const reply = createReply(thread.id, replier.id, "a reply");
      reportThread(thread.id, reporter.id);
      reportReply(reply.id, reporter.id);

      deleteReply(reply.id, replier.id);

      const queue = listReportedContent();
      expect(queue.some((item) => item.kind === "reply" && item.id === reply.id)).toBe(false);
      const threadEntry = queue.find((item) => item.kind === "thread" && item.id === thread.id);
      expect(threadEntry?.reportCount).toBe(1);
    });
  });
});
