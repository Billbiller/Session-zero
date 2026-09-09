"use client";

import { useEffect, useState, useCallback } from "react";
import Section from "@/components/Section";

interface Target {
  userId: string;
  displayName: string;
  existing: { stars: number; tags: string[] } | null;
}

export default function RatingsPanel({
  campaignId,
  signedIn,
}: {
  campaignId: string;
  signedIn: boolean;
}) {
  const [role, setRole] = useState<"dm" | "player" | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [tagOptions, setTagOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [stars, setStars] = useState(5);
  const [tags, setTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!signedIn) {
      setLoading(false);
      return;
    }
    const res = await fetch(`/api/campaigns/${campaignId}/ratings`);
    if (res.ok) {
      const data = await res.json();
      setRole(data.role);
      setTargets(data.targets ?? []);
      setTagOptions(data.tagOptions ?? []);
    }
    setLoading(false);
  }, [campaignId, signedIn]);

  useEffect(() => {
    // load() sets state only after its await resolves, so it can't be
    // inlined into this effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  function startEditing(target: Target) {
    setEditingId(target.userId);
    setStars(target.existing?.stars ?? 5);
    setTags(target.existing?.tags ?? []);
    setError(null);
    setSavedId(null);
  }

  function toggleTag(tag: string) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  async function submit(rateeId: string) {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/ratings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rateeId, stars, tags }),
    });
    setSubmitting(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setEditingId(null);
    setSavedId(rateeId);
    await load();
  }

  if (loading || !signedIn || !role || targets.length === 0) return null;

  const roleLabel = role === "dm" ? "your players" : "your DM";

  return (
    <Section>
      <h2 className="mb-2 font-medium">Rate {roleLabel}</h2>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <ul className="flex flex-col gap-3 text-sm">
        {targets.map((t) => (
          <li key={t.userId} className="border-t border-black/10 pt-3 first:border-t-0 first:pt-0 dark:border-white/10">
            {editingId === t.userId ? (
              <div className="flex flex-col gap-2">
                <p className="font-medium">{t.displayName}</p>
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
                    onClick={() => submit(t.userId)}
                    className="w-fit rounded bg-black px-3 py-1.5 text-white disabled:opacity-50 dark:bg-white dark:text-black"
                  >
                    {t.existing ? "Update rating" : "Submit rating"}
                  </button>
                  <button onClick={() => setEditingId(null)} className="underline">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{t.displayName}</p>
                  {t.existing ? (
                    <p className="text-xs text-black/60 dark:text-white/60">
                      Your rating: {"★".repeat(t.existing.stars)}
                      {"☆".repeat(5 - t.existing.stars)}
                      {t.existing.tags.length > 0 && ` · ${t.existing.tags.join(", ")}`}
                    </p>
                  ) : (
                    <p className="text-xs text-black/60 dark:text-white/60">Not rated yet</p>
                  )}
                </div>
                <button onClick={() => startEditing(t)} className="text-xs underline">
                  {t.existing ? "Edit" : "Rate"}
                </button>
              </div>
            )}
            {savedId === t.userId && editingId !== t.userId && (
              <p className="mt-1 text-xs text-black/60 dark:text-white/60">Saved.</p>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}
