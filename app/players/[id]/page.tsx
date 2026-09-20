import { notFound } from "next/navigation";
import Link from "next/link";
import { getUserById } from "@/lib/auth";
import { getCurrentUser } from "@/lib/currentUser";
import { getProfile, splitPreferredSystems } from "@/lib/profiles";
import { listCharactersForUser } from "@/lib/characters";
import { getCampaign } from "@/lib/campaigns";
import { getUserRatingSummary } from "@/lib/ratings";
import { getAttendanceStats } from "@/lib/attendance";
import { getUserStats } from "@/lib/stats";
import { getAvailabilitySlots, summarizeAvailabilityByDay } from "@/lib/availability";
import { isFollowing, followerCount, followingCount } from "@/lib/follows";
import { areFriends, getFriendshipStatus } from "@/lib/friends";
import CharacterSummary from "@/components/CharacterSummary";
import StatsPanel from "@/components/StatsPanel";
import FollowButton from "@/components/FollowButton";
import FriendButton from "@/components/FriendButton";
import {
  CAMPAIGN_SETTING_TAG_LABELS,
  CAMPAIGN_STRUCTURE_LABELS,
  CAMPAIGN_TONE_TAG_LABELS,
  DANGER_LEVEL_LABELS,
  GAMEPLAY_PILLAR_LABELS,
  SESSION_FORMAT_PREFERENCE_LABELS,
} from "@/lib/types";

function reputationLine(label: string, summary: { average: number | null; count: number; tagCounts: Record<string, number> }) {
  const topTags = Object.entries(summary.tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => tag);
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-medium">{label}</p>
      {summary.count === 0 ? (
        <p className="text-sm text-black/60 dark:text-white/60">Unrated so far</p>
      ) : (
        <>
          <p className="text-sm">
            {"★".repeat(Math.round(summary.average ?? 0))}
            {"☆".repeat(5 - Math.round(summary.average ?? 0))}{" "}
            <span className="text-black/60 dark:text-white/60">
              {(summary.average ?? 0).toFixed(1)} ({summary.count} rating{summary.count === 1 ? "" : "s"})
            </span>
          </p>
          {topTags.length > 0 && (
            <p className="text-xs text-black/60 dark:text-white/60">{topTags.join(" · ")}</p>
          )}
        </>
      )}
    </div>
  );
}

/** Backlog #39: the "shows up" reliability signal, styled to match
 * reputationLine() above -- "No attendance data yet" (not "0%") when
 * recorded is 0, the same unrated-not-zero convention. See
 * lib/attendance.ts for why this is derived only from explicit
 * DM-recorded attendance, never from RSVP intent (backlog #35), and why
 * it's deliberately player-only (a DM is never scored on attending their
 * own table). */
