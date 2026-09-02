import Link from "next/link";
import { listCampaigns, approvedHeadcount, type CampaignSort } from "@/lib/campaigns";
import { getUserById } from "@/lib/auth";

const PAGE_SIZE = 10;

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ system?: string; sort?: string; page?: string }>;
}) {
  const params = await searchParams;
  const system = params.system?.trim() || undefined;
  const sort = (params.sort as CampaignSort) || "newest";
  const page = Number(params.page || "1");

  const { items, total } = listCampaigns({ system, sort, page, pageSize: PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Browse campaigns</h1>
        <Link
          href="/campaigns/new"
          className="rounded bg-black px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Post a campaign
        </Link>
      </div>

      <form className="flex flex-wrap items-end gap-3 text-sm" method="get">
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
          No campaigns match yet.
        </p>
      )}

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
                {campaign.system} &middot; DM: {dm?.display_name ?? "Unknown"} &middot;{" "}
                {headcount}/{campaign.capacity} players
                {!campaign.accepting_requests && " (closed to new requests)"}
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
                query: { system, sort, page: p },
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
    </div>
  );
}
