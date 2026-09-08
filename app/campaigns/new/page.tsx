"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CAMPAIGN_TONE_TAGS,
  CAMPAIGN_TONE_TAG_LABELS,
  SESSION_FORMATS,
  SESSION_FORMAT_LABELS,
  type CampaignToneTag,
  type SessionFormat,
} from "@/lib/types";

export default function NewCampaignPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [system, setSystem] = useState("");
  const [capacity, setCapacity] = useState(4);
  const [location, setLocation] = useState("");
  const [newPlayerFriendly, setNewPlayerFriendly] = useState(false);
  const [sessionFormat, setSessionFormat] = useState<SessionFormat | "">("");
  const [startingLevel, setStartingLevel] = useState("");
  const [toneTags, setToneTags] = useState<CampaignToneTag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  function toggleToneTag(tag: CampaignToneTag) {
    setToneTags((current) =>
      current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        system,
        capacity,
        location,
        newPlayerFriendly,
        sessionFormat: sessionFormat || undefined,
        startingLevel: startingLevel || undefined,
        toneTags,
      }),
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
        <label className="flex flex-col gap-1 text-sm">
          Location
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={200}
            placeholder="e.g. Austin, TX or Online/Remote"
            className="rounded border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-transparent"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Format
          <select
            value={sessionFormat}
            onChange={(e) => setSessionFormat(e.target.value as SessionFormat | "")}
            className="w-fit rounded border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-transparent"
          >
            <option value="">Not set</option>
            {SESSION_FORMATS.map((format) => (
              <option key={format} value={format}>
                {SESSION_FORMAT_LABELS[format]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Starting level
          <input
            value={startingLevel}
            onChange={(e) => setStartingLevel(e.target.value)}
            maxLength={100}
            placeholder="e.g. Level 3, Tier 2, or a narrative milestone"
            className="rounded border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-transparent"
          />
        </label>
        <fieldset className="flex flex-col gap-1 text-sm">
          <legend>Tone / style (pick any that fit)</legend>
          <div className="flex flex-wrap gap-3">
            {CAMPAIGN_TONE_TAGS.map((tag) => (
              <label key={tag} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={toneTags.includes(tag)}
                  onChange={() => toggleToneTag(tag)}
                />
                {CAMPAIGN_TONE_TAG_LABELS[tag]}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={newPlayerFriendly}
            onChange={(e) => setNewPlayerFriendly(e.target.checked)}
          />
          New-player friendly (welcoming to someone new to tabletop gaming)
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
