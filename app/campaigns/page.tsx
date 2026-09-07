import Link from "next/link";
import { listCampaigns, approvedHeadcount, type CampaignSort } from "@/lib/campaigns";
import { getUserById } from "@/lib/auth";
import DiscoverDeck, { type DiscoverCard } from "@/components/DiscoverDeck";

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
    sort?: string;
    page?: string;
    view?: string;
  }>;
}) {
  const params = await searchParams;
  const system = params.system?.trim() || undefined;
  const q = params.q?.trim() || undefined;
  const location = params.location?.trim() || undefined;
  const sort = (params.sort as CampaignSort) || "newest";
  const page = Number(params.page || "1");
  const view = params.view === "discover" ? "discover" : "list";

  const { items, total } = listCampaigns({
    system,
    q,
    location,
    sort,
    page,
    pageSize: view === "discover" ? DISCOVER_BATCH_SIZE : PAGE_SIZE,
  });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
              href={{ pathname: "/campaigns", query: { system, q, location, sort } }}
              className={`px-3 py-1.5 ${view === "list" ? "bg-black text-white dark:bg-white dark:text-black" : ""}`}
            >
              List
            </Link>
            <Link
              href={{ pathname: "/campaigns", query: { system, q, location, sort, view: "discover" } }}
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
        <button
          type="submit"
          className="rounded border border-black/20 px-3 py-1.5 dark:border-white/20"
        >
          Apply
        </button>
      </form>

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
                    query: { system, q, location, sort, page: p },
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
