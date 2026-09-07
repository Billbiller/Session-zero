"use client";

import { useEffect, useState, useCallback, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Campaign, Profile, UserStats, AvailabilitySlot } from "@/lib/types";
import CharacterManager from "@/components/CharacterManager";
import StatsPanel from "@/components/StatsPanel";
import AvailabilityGrid from "@/components/AvailabilityGrid";

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [dming, setDming] = useState<Campaign[]>([]);
  const [playing, setPlaying] = useState<Campaign[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [bio, setBio] = useState("");
  const [preferredSystems, setPreferredSystems] = useState("");
  const [availability, setAvailability] = useState("");
  const [location, setLocation] = useState("");
  const [newToTabletop, setNewToTabletop] = useState(false);
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
      setAvailabilitySlots(data.availabilitySlots ?? []);
      setDming(data.dming ?? []);
      setPlaying(data.playing ?? []);
      setStats(data.stats ?? null);
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
    .map((c) => ({ id: c.id, title: c.title }));

  return (
    <div className="flex max-w-lg flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Your profile</h1>
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
          <div className="flex flex-col gap-1">
            <span>Weekly availability (optional, in addition to the note above)</span>
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
