import Link from "next/link";
import { listCampaigns, approvedHeadcount, type CampaignSort } from "@/lib/campaigns";
import { getUserById } from "@/lib/auth";
import { getCurrentUser } from "@/lib/currentUser";
import { getProfile } from "@/lib/profiles";
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Browse campaigns</h1>
          <Link
            href="/systems"
            className="text-sm text-black/60 hover:underline dark:text-white/60"
          >
            Browse by system
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded border border-black/20 text-sm dark:border-white/20">
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
            className="rounded bg-black px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            Post a campaign
          </Link>
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-3 text-sm" method="get">
        <label className="flex flex-col gap-1">
          Search
          <input
            name="q"
            defaultValue={q}
            placeholder="Keyword in title, description, or system"
            className="w-64 rounded border border-black/20 px-3 py-1.5 dark:border-white/20 dark:bg-transparent"
          />
        </label>
        <label className="flex flex-col gap-1">
          System
          <input
            name="system"
            defaultValue={system}
            placeholder="e.g. D&D 5e"
            className="rounded border border-black/20 px-3 py-1.5 dark:border-white/20 dark:bg-transparent"
          />
        </label>
        <label className="flex flex-col gap-1">
          Location
          <input
            name="location"
            defaultValue={location}
            placeholder="e.g. Austin or Online"
            className="rounded border border-black/20 px-3 py-1.5 dark:border-white/20 dark:bg-transparent"
          />
        </label>
        <label className="flex flex-col gap-1">
          Format
          <select
            name="sessionFormat"
            defaultValue={sessionFormat ?? ""}
            className="rounded border border-black/20 px-3 py-1.5 dark:border-white/20 dark:bg-transparent"
          >
            <option value="">Any</option>
            {SESSION_FORMATS.map((format) => (
              <option key={format} value={format}>
                {SESSION_FORMAT_LABELS[format]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Sort
          <select
            name="sort"
            defaultValue={sort}
            className="rounded border border-black/20 px-3 py-1.5 dark:border-white/20 dark:bg-transparent"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="title">Title (A-Z)</option>
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2">
          <input
            type="checkbox"
            name="newPlayerFriendly"
            value="true"
            defaultChecked={!!newPlayerFriendly}
          />
          New-player friendly only
        </label>
        <fieldset className="flex flex-col gap-1">
          <legend>Tone / style (any of)</legend>
          <div className="flex flex-wrap gap-3">
            {CAMPAIGN_TONE_TAGS.map((tag) => (
              <label key={tag} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  name="toneTags"
                  value={tag}
                  defaultChecked={toneTags.includes(tag)}
                />
                {CAMPAIGN_TONE_TAG_LABELS[tag]}
              </label>
            ))}
          </div>
        </fieldset>
        <button
          type="submit"
          className="rounded border border-black/20 px-3 py-1.5 dark:border-white/20"
        >
          Apply
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
        <p className="text-sm text-black/60 dark:text-white/60">
          {q || system || location ? "No campaigns match your search." : "No campaigns match yet."}
        </p>
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
            })
          )}
        />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {items.map((campaign) => {
              const dm = getUserById(campaign.dm_id);
              const headcount = approvedHeadcount(campaign.id);
              return (
                <li
                  key={campaign.id}
                  className="rounded border border-black/10 p-4 dark:border-white/10"
                >
                  <Link href={`/campaigns/${campaign.id}`} className="font-medium hover:underline">
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
                    &middot; {headcount}/{campaign.capacity} players
                    {!campaign.accepting_requests && " (closed to new requests)"}
                    {campaign.location && <> &middot; {campaign.location}</>}
                  </p>
                  {campaign.session_format && (
                    <span className="mt-1 inline-block rounded-full border border-black/20 px-2 py-0.5 text-xs dark:border-white/20">
                      {SESSION_FORMAT_LABELS[campaign.session_format]}
                    </span>
                  )}
                  {campaign.starting_level && (
                    <span className="mt-1 ml-2 inline-block rounded-full border border-black/20 px-2 py-0.5 text-xs dark:border-white/20">
                      Starting level: {campaign.starting_level}
                    </span>
                  )}
                  {!!campaign.new_player_friendly && (
                    <span className="mt-1 ml-2 inline-block rounded-full border border-black/20 px-2 py-0.5 text-xs dark:border-white/20">
                      New-player friendly
                    </span>
                  )}
                  {campaign.tone_tags.map((tag) => (
                    <span
                      key={tag}
                      className="mt-1 ml-2 inline-block rounded-full border border-black/20 px-2 py-0.5 text-xs dark:border-white/20"
                    >
                      {CAMPAIGN_TONE_TAG_LABELS[tag]}
                    </span>
                  ))}
                  {campaign.description && (
                    <p className="mt-1 text-sm">{campaign.description}</p>
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
