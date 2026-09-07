"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Section from "@/components/Section";

/** The "post a reply" form on a board thread page (backlog #37). Replies
 * themselves are server-rendered directly off lib/boards.ts's
 * listReplies() (see app/boards/[slug]/[threadId]/page.tsx) -- this
 * component only handles the write side, then router.refresh()es to pick
 * up the new reply from the server, rather than duplicating the reply
 * list in client state the way CampaignChatPanel does for a live-updating
 * chat thread (a discussion-board reply doesn't need that). */
export default function ReplyForm({
  slug,
  threadId,
  signedIn,
}: {
  slug: string;
  threadId: string;
  signedIn: boolean;
}) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (!signedIn) {
    return (
      <p className="text-sm text-black/60 dark:text-white/60">
        <Link href="/signin" className="underline">
          Sign in
        </Link>{" "}
        to reply to this thread.
      </p>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/boards/${slug}/threads/${threadId}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    setSubmitting(false);
    if (res.ok) {
      setBody("");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't post that reply.");
    }
  }

  return (
    <Section>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a reply..."
          rows={3}
          maxLength={5000}
          className="rounded border border-black/10 p-2 text-sm dark:border-white/10 dark:bg-transparent"
        />
        <button
          type="submit"
          disabled={submitting || !body.trim()}
          className="w-fit rounded bg-black px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {submitting ? "Posting..." : "Post reply"}
        </button>
      </form>
    </Section>
  );
}
