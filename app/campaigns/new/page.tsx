"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewCampaignPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [system, setSystem] = useState("");
  const [capacity, setCapacity] = useState(4);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, system, capacity }),
    });
    setSubmitting(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) {
        router.push("/signin");
        return;
      }
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.push(`/campaigns/${data.campaign.id}`);
  }

  return (
    <div className="max-w-lg">
      <h1 className="mb-4 text-xl font-semibold">Post a campaign</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Title
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-transparent"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          System
          <input
            required
            value={system}
            onChange={(e) => setSystem(e.target.value)}
            placeholder="e.g. D&D 5e"
            className="rounded border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-transparent"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="rounded border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-transparent"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Capacity
          <input
            required
            type="number"
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
            className="rounded border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-transparent"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {submitting ? "Posting..." : "Post campaign"}
        </button>
      </form>
    </div>
  );
}
