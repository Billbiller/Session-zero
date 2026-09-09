"use client";

import { useEffect, useState, useCallback } from "react";
import Section from "@/components/Section";

interface Summary {
  average: number | null;
  count: number;
  tagCounts: Record<string, number>;
}

interface Existing {
  stars: number;
  tags: string[];
}

export default function CampaignRatingPanel({ campaignId }: { campaignId: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [canRate, setCanRate] = useState(false);
  const [existing, setExisting] = useState<Existing | null>(null);
  const [tagOptions, setTagOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [stars, setStars] = useState(5);
  const [tags, setTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/campaigns/${campaignId}/campaign-rating`);
    if (res.ok) {
      const data = await res.json();
      setSummary(data.summary);
      setCanRate(!!data.canRate);
      setExisting(data.existing);
      setTagOptions(data.tagOptions ?? []);
    }
    setLoading(false);
  }, [campaignId]);

  useEffect(() => {
    // load() sets state only after its await resolves, so it can't be
    // inlined into this effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  function startEditing() {
    setEditing(true);
    setStars(existing?.stars ?? 5);
    setTags(existing?.tags ?? []);
    setError(null);
    setSaved(false);
  }

  function toggleTag(tag: string) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/campaign-rating`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stars, tags }),
    });
    setSubmitting(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setEditing(false);
    setSaved(true);
    await load();
  }

  if (loading || !summary) return null;

  const topTags = Object.entries(summary.tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const rounded = Math.round(summary.average ?? 0);

  return (
    <Section>
      <h2 className="mb-2 font-medium">Campaign rating</h2>
      {summary.count > 0 ? (
        <p className="text-sm">
          <span aria-hidden>
            {"★".repeat(rounded)}
            {"☆".repeat(5 - rounded)}
          </span>{" "}
          <span className="text-black/60 dark:text-white/60">
            {summary.average?.toFixed(1)} average &middot; {summary.count} rating
            {summary.count === 1 ? "" : "s"}
          </span>
        </p>
      ) : (
        <p className="text-sm text-black/60 dark:text-white/60">Not yet rated.</p>
      )}
      {topTags.length > 0 && (
        <p className="mt-1 text-xs text-black/60 dark:text-white/60">
          {topTags.map(([tag, count]) => `${tag} (${count})`).join(" · ")}
        </p>
      )}

      {canRate && (
        <div className="mt-3 border-t border-black/10 pt-3 dark:border-white/10">
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
          {editing ? (
            <div className="flex flex-col gap-2">
              <div className="flex gap-1" role="radiogroup" aria-label="Stars">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setStars(n)}
                    aria-pressed={stars >= n}
                    aria-label={`${n} star${n === 1 ? "" : "s"}`}
                    className={`text-2xl leading-none ${stars >= n ? "" : "opacity-30"}`}
                  >
                    ★
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {tagOptions.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`rounded-full border px-2 py-0.5 text-xs ${
                      tags.includes(tag)
                        ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                        : "border-black/20 dark:border-white/20"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  disabled={submitting}
                  onClick={submit}
                  className="w-fit rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
                >
                  {existing ? "Update rating" : "Submit rating"}
                </button>
                <button onClick={() => setEditing(false)} className="text-sm underline">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between text-sm">
              <p className="text-black/60 dark:text-white/60">
                {existing
                  ? `Your rating: ${"★".repeat(existing.stars)}${"☆".repeat(5 - existing.stars)}`
                  : "You haven't rated this campaign yet."}
              </p>
              <button onClick={startEditing} className="text-xs underline">
                {existing ? "Edit" : "Rate this campaign"}
              </button>
            </div>
          )}
          {saved && !editing && (
            <p className="mt-1 text-xs text-black/60 dark:text-white/60">Saved.</p>
          )}
        </div>
      )}
    </Section>
  );
}
