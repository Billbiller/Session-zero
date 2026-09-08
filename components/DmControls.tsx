"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CAMPAIGN_TONE_TAGS,
  CAMPAIGN_TONE_TAG_LABELS,
  DANGER_LEVELS,
  DANGER_LEVEL_LABELS,
  SESSION_FORMATS,
  SESSION_FORMAT_LABELS,
  type Campaign,
  type CampaignToneTag,
  type DangerLevel,
  type SessionFormat,
} from "@/lib/types";
import Section from "@/components/Section";

export default function DmControls({ campaign }: { campaign: Campaign }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(campaign.title);
  const [description, setDescription] = useState(campaign.description);
  const [system, setSystem] = useState(campaign.system);
  const [capacity, setCapacity] = useState(campaign.capacity);
  const [location, setLocation] = useState(campaign.location);
  const [dangerLevel, setDangerLevel] = useState<DangerLevel | "">(campaign.danger_level ?? "");
  const [newPlayerFriendly, setNewPlayerFriendly] = useState(!!campaign.new_player_friendly);
  const [sessionFormat, setSessionFormat] = useState<SessionFormat | "">(
    campaign.session_format ?? ""
  );
  const [startingLevel, setStartingLevel] = useState(campaign.starting_level ?? "");
  const [toneTags, setToneTags] = useState<CampaignToneTag[]>(campaign.tone_tags);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  function toggleToneTag(tag: CampaignToneTag) {
    setToneTags((current) =>
      current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaign.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        system,
        capacity,
        location,
        dangerLevel: dangerLevel === "" ? null : dangerLevel,
        newPlayerFriendly,
        sessionFormat: sessionFormat === "" ? null : sessionFormat,
        startingLevel: startingLevel === "" ? null : startingLevel,
        toneTags,
      }),
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

  // Backlog #47: re-usable "setup" fields only -- see duplicateCampaign()'s
  // own doc comment in lib/campaigns.ts for exactly what carries over.
  // Navigates straight to the new campaign so the DM can pick up editing
  // it (or scheduling a session) immediately.
  async function duplicate() {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaign.id}/duplicate`, { method: "POST" });
    setSubmitting(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.push(`/campaigns/${data.campaign.id}`);
  }

  return (
    <Section>
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
          <button
            disabled={submitting}
            onClick={duplicate}
            title="Copy this campaign's setup (title, system, capacity, and other details) into a brand-new campaign, with an empty roster and no schedule."
            className="rounded border border-black/20 px-3 py-1.5 text-sm dark:border-white/20"
          >
            Duplicate campaign
          </button>
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
          <label className="flex flex-col gap-1">
            Location
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={200}
              placeholder="e.g. Austin, TX or Online/Remote"
              className="rounded border border-black/20 px-3 py-1.5 dark:border-white/20 dark:bg-transparent"
            />
          </label>
          <label className="flex flex-col gap-1">
            Danger level
            <select
              value={dangerLevel}
              onChange={(e) => setDangerLevel(e.target.value as DangerLevel | "")}
              className="w-fit rounded border border-black/20 px-3 py-1.5 dark:border-white/20 dark:bg-transparent"
            >
              <option value="">Not set</option>
              {DANGER_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {DANGER_LEVEL_LABELS[level]}
                </option>
              ))}
            </select>
            <span className="text-xs text-black/60 dark:text-white/60">
              A heads-up for prospective players, not a scoreboard.
            </span>
          </label>
          <label className="flex flex-col gap-1">
            Format
            <select
              value={sessionFormat}
              onChange={(e) => setSessionFormat(e.target.value as SessionFormat | "")}
              className="w-fit rounded border border-black/20 px-3 py-1.5 dark:border-white/20 dark:bg-transparent"
            >
              <option value="">Not set</option>
              {SESSION_FORMATS.map((format) => (
                <option key={format} value={format}>
                  {SESSION_FORMAT_LABELS[format]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Starting level
            <input
              value={startingLevel}
              onChange={(e) => setStartingLevel(e.target.value)}
              maxLength={100}
              placeholder="e.g. Level 3, Tier 2, or a narrative milestone"
              className="rounded border border-black/20 px-3 py-1.5 dark:border-white/20 dark:bg-transparent"
            />
          </label>
          <fieldset className="flex flex-col gap-1">
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
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={newPlayerFriendly}
              onChange={(e) => setNewPlayerFriendly(e.target.checked)}
            />
            New-player friendly
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
    </Section>
  );
}
