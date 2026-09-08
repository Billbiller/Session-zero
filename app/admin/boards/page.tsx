import Link from "next/link";
import { getCurrentUser } from "@/lib/currentUser";
import { isSiteAdmin } from "@/lib/access";
import { listReportedContent } from "@/lib/boards";
import DeletePostButton from "@/components/DeletePostButton";
import Section from "@/components/Section";

export const dynamic = "force-dynamic";

/** Backlog #48: the minimal admin moderation queue -- reported board
 * threads/replies, sorted by report count, with a delete button that
 * reuses the existing thread/reply DELETE routes (they already accept a
 * site admin as well as the post's own author, see lib/boards.ts's
 * requireAuthorOrAdmin). Gated inline (rendered content, not a 404 or a
 * redirect) rather than page-level middleware, matching how this app's
 * other role boundaries are tested via rendered-HTML content checks in
 * the HTTP integration suite. There's no nav-visible hint this page
 * exists for a non-admin beyond the "Admin" NavBar link itself only
 * rendering for one. */
export default async function AdminBoardsPage() {
  const user = await getCurrentUser();
  const admin = user ? isSiteAdmin(user.id) : false;

  if (!admin) {
    return (
      <Section>
        <p className="text-sm text-black/60 dark:text-white/60">
          Admin access required.
        </p>
      </Section>
    );
  }

  const reported = listReportedContent();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Reported board content</h1>
      <p className="text-sm text-black/60 dark:text-white/60">
        Threads and replies with at least one report, most-reported first.
      </p>

      {reported.length === 0 && (
        <p className="text-sm text-black/60 dark:text-white/60">Nothing has been reported.</p>
      )}

      {reported.map((item) => (
        <Section key={`${item.kind}-${item.id}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">
                <Link href={`/boards/${item.boardSlug}/${item.threadId}`} className="hover:underline">
                  {item.title}
                </Link>{" "}
                <span className="font-normal text-black/60 dark:text-white/60">
                  ({item.kind})
                </span>
              </p>
              <p className="text-xs text-black/60 dark:text-white/60">
                by {item.authorName} &middot; {item.reportCount} report
                {item.reportCount === 1 ? "" : "s"}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{item.excerpt}</p>
            </div>
            <DeletePostButton
              endpoint={
                item.kind === "thread"
                  ? `/api/boards/${item.boardSlug}/threads/${item.id}`
                  : `/api/boards/${item.boardSlug}/threads/${item.threadId}/replies/${item.id}`
              }
              confirmLabel={
                item.kind === "thread"
                  ? "Delete this thread as an admin? This also deletes all of its replies."
                  : "Delete this reply as an admin?"
              }
            />
          </div>
        </Section>
      ))}
    </div>
  );
}
