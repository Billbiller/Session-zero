"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SessionLogEntry } from "@/lib/types";

export default function SessionLogPanel({
  campaignId,
  isDm,
  entries,
}: {
  campaignId: string;
  isDm: boolean;
  entries: SessionLogEntry[];
}) {
  const [newContent, setNewContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function post() {
    if (!newContent.trim()) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newContent }),
    });
    setSubmitting(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setNewContent("");
    router.refresh();
  }

  async function saveEdit(entryId: string) {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/log/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: editContent }),
    });
    setSubmitting(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setEditingId(null);
    router.refresh();
  }

  async function remove(entryId: string) {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/log/${entryId}`, {
      method: "DELETE",
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded border border-black/10 p-4 dark:border-white/10">
      <h2 className="mb-2 font-medium">Session log</h2>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {isDm && (
        <div className="mb-3 flex flex-col gap-2">
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            rows={3}
            placeholder="What happened this session?"
            className="rounded border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
          />
          <button
            disabled={submitting}
            onClick={post}
            className="w-fit rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            Post entry
          </button>
        </div>
      )}
      <ul className="flex flex-col gap-3">
        {entries.map((entry) => (
          <li key={entry.id} className="border-t border-black/10 pt-2 text-sm dark:border-white/10">
            {editingId === entry.id ? (
              <div className="flex flex-col gap-2">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={3}
                  className="rounded border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-transparent"
                />
                <div className="flex gap-2">
                  <button
                    disabled={submitting}
                    onClick={() => saveEdit(entry.id)}
                    className="rounded bg-black px-2 py-1 text-white disabled:opacity-50 dark:bg-white dark:text-black"
                  >
                    Save
                  </button>
                  <button onClick={() => setEditingId(null)} className="underline">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="whitespace-pre-wrap">{entry.content}</p>
                <p className="mt-1 text-xs text-black/50 dark:text-white/50">
                  {new Date(entry.created_at).toLocaleString()}
                  {isDm && (
                    <>
                      {" "}
                      &middot;{" "}
                      <button
                        onClick={() => {
                          setEditingId(entry.id);
                          setEditContent(entry.content);
                        }}
                        className="underline"
                      >
                        Edit
                      </button>{" "}
                      &middot;{" "}
                      <button onClick={() => remove(entry.id)} className="underline">
                        Delete
                      </button>
                    </>
                  )}
                </p>
              </>
            )}
          </li>
        ))}
        {entries.length === 0 && (
          <li className="text-black/60 dark:text-white/60">No entries yet.</li>
        )}
      </ul>
    </div>
  );
}
