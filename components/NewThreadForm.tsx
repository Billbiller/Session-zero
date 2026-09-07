"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Section from "@/components/Section";

/** The "start a thread" affordance on a board page (backlog #37).
 * Browsing a board's threads is public, but posting requires sign-in --
 * matches the sign-in prompt already used by JoinLeaveControls/
 * ConversationView for the same "read is public, write needs an account"
 * boundary. */
export default function NewThreadForm({
  boardSlug,
  signedIn,
}: {
  boardSlug: string;
  signedIn: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
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
        to start a thread on this board.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-fit rounded bg-black px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black"
      >
        Start a new thread
      </button>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/boards/${boardSlug}/threads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body }),
    });
    if (res.ok) {
      const data = await res.json();
      router.push(`/boards/${boardSlug}/${data.thread.id}`);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't post that thread.");
      setSubmitting(false);
    }
  }

  return (
    <Section>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Thread title"
          maxLength={200}
          className="rounded border border-black/10 p-2 text-sm dark:border-white/10 dark:bg-transparent"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What's on your mind?"
          rows={4}
          maxLength={10000}
          className="rounded border border-black/10 p-2 text-sm dark:border-white/10 dark:bg-transparent"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting || !title.trim() || !body.trim()}
            className="w-fit rounded bg-black px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {submitting ? "Posting..." : "Post thread"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-fit rounded border border-black/10 px-3 py-1.5 text-sm dark:border-white/10"
          >
            Cancel
          </button>
        </div>
      </form>
    </Section>
  );
}
