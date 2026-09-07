import Link from "next/link";
import { getCurrentUser } from "@/lib/currentUser";
import { listFeed } from "@/lib/feed";
import { followingCount } from "@/lib/follows";

const PAGE_SIZE = 20;

/** Backlog #38: a signed-in user's activity feed -- recent public events
 * from people they follow, newest first, paginated the same way
 * /boards/[slug] paginates threads (a page query param + numbered links,
 * server-rendered directly off the lib function rather than a client
 * fetch + API route, matching the read-only "browse" convention already
 * used by /boards and /systems). Only ever shows events recorded by
 * lib/feed.ts's recordX functions -- see that file and lib/db.ts's
 * feed_events table comment for the privacy-boundary reasoning on why
 * this can never include session log/party notes/chat content. */
export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const viewer = await getCurrentUser();

  if (!viewer) {
    return (
      <div className="flex max-w-lg flex-col gap-4">
        <h1 className="text-2xl font-semibold">Feed</h1>
        <p className="text-sm">
          <Link href="/signin" className="underline">
            Sign in
          </Link>{" "}
          to see updates from people you follow.
        </p>
      </div>
    );
  }

  const { page: pageParam } = await searchParams;
  const page = Number(pageParam || "1");
  const { items, total } = listFeed(viewer.id, { page, pageSize: PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const followCount = followingCount(viewer.id);

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Feed</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Public updates from the {followCount} player{followCount === 1 ? "" : "s"} you follow.
        </p>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-black/60 dark:text-white/60">
          {followCount === 0
            ? "You're not following anyone yet -- visit a player's profile to follow them."
            : "Nothing to show yet. Check back once the people you follow have something new."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((event) => (
            <li key={event.id} className="rounded border border-black/10 p-3 text-sm dark:border-white/10">
              <p>
                <Link href={`/players/${event.actor_id}`} className="font-medium hover:underline">
                  {event.actorName}
                </Link>{" "}
                {event.message}
              </p>
              <p className="mt-1 flex items-center gap-2 text-xs text-black/50 dark:text-white/50">
                <span>{new Date(event.created_at).toLocaleString()}</span>
                {event.campaign_id && (
                  <>
                    &middot;{" "}
                    <Link href={`/campaigns/${event.campaign_id}`} className="underline">
                      View campaign
                    </Link>
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex gap-2 text-sm">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={{ pathname: "/feed", query: { page: p } }}
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