function attendanceLine(stats: { recorded: number; attended: number; rate: number | null }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-medium">Attendance (as player)</p>
      {stats.recorded === 0 ? (
        <p className="text-sm text-black/60 dark:text-white/60">No attendance data yet</p>
      ) : (
        <>
          <p className="text-sm">
            {Math.round((stats.rate ?? 0) * 100)}%{" "}
            <span className="text-black/60 dark:text-white/60">
              ({stats.attended}/{stats.recorded} logged session{stats.recorded === 1 ? "" : "s"})
            </span>
          </p>
          <p className="text-xs text-black/60 dark:text-white/60">
            DM-recorded attendance, not RSVP responses
          </p>
        </>
      )}
    </div>
  );
}

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = getUserById(id);
  if (!user) notFound();

  const viewer = await getCurrentUser();
  const isOwnProfile = viewer?.id === id;

  const profile = getProfile(id);
  const systems = splitPreferredSystems(profile.preferred_systems);
  const characters = listCharactersForUser(id);
  const ratingSummary = getUserRatingSummary(id);
  const attendanceStats = getAttendanceStats(id);
  const stats = getUserStats(id);
  const availabilitySlots = getAvailabilitySlots(id);
  const followers = followerCount(id);
  const followees = followingCount(id);
  const viewerIsFollowing = viewer && !isOwnProfile ? isFollowing(viewer.id, id) : false;
  // Backlog #59: viewer-relative friend status drives FriendButton, and
  // separately gates the Location field below to friends-only. A
  // signed-out visitor or a user viewing their own page is never
  // "friends" with the subject for either purpose -- getFriendshipStatus
  // already returns "self"/"none" appropriately, but the two checks stay
  // as explicit separate booleans (rather than deriving canSeeLocation
  // from friendshipStatus) since isOwnProfile always sees their own
  // location regardless of friendship state.
  const friendshipStatus = viewer ? getFriendshipStatus(viewer.id, id) : "none";
  const canSeeLocation = isOwnProfile || (!!viewer && areFriends(viewer.id, id));

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {user.display_name}
            {!!profile.new_to_tabletop && (
              <span
                className="ml-2 rounded-full border border-black/20 px-2 py-0.5 text-xs font-normal dark:border-white/20"
                title="New to tabletop gaming"
              >
                New to tabletop
              </span>
            )}
          </h1>
          <p className="mt-0.5 text-xs text-black/60 dark:text-white/60">
            {followers} follower{followers === 1 ? "" : "s"} &middot; following {followees}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {viewer && !isOwnProfile && (
            <>
              <FriendButton userId={id} initialStatus={friendshipStatus} />
              <FollowButton userId={id} initiallyFollowing={viewerIsFollowing} />
              <Link
                href={`/messages/${id}`}
                className="whitespace-nowrap rounded border border-black/10 px-3 py-1 text-sm dark:border-white/10"
              >
                Message
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded border border-black/10 p-3 dark:border-white/10 sm:flex-row sm:gap-6">
        {reputationLine("As DM", ratingSummary.asDm)}
        {reputationLine("As player", ratingSummary.asPlayer)}
        {attendanceLine(attendanceStats)}
      </div>

      <StatsPanel stats={stats} />

      {profile.bio ? (
        <p className="text-sm">{profile.bio}</p>
      ) : (
        <p className="text-sm text-black/60 dark:text-white/60">No bio yet.</p>
      )}

      {systems.length > 0 && (
        <div>
          <h2 className="text-sm font-medium">Preferred systems</h2>
          <ul className="mt-1 flex flex-wrap gap-2">
            {systems.map((s) => (
              <li
                key={s}
                className="rounded-full border border-black/10 px-2 py-0.5 text-xs dark:border-white/10"
              >
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {profile.availability && (
        <div>
          <h2 className="text-sm font-medium">Availability</h2>
          <p className="text-sm">{profile.availability}</p>
        </div>
      )}

      {availabilitySlots.length > 0 && (
        <div>
          <h2 className="text-sm font-medium">Weekly availability</h2>
          {/* Backlog #57: a plain-language day/time summary rather than
           * the editable AvailabilityGrid component's own 168-cell visual
           * grid -- a checkbox grid is efficient to *edit* on /profile,
           * but a lot for a viewer to decode at a glance just to answer
           * "when are they free." The "in <name>'s own local time" note
           * is this item's documented timezone decision (see
           * AvailabilitySlot's doc comment in lib/types.ts): hours are
           * never converted to the viewer's own timezone. */}
          <ul className="mt-1 text-sm">
            {summarizeAvailabilityByDay(availabilitySlots).map((day) => (
              <li key={day.day}>
                <span className="font-medium">{day.dayName}:</span> {day.ranges.join(", ")}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-black/60 dark:text-white/60">
            In {user.display_name}&apos;s own local time.
          </p>
        </div>
      )}

      {/* Backlog #59: the first profile field gated to friends-only --
          location is the most privacy-sensitive of the freeform profile
          fields (see Profile.location's own "deliberately-imprecise"
          doc comment on lib/types.ts, which is about *scope*, not
          *audience*: even a coarse "Austin, TX" is still more than a
          stranger needs). Everything else on this page (bio, systems,
          weekly availability, characters, reputation/attendance stats)
          stays fully public, matching backlog #59's own scope note that
          this is "some," not all, profile/activity content. */}
      {profile.location && canSeeLocation && (
        <div>
          <h2 className="text-sm font-medium">Location</h2>
          <p className="text-sm">{profile.location}</p>
        </div>
      )}
      {profile.location && !canSeeLocation && (
        <div>
          <h2 className="text-sm font-medium">Location</h2>
          <p className="text-sm text-black/60 dark:text-white/60">
            Only visible to friends.
          </p>
        </div>
      )}

      {profile.session_format_preference && (
        <div>
          <h2 className="text-sm font-medium">In-person or remote?</h2>
          <p className="text-sm">
            {SESSION_FORMAT_PREFERENCE_LABELS[profile.session_format_preference]}
          </p>
        </div>
      )}

      {/* Backlog #64 (owner-requested, live session): the player-side
       * "types of games they enjoy most" fields -- fully public, same as
       * everything else on this page besides location (see the
       * canSeeLocation comment above for that one exception's own
       * reasoning). Purely informational/display, not wired into any
       * matching or ranking logic yet. */}
      {(profile.tone_tags.length > 0 || profile.setting_tags.length > 0) && (
        <div>
          <h2 className="text-sm font-medium">Tone &amp; setting they enjoy</h2>
          <ul className="mt-1 flex flex-wrap gap-2">
            {profile.tone_tags.map((tag) => (
              <li
                key={tag}
                className="rounded-full border border-black/10 px-2 py-0.5 text-xs dark:border-white/10"
              >
                {CAMPAIGN_TONE_TAG_LABELS[tag]}
              </li>
            ))}
            {profile.setting_tags.map((tag) => (
              <li
                key={tag}
                className="rounded-full border border-black/10 px-2 py-0.5 text-xs dark:border-white/10"
              >
                {CAMPAIGN_SETTING_TAG_LABELS[tag]}
              </li>
            ))}
          </ul>
        </div>
      )}

      {profile.gameplay_focus_preference.length > 0 && (
        <div>
          <h2 className="text-sm font-medium">Gameplay focus</h2>
          <p className="text-sm">
            {profile.gameplay_focus_preference.map((p) => GAMEPLAY_PILLAR_LABELS[p]).join(" > ")}
          </p>
        </div>
      )}

      {(profile.structure_preference || profile.danger_level_preference) && (
        <div>
          <h2 className="text-sm font-medium">Campaign preferences</h2>
          <p className="text-sm">
            {[
              profile.structure_preference
                ? CAMPAIGN_STRUCTURE_LABELS[profile.structure_preference]
                : null,
              profile.danger_level_preference
                ? DANGER_LEVEL_LABELS[profile.danger_level_preference]
                : null,
            ]
              .filter(Boolean)
              .join(" \u00b7 ")}
          </p>
        </div>
      )}

      {characters.length > 0 && (
        <div>
          <h2 className="text-sm font-medium">Characters</h2>
          <ul className="mt-2 flex flex-col gap-3">
            {characters.map((c) => {
              const campaign = c.campaign_id ? getCampaign(c.campaign_id) : null;
              const pilot = c.temp_pilot_user_id ? getUserById(c.temp_pilot_user_id) : null;
              return (
                <li key={c.id} className="border-t border-black/10 pt-3 dark:border-white/10">
                  <CharacterSummary
                    character={c}
                    linkedCampaign={campaign ? { id: campaign.id, title: campaign.title } : null}
                    pilotName={pilot?.display_name ?? null}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
