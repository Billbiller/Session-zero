import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getBoard,
  getThreadWithAuthor,
  listReplies,
  hasReportedThread,
  hasReportedReply,
} from "@/lib/boards";
import { getCurrentUser } from "@/lib/currentUser";
import { isSiteAdmin } from "@/lib/access";
import ReplyForm from "@/components/ReplyForm";
import DeletePostButton from "@/components/DeletePostButton";
import ReportPostButton from "@/components/ReportPostButton";
import Section from "@/components/Section";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ slug: string; threadId: string }>;
}) {
  const { slug, threadId } = await params;
  const board = getBoard(slug);
  if (!board) notFound();

  const thread = getThreadWithAuthor(threadId);
  if (!thread || thread.board_slug !== slug) notFound();

  const replies = listReplies(threadId);
  const viewer = await getCurrentUser();
  // Backlog #48: a site admin can delete anyone's thread/reply, not just
  // their own -- see lib/boards.ts's requireAuthorOrAdmin. Computed once
  // here rather than per-post, since it doesn't vary per thread/reply.
  const viewerIsAdmin = viewer ? isSiteAdmin(viewer.id) : false;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/boards/${slug}`}
          className="text-sm text-black/60 hover:underline dark:text-white/60"
        >
          &larr; {board.name}
        </Link>
      </div>

      <Section>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{thread.title}</h1>
            <p className="text-sm text-black/60 dark:text-white/60">
              by {thread.authorName} &middot; {new Date(thread.created_at).toLocaleString()}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {(viewer?.id === thread.author_id || viewerIsAdmin) && (
              <DeletePostButton
                endpoint={`/api/boards/${slug}/threads/${threadId}`}
                redirectTo={`/boards/${slug}`}
                confirmLabel={
                  viewer?.id === thread.author_id
                    ? "Delete this thread? This also deletes all of its replies."
                    : "Delete this thread as an admin? This also deletes all of its replies."
                }
              />
            )}
            {viewer && viewer.id !== thread.author_id && (
              <ReportPostButton
                endpoint={`/api/boards/${slug}/threads/${threadId}/report`}
                alreadyReported={hasReportedThread(threadId, viewer.id)}
              />
            )}
          </div>
        </div>
        <p className="mt-3 whitespace-pre-wrap text-sm">{thread.body}</p>
      </Section>

      <div className="flex flex-col gap-3">
        <h2 className="font-medium">
          {replies.length} repl{replies.length === 1 ? "y" : "ies"}
        </h2>
        {replies.map((reply) => (
          <Section key={reply.id}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs text-black/60 dark:text-white/60">
                {reply.authorName} &middot; {new Date(reply.created_at).toLocaleString()}
              </p>
              <div className="flex flex-col items-end gap-2">
                {(viewer?.id === reply.author_id || viewerIsAdmin) && (
                  <DeletePostButton
                    endpoint={`/api/boards/${slug}/threads/${threadId}/replies/${reply.id}`}
                    confirmLabel={
                      viewer?.id === reply.author_id
                        ? "Delete this reply?"
                        : "Delete this reply as an admin?"
                    }
                  />
                )}
                {viewer && viewer.id !== reply.author_id && (
                  <ReportPostButton
                    endpoint={`/api/boards/${slug}/threads/${threadId}/replies/${reply.id}/report`}
                    alreadyReported={hasReportedReply(reply.id, viewer.id)}
                  />
                )}
              </div>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{reply.body}</p>
          </Section>
        ))}
        {replies.length === 0 && (
          <p className="text-sm text-black/60 dark:text-white/60">
            No replies yet. Be the first to respond.
          </p>
        )}
      </div>

      <ReplyForm slug={slug} threadId={threadId} signedIn={!!viewer} />
    </div>
  );
}
