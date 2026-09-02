"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PartyNotesPanel({
  campaignId,
  initialContent,
}: {
  campaignId: string;
  initialContent: string;
}) {
  const [content, setContent] = useState(initialContent);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function save() {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/notes`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    setSubmitting(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <div className="rounded border border-black/10 p-4 dark:border-white/10">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-medium">Party notes</h2>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-sm underline">
            Edit
          </button>
        )}
      </div>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            className="rounded border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
          />
          <div className="flex gap-2 text-sm">
            <button
              disabled={submitting}
              onClick={save}
              className="rounded bg-black px-3 py-1.5 text-white disabled:opacity-50 dark:bg-white dark:text-black"
            >
              Save
            </button>
            <button
              onClick={() => {
                setContent(initialContent);
                setEditing(false);
              }}
              className="underline"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-sm">
          {content || <span className="text-black/60 dark:text-white/60">No notes yet.</span>}
        </p>
      )}
    </div>
  );
}
