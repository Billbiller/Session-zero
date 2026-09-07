import Link from "next/link";
import { notFound } from "next/navigation";
import { getCuratedSystem, campaignsForSystem } from "@/lib/systems";
import { approvedHeadcount } from "@/lib/campaigns";
import { getUserById } from "@/lib/auth";

const PAGE_SIZE = 10;

export default async function SystemHubPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const system = getCuratedSystem(slug);
  if (!system) notFound();

  const { page: pageParam } = await searchParams;
  const page = Number(pageParam || "1");
  const result = campaignsForSystem(slug, { page, pageSize: PAGE_SIZE, sort: "newest" });
  if (!result) notFound();
  const { items, total } = result;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/systems" className="text-sm text-black/60 hover:underline dark:text-white/60">
          &larr; All systems
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{system.name}</h1>
        <p className="mt-1 max-w-2xl text-sm text-black/60 dark:text-white/60">
          {system.description}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-black/60 dark:text-white/60">
          {total} campaign{total === 1 ? "" : "s"} matching this system
        </p>
        <Link
          href={{ pathname: "/campaigns", query: { system: system.name } }}
          className="text-sm underline"
        >
          Search all campaigns instead
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-black/60 dark:text-white/60">
          No {system.name} campaigns posted yet.{" "}
          <Link href="/campaigns/new" className="underline">
            Be the first to post one
          </Link>
          .
        </p>
      ) : (
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
                {campaign.description && <p className="mt-1 text-sm">{campaign.description}</p>}
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex gap-2 text-sm">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={{ pathname: `/systems/${slug}`, query: { page: p } }}
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

      <div className="rounded border border-dashed border-black/20 p-4 text-sm dark:border-white/20">
        Running something else, or a homebrew system? Every system is welcome --{" "}
        <Link href="/campaigns" className="underline">
          browse or post to the full campaign list
        </Link>
        .
      </div>
    </div>
  );
}
