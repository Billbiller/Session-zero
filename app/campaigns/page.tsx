import Link from "next/link";
import { listCampaigns, approvedHeadcount, type CampaignSort } from "@/lib/campaigns";
import { seatsLeftLabel } from "@/lib/campaignCardCopy";
import { getUserById } from "@/lib/auth";
import { getCurrentUser } from "@/lib/currentUser";
import { getProfile } from "@/lib/profiles";
import { getAvailabilitySlots } from "@/lib/availability";
import DiscoverDeck, { type DiscoverCard } from "@/components/DiscoverDeck";
import {
  CAMPAIGN_TONE_TAGS,
  CAMPAIGN_TONE_TAG_LABELS,
  SESSION_FORMATS,
  SESSION_FORMAT_LABELS,
  type CampaignToneTag,
  type SessionFormat,
} from "@/lib/types";

const PAGE_SIZE = 10;
// The deck shows every matching campaign one at a time rather than paging
// through them — pagination controls make sense for a scannable list, not
// for a "swipe through these" flow — so fetch a larger batch up front
// instead of the list view's page size.
const DISCOVER_BATCH_SIZE = 50;

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{
    system?: string;
    q?: string;
    location?: string;
    newPlayerFriendly?: string;
    sessionFormat?: string;
    toneTags?: string | string[];
    sort?: string;
    page?: string;
    view?: string;
  }>;
}) {
  const params = await searchParams;
  const system = params.system?.trim() || undefined;
  const q = params.q?.trim() || undefined;
  const location = params.location?.trim() || undefined;
  const newPlayerFriendly = params.newPlayerFriendly === "true" || undefined;
  const sessionFormat =
    params.sessionFormat && (SESSION_FORMATS as readonly string[]).includes(params.sessionFormat)
      ? (params.sessionFormat as SessionFormat)
      : undefined;
  // Backlog #30: repeated ?toneTags=horror&toneTags=comedic query params --
  // Next.js's searchParams gives a bare string when only one is present, so
  // normalize to an array first. Only recognized tags are kept for the
  // checkbox defaultChecked state and the query links below; listCampaigns
  // itself also silently drops anything unrecognized (belt and suspenders,
  // matching sessionFormat's own precedent above).
  const toneTags = (
    Array.isArray(params.toneTags) ? params.toneTags : params.toneTags ? [params.toneTags] : []
  ).filter((tag): tag is CampaignToneTag =>
    (CAMPAIGN_TONE_TAGS as readonly string[]).includes(tag)
  );
  const sort = (params.sort as CampaignSort) || "newest";
  const page = Number(params.page || "1");
  const view = params.view === "discover" ? "discover" : "list";

  const { items, total } = listCampaigns({
    system,
    q,
    location,
    newPlayerFriendly,
    sessionFormat,
    toneTags: toneTags.length > 0 ? toneTags : undefined,
    sort,
    page,
    pageSize: view === "discover" ? DISCOVER_BATCH_SIZE : PAGE_SIZE,
  });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Backlog #40: a subtle, opt-in nudge for a signed-in user who's flagged
  // themselves "new to tabletop" on their profile -- suggest the
  // new-player-friendly filter rather than silently pre-applying it (a
  // returning new-to-tabletop user browsing for something else shouldn't
  // have their filters overridden every visit). Only shown when the
  // filter isn't already on.
  const viewer = await getCurrentUser();
  const showNewPlayerPrompt =
    !newPlayerFriendly && !!viewer && !!getProfile(viewer.id).new_to_tabletop;
  // Backlog #27 phase 2: only fetched for the discover view, which is the
  // only place this is used -- the list view doesn't need it (see
  // DiscoverDeck.tsx's own comment on why the match itself has to be
  // computed client-side, in the viewer's own browser).
  const viewerAvailability = viewer && view === "discover" ? getAvailabilitySlots(viewer.id) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Browse campaigns</h1>
          <Link
            href="/systems"
            className="text-sm text-black/60 hover:text-brand hover:underline dark:text-white/60"
          >
            Browse by system
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex overflow-hidden rounded-lg border border-black/15 bg-surface text-sm font-medium dark:border-white/20">
            <Link
              href={{
                pathname: "/campaigns",
                query: { system, q, location, newPlayerFriendly, sessionFormat, toneTags, sort },
              }}
              className={`px-3 py-1.5 ${view === "list" ? "bg-black text-white dark:bg-white dark:text-black" : ""}`}
            >
              List
            </Link>
            <Link
              href={{
                pathname: "/campaigns",
                query: {
                  system,
                  q,
                  location,
                  newPlayerFriendly,
                  sessionFormat,
                  toneTags,
                  sort,
                  view: "discover",
                },
              }}
              className={`px-3 py-1.5 ${view === "discover" ? "bg-black text-white dark:bg-white dark:text-black" : ""}`}
            >
              Discover
            </Link>
          </div>
          <Link
            href="/campaigns/new"
            className="rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            Post a campaign
          </Link>
        </div>
      </div>

      <form
        className="flex flex-wrap items-end gap-4 rounded-2xl border border-black/10 bg-surface p-5 text-sm shadow-[var(--shadow-card)] dark:border-white/10"
        method="get"
      >
        <label className="flex flex-col gap-1 font-medium">
          Search
          <input
            name="q"
            defaultValue={q}
            placeholder="Keyword in title, description, or system"
            className="w-64 rounded-lg border border-black/20 px-3 py-1.5 dark:border-white/20 dark:bg-transparent"
          />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          System
          <input
            name="system"
            defaultValue={system}
            placeholder="e.g. D&D 5e"
            className="rounded-lg border border-black/20 px-3 py-1.5 dark:border-white/20 dark:bg-transparent"
          />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          Location
          <input
            name="location"
            defaultValue={location}
            placeholder="e.g. Austin or Online"
            className="rounded-lg border border-black/20 px-3 py-1.5 dark:border-white/20 dark:bg-transparent"
          />
        </label>
        <label className="flex flex-col gap-1 font-medium">
          Format
          <select
            name="sessionFormat"
            defaultValue={sessionFormat ?? ""}
            className="rounded-lg border border-black/20 px-3 py-1.5 dark:border-white/20 dark:bg-transparent"
          >
            <option value="">Any</option>
            {SESSION_FORMATS.map((format) => (
              <option key={format} value={format}>
                {SESSION_FORMAT_LABELS[format]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-medium">
          Sort
          <select
            name="sort"
            defaultValue={sort}
            className="rounded-lg border border-black/20 px-3 py-1.5 dark:border-white/20 dark:bg-transparent"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="title">Title (A-Z)</option>
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 font-medium">
          <input
            type="checkbox"
            name="newPlayerFriendly"
            value="true"
            defaultChecked={!!newPlayerFriendly}
          />
          New-player friendly only
        </label>
        <fieldset className="flex w-full flex-col gap-2">
          <legend className="font-medium">Tone / style (any of)</legend>
          <div className="flex flex-wrap gap-2">
            {CAMPAIGN_TONE_TAGS.map((tag) => (
              <label key={tag} className="cursor-pointer">
                <input
                  type="checkbox"
                  name="toneTags"
                  value={tag}
                  defaultChecked={toneTags.includes(tag)}
                  className="peer sr-only"
                />
                <span className="inline-block rounded-full border border-black/15 px-3 py-1 text-xs font-medium transition peer-checked:border-brand peer-checked:bg-brand-soft peer-checked:text-brand-strong peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 hover:border-black/40 dark:border-white/20">
                  {CAMPAIGN_TONE_TAG_LABELS[tag]}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <button
          type="submit"
          className="rounded-lg bg-black px-5 py-2 font-semibold text-white"
        >
          Apply filters
        </button>
      </form>

      {showNewPlayerPrompt && (
        <p className="text-sm text-black/60 dark:text-white/60">
          New to tabletop? Try{" "}
          <Link
            href={{
              pathname: "/campaigns",
              query: {
                system,
                q,
                location,
                sessionFormat,
                toneTags,
                sort,
                newPlayerFriendly: "true",
              },
            }}
            className="underline"
          >
            campaigns flagged new-player-friendly
          </Link>
          .
        </p>
      )}

      {items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-black/20 bg-surface-muted px-6 py-14 text-center dark:border-white/20">
          <p className="text-lg font-semibold">
            {q || system || location ? "No campaigns match your search." : "No campaigns here yet."}
          </p>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            Try loosening the filters, or be the first to post a table.
          </p>
          <Link
            href="/campaigns/new"
            className="mt-5 inline-flex rounded-lg bg-black px-5 py-2 text-sm font-semibold text-white"
          >
            Post a campaign
          </Link>
        </div>
      )}

      {view === "discover" ? (
        <DiscoverDeck
          cards={items.map(
            (campaign): DiscoverCard => ({
              id: campaign.id,
              title: campaign.title,
              description: campaign.description,
              system: campaign.system,
              location: campaign.location,
              danger_level: campaign.danger_level,
              session_format: campaign.session_format,
              starting_level: campaign.starting_level,
              tone_tags: campaign.tone_tags,
              new_player_friendly: campaign.new_player_friendly,
              accepting_requests: campaign.accepting_requests,
              cancelled: campaign.cancelled,
              capacity: campaign.capacity,
              headcount: approvedHeadcount(campaign.id),
              dmName: getUserById(campaign.dm_id)?.display_name ?? null,
              next_session_at: campaign.next_session_at,
            })
          )}
          viewerAvailability={viewerAvailability}
        />
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {items.map((campaign) => {
              const dm = getUserById(campaign.dm_id);
              const headcount = approvedHeadcount(campaign.id);
              return (
                <li
                  key={campaign.id}
                  className="flex flex-col gap-2 rounded-2xl border border-black/10 bg-surface p-5 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[var(--shadow-pop)] dark:border-white/10"
                >
                  <Link href={`/campaigns/${campaign.id}`} className="text-lg font-semibold hover:text-brand">
                    {campaign.title}
                  </Link>
                  <p className="text-sm text-black/60 dark:text-white/60">
                    {campaign.system} &middot; DM:{" "}
                    {dm ? (
                      <Link href={`/players/${dm.id}`} className="underline">
                        {dm.display_name}
                      </Link>
                    ) : (
                      "Unknown"
                    )}{" "}
                    &middot; {seatsLeftLabel(headcount, campaign.capacity)}
                    {!campaign.accepting_requests && " (closed to new requests)"}
                    {campaign.location && <> &middot; {campaign.location}</>}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {campaign.session_format && (
                    <span className="inline-block rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand-strong">
                      {SESSION_FORMAT_LABELS[campaign.session_format]}
                    </span>
                  )}
                  {campaign.starting_level && (
                    <span className="inline-block rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand-strong">
                      Starting level: {campaign.starting_level}
                    </span>
                  )}
                  {!!campaign.new_player_friendly && (
                    <span className="inline-block rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand-strong">
                      New-player friendly
                    </span>
                  )}
                  {campaign.tone_tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-block rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand-strong"
                    >
                      {CAMPAIGN_TONE_TAG_LABELS[tag]}
                    </span>
                  ))}
                  </div>
                  {campaign.description && (
                    <p className="line-clamp-3 text-sm text-black/75 dark:text-white/75">{campaign.description}</p>
                  )}
                </li>
              );
            })}
          </ul>

          {totalPages > 1 && (
            <div className="flex gap-2 text-sm">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <Link
                  key={p}
                  href={{
                    pathname: "/campaigns",
                    query: {
                      system,
                      q,
                      location,
                      newPlayerFriendly,
                      sessionFormat,
                      toneTags,
                      sort,
                      page: p,
                    },
                  }}
                  className={
                    p === page
                      ? "font-semibold underline"
                      : "text-black/60 hover:underline dark:text-white/60"
                  }
                >
                  {p}
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
