"use client";

import { useEffect, useState, useCallback, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CAMPAIGN_SETTING_TAGS,
  CAMPAIGN_SETTING_TAG_LABELS,
  CAMPAIGN_STRUCTURES,
  CAMPAIGN_STRUCTURE_LABELS,
  CAMPAIGN_TONE_TAGS,
  CAMPAIGN_TONE_TAG_LABELS,
  DANGER_LEVELS,
  DANGER_LEVEL_LABELS,
  SESSION_FORMAT_PREFERENCES,
  SESSION_FORMAT_PREFERENCE_LABELS,
  type Campaign,
  type CampaignSettingTag,
  type CampaignStructure,
  type CampaignToneTag,
  type DangerLevel,
  type GameplayPillar,
  type Profile,
  type UserStats,
  type AvailabilitySlot,
  type SessionFormatPreference,
} from "@/lib/types";
import CharacterManager from "@/components/CharacterManager";
import StatsPanel from "@/components/StatsPanel";
import AvailabilityGrid from "@/components/AvailabilityGrid";
import GameplayFocusRanker from "@/components/GameplayFocusRanker";

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [dming, setDming] = useState<Campaign[]>([]);
  const [playing, setPlaying] = useState<Campaign[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  // Backlog #45: per-campaign unread table-chat counts, keyed by campaign
  // id (only campaigns with unread > 0 are present). Feeds the small
  // badges next to each campaign below.
  const [unreadCampaignChatCounts, setUnreadCampaignChatCounts] = useState<
    Record<string, number>
  >({});
  const [bio, setBio] = useState("");
  const [preferredSystems, setPreferredSystems] = useState("");
  const [availability, setAvailability] = useState("");
  const [location, setLocation] = useState("");
  const [newToTabletop, setNewToTabletop] = useState(false);
  const [sessionFormatPreference, setSessionFormatPreference] = useState<
    SessionFormatPreference | ""
  >("");
  const [toneTags, setToneTags] = useState<CampaignToneTag[]>([]);
  const [settingTags, setSettingTags] = useState<CampaignSettingTag[]>([]);
  const [structurePreference, setStructurePreference] = useState<CampaignStructure | "">("");
  const [dangerLevelPreference, setDangerLevelPreference] = useState<DangerLevel | "">("");
  const [gameplayFocusPreference, setGameplayFocusPreference] = useState<GameplayPillar[]>([]);
  const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  const load = useCallback(async () => {
    const res = await fetch("/api/profile");
    if (res.status === 401) {
      router.push("/signin");
      return;
    }
    if (res.ok) {
      const data = await res.json();
      setProfile(data.profile);
      setBio(data.profile.bio);
      setPreferredSystems(data.profile.preferred_systems);
      setAvailability(data.profile.availability);
      setLocation(data.profile.location);
      setNewToTabletop(!!data.profile.new_to_tabletop);
      setSessionFormatPreference(data.profile.session_format_preference ?? "");
      setToneTags(data.profile.tone_tags ?? []);
      setSettingTags(data.profile.setting_tags ?? []);
      setStructurePreference(data.profile.structure_preference ?? "");
      setDangerLevelPreference(data.profile.danger_level_preference ?? "");
      setGameplayFocusPreference(data.profile.gameplay_focus_preference ?? []);
      setAvailabilitySlots(data.availabilitySlots ?? []);
      setDming(data.dming ?? []);
      setPlaying(data.playing ?? []);
      setStats(data.stats ?? null);
      setUnreadCampaignChatCounts(data.unreadCampaignChatCounts ?? {});
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    // load() sets state only after its await resolves (an async microtask
    // continuation), and is also called after saving, so it can't be
    // inlined into this effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  function toggleToneTag(tag: CampaignToneTag) {
    setToneTags((current) =>
      current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]
    );
  }

  function toggleSettingTag(tag: CampaignSettingTag) {
    setSettingTags((current) =>
      current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bio,
        preferredSystems,
        availability,
        location,
        newToTabletop,
        sessionFormatPreference: sessionFormatPreference || null,
        toneTags,
        settingTags,
        structurePreference: structurePreference || null,
        dangerLevelPreference: dangerLevelPreference || null,
        gameplayFocusPreference,
        availabilitySlots,
      }),
    });
    setSaving(false);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      router.push("/signin");
      return;
    }
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setProfile(data.profile);
    setSaved(true);
  }

  if (loading) return <p className="text-sm">Loading...</p>;
  if (!profile) return null;

  // Campaigns a character can be linked to: everywhere the user is
  // currently the DM or an active member (matches the server-side
  // hasPrivateAccess check), excluding cancelled campaigns since starting
  // a new character there wouldn't make sense.
  const assignableCampaigns = [...dming, ...playing]
    .filter((c) => !c.cancelled)
    .filter((c, i, arr) => arr.findIndex((other) => other.id === c.id) === i)
    .map((c) => ({ id: c.id, title: c.title, system: c.system }));

  return (
    <div className="flex max-w-lg flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Your profile</h1>
        <p className="mt-1 text-sm">
          <Link href="/settings/account" className="underline">
            Download your data
          </Link>
        </p>
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 text-sm">
          <label className="flex flex-col gap-1">
            Bio
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Tell other players a bit about yourself and how you like to play."
              className="rounded border border-black/20 px-3 py-1.5 dark:border-white/20 dark:bg-transparent"
            />
          </label>
          <label className="flex flex-col gap-1">
            Preferred systems
            <input
              value={preferredSystems}
              onChange={(e) => setPreferredSystems(e.target.value)}
              maxLength={300}
              placeholder="e.g. D&D 5e, Pathfinder 2e, Call of Cthulhu"
              className="rounded border border-black/20 px-3 py-1.5 dark:border-white/20 dark:bg-transparent"
            />
          </label>
          <label className="flex flex-col gap-1">
            Availability
            <input
              value={availability}
              onChange={(e) => setAvailability(e.target.value)}
              maxLength={300}
              placeholder="e.g. Weeknights after 7pm ET, most Saturdays"
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
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={newToTabletop}
              onChange={(e) => setNewToTabletop(e.target.checked)}
            />
            I&apos;m new to tabletop gaming
          </label>
          <label className="flex flex-col gap-1">
            In-person or remote?
            <select
              value={sessionFormatPreference}
              onChange={(e) =>
                setSessionFormatPreference(e.target.value as SessionFormatPreference | "")
              }
              className="w-fit rounded border border-black/20 px-3 py-1.5 dark:border-white/20 dark:bg-transparent"
            >
              <option value="">Not set</option>
              {SESSION_FORMAT_PREFERENCES.map((pref) => (
                <option key={pref} value={pref}>
                  {SESSION_FORMAT_PREFERENCE_LABELS[pref]}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="flex flex-col gap-1">
            <legend>Tone / style you enjoy (pick any that fit)</legend>
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
          <fieldset className="flex flex-col gap-1">
            <legend>Settings you enjoy (pick any that fit)</legend>
            <div className="flex flex-wrap gap-3">
              {CAMPAIGN_SETTING_TAGS.map((tag) => (
                <label key={tag} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={settingTags.includes(tag)}
                    onChange={() => toggleSettingTag(tag)}
                  />
                  {CAMPAIGN_SETTING_TAG_LABELS[tag]}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex flex-col gap-1">
            Preferred campaign structure
            <select
              value={structurePreference}
              onChange={(e) => setStructurePreference(e.target.value as CampaignStructure | "")}
              className="w-fit rounded border border-black/20 px-3 py-1.5 dark:border-white/20 dark:bg-transparent"
            >
              <option value="">Not set</option>
              {CAMPAIGN_STRUCTURES.map((s) => (
                <option key={s} value={s}>
                  {CAMPAIGN_STRUCTURE_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Preferred lethality/difficulty
            <select
              value={dangerLevelPreference}
              onChange={(e) => setDangerLevelPreference(e.target.value as DangerLevel | "")}
              className="w-fit rounded border border-black/20 px-3 py-1.5 dark:border-white/20 dark:bg-transparent"
            >
              <option value="">Not set</option>
              {DANGER_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {DANGER_LEVEL_LABELS[level]}
                </option>
              ))}
            </select>
          </label>
          <GameplayFocusRanker
            value={gameplayFocusPreference}
            onChange={setGameplayFocusPreference}
            label="Gameplay focus you enjoy most (rank, most important first)"
          />
          <div className="flex flex-col gap-1">
            <span>Weekly availability (optional, in addition to the note above)</span>
            <span className="text-xs text-black/60 dark:text-white/60">
              Click an hour to mark it free, in your own local time -- shown to visitors exactly as
              you set it (e.g. 6pm-9pm on Tuesdays), not converted to their timezone.
            </span>
            <AvailabilityGrid
              slots={availabilitySlots}
              onChange={setAvailabilitySlots}
              editable
            />
          </div>
          {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-black px-3 py-1.5 font-medium text-white disabled:opacity-60 dark:bg-white dark:text-black"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            {saved && <span className="text-black/60 dark:text-white/60">Saved.</span>}
          </div>
        </form>
      </div>

      {stats && <StatsPanel stats={stats} />}

      <div>
        <CharacterManager assignableCampaigns={assignableCampaigns} />
      </div>

      <div>
        <h2 className="text-lg font-semibold">My campaigns</h2>
        <div className="mt-2 flex flex-col gap-4 text-sm">
          <div>
            <h3 className="font-medium text-black/60 dark:text-white/60">Running (as DM)</h3>
            {dming.length === 0 ? (
              <p className="mt-1 text-black/60 dark:text-white/60">
                You&apos;re not running any campaigns yet.
              </p>
            ) : (
              <ul className="mt-1 flex flex-col gap-1">
                {dming.map((c) => (
                  <li key={c.id}>
                    <Link href={`/campaigns/${c.id}`} className="underline">
                      {c.title}
                    </Link>
                    {c.cancelled ? " (cancelled)" : ""}
                    {!!unreadCampaignChatCounts[c.id] && (
                      <span
                        className="ml-2 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1 text-xs font-medium text-white"
                        title="Unread table chat messages"
                      >
                        {unreadCampaignChatCounts[c.id]}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="font-medium text-black/60 dark:text-white/60">Playing in</h3>
            {playing.length === 0 ? (
              <p className="mt-1 text-black/60 dark:text-white/60">
                You&apos;re not an active member of any campaigns yet.
              </p>
            ) : (
              <ul className="mt-1 flex flex-col gap-1">
                {playing.map((c) => (
                  <li key={c.id}>
                    <Link href={`/campaigns/${c.id}`} className="underline">
                      {c.title}
                    </Link>
                    {!!unreadCampaignChatCounts[c.id] && (
                      <span
                        className="ml-2 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1 text-xs font-medium text-white"
                        title="Unread table chat messages"
                      >
                        {unreadCampaignChatCounts[c.id]}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
