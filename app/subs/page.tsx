import Link from "next/link";
import { listOpenSubRequests, type SubRequestSort } from "@/lib/subRequests";
import { getCurrentUser } from "@/lib/currentUser";
import SubVolunteerAction from "@/components/SubVolunteerAction";

/** The app-wide browsable volunteer pool -- phase 1 of backlog #20. Every
 * currently-open "looking for a sub" request across every campaign, in
 * one place, so someone doesn't have to already know a campaign exists to
 * offer to help it out for a session. Posting a request happens from the
 * campaign's own page (SubRequestPanel), since only a DM or active member
 * of that campaign has a session to fill.
 *
 * Backlog #51: as the pool grows, "newest posted" alone said nothing
 * about which requests are actually time-sensitive. Defaults to
 * soonest-needed-first with past-due requests hidden (both explicit
 * opt-outs via query params, matching /campaigns' filter-form
 * conventions), rather than silently pre-filtering with no way back. */
export default async function SubsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; includePastDue?: string }>;
}) {
  const params = await searchParams;
  const sort: SubRequestSort = params.sort === "newest" ? "newest" : "soonest";
  const includePastDue = params.includePastDue === "true";

  const viewer = await getCurrentUser();
  const requests = listOpenSubRequests(viewer?.id ?? null, { sort, includePastDue });

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Looking for a sub</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Campaigns across Session Zero that need someone to fill in for a session.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3 text-sm" method="get">
        <label className="flex flex-col gap-1">
          Sort
          <select
            name="sort"
            defaultValue={sort}
            className="rounded border border-black/20 px-3 py-1.5 dark:border-white/20 dark:bg-transparent"
          >
            <option value="soonest">Soonest needed</option>
            <option value="newest">Newest posted</option>
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2">
          <input type="checkbox" name="includePastDue" value="true" defaultChecked={includePastDue} />
          Show past-due requests
        </label>
        <button
          type="submit"
          className="rounded border border-black/20 px-3 py-1.5 dark:border-white/20"
        >
          Apply
        </button>
      </form>

      <ul className="flex flex-col gap-4 text-sm">
        {requests.map((r) => (
          <li key={r.id} className="rounded border border-black/10 p-3 dark:border-white/10">
            <p className="font-medium">
              <Link href={`/campaigns/${r.campaign_id}`} className="underline">
                {r.campaignTitle}
              </Link>{" "}
              <span className="font-normal text-black/60 dark:text-white/60">
                &middot; {r.campaignSystem}
              </span>
            </p>
            <p className="text-xs text-black/60 dark:text-white/60">
              Requested by{" "}
              <Link href={`/players/${r.requester_id}`} className="underline">
                {r.requesterName}
              </Link>
            </p>
            {r.needed_at && (
              <p className="mt-2 text-xs text-black/60 dark:text-white/60">
                Needed for: {new Date(r.needed_at).toLocaleString()}
                {r.neededAtStatus === "past-due" && (
                  <span className="ml-1 text-red-600">(past due)</span>
                )}
              </p>
            )}
            {(r.location || r.campaignLocation) && (
              <p className="mt-1 text-xs text-black/60 dark:text-white/60">
                Location: {r.location || r.campaignLocation}
                {!r.location && " (campaign default)"}
              </p>
            )}
            {r.note && <p className="mt-2">{r.note}</p>}
            <p className="mt-1 text-xs text-black/60 dark:text-white/60">
              {r.volunteerCount} volunteer{r.volunteerCount === 1 ? "" : "s"} so far
            </p>
            <div className="mt-2">
              <SubVolunteerAction
                requestId={r.id}
                signedIn={!!viewer}
                initialHasVolunteered={r.viewerHasVolunteered}
              />
            </div>
          </li>
        ))}
        {requests.length === 0 && (
          <li className="text-black/60 dark:text-white/60">
            No open sub requests right now — check back later, or post one from your own
            campaign&apos;s page if you need a sub yourself.
            {!includePastDue && (
              <>
                {" "}
                (Past-due requests are hidden by default —{" "}
                <Link href={{ pathname: "/subs", query: { sort, includePastDue: "true" } }} className="underline">
                  show them
                </Link>
                .)
              </>
            )}
          </li>
        )}
      </ul>
    </div>
  );
}
