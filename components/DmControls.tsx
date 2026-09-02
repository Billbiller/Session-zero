"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Campaign } from "@/lib/types";

export default function DmControls({ campaign }: { campaign: Campaign }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(campaign.title);
  const [description, setDescription] = useState(campaign.description);
  const [system, setSystem] = useState(campaign.system);
  const [capacity, setCapacity] = useState(campaign.capacity);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaign.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, system, capacity }),
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

  async function toggleCancel() {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaign.id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cancelled: !campaign.cancelled }),
    });
    setSubmitting(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  async function reopen() {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaign.id}/reopen`, { method: "POST" });
    setSubmitting(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded border border-black/10 p-4 dark:border-white/10">
      <h2 className="mb-3 font-medium">DM controls</h2>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {!editing ? (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setEditing(true)}
            className="rounded border border-black/20 px-3 py-1.5 text-sm dark:border-white/20"
          >
            Edit details
          </button>
          <button
            disabled={submitting}
            onClick={toggleCancel}
            className="rounded border border-black/20 px-3 py-1.5 text-sm dark:border-white/20"
          >
            {campaign.cancelled ? "Un-cancel campaign" : "Cancel campaign"}
          </button>
          {!campaign.accepting_requests && !campaign.cancelled && (
            <button
              disabled={submitting}
              onClick={reopen}
              className="rounded border border-black/20 px-3 py-1.5 text-sm dark:border-white/20"
            >
              Reopen for requests
            </button>
          )}
        </div>
      ) : (
        <form onSubmit={save} className="flex flex-col gap-3 text-sm">
          <label className="flex flex-col gap-1">
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded border border-black/20 px-3 py-1.5 dark:border-white/20 dark:bg-transparent"
            />
          </label>
          <label className="flex flex-col gap-1">
            System
            <input
              value={system}
              onChange={(e) => setSystem(e.target.value)}
              className="rounded border border-black/20 px-3 py-1.5 dark:border-white/20 dark:bg-transparent"
            />
          </label>
          <label className="flex flex-col gap-1">
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="rounded border border-black/20 px-3 py-1.5 dark:border-white/20 dark:bg-transparent"
            />
          </label>
          <label className="flex flex-col gap-1">
            Capacity
            <input
              type="number"
              min={1}
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
              className="rounded border border-black/20 px-3 py-1.5 dark:border-white/20 dark:bg-transparent"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-black px-3 py-1.5 text-white disabled:opacity-50 dark:bg-white dark:text-black"
            >
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)} className="underline">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
