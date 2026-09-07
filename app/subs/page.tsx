import Link from "next/link";
import { listOpenSubRequests } from "@/lib/subRequests";
import { getCurrentUser } from "@/lib/currentUser";
import SubVolunteerAction from "@/components/SubVolunteerAction";

/** The app-wide browsable volunteer pool -- phase 1 of backlog #20. Every
 * currently-open "looking for a sub" request across every campaign, in
 * one place, so someone doesn't have to already know a campaign exists to
 * offer to help it out for a session. Posting a request happens from the
 * campaign's own page (SubRequestPanel), since only a DM or active member
 * of that campaign has a session to fill. */
export default async function SubsPage() {
  const viewer = await getCurrentUser();
  const requests = listOpenSubRequests(viewer?.id ?? null);

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Looking for a sub</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Campaigns across Session Zero that need someone to fill in for a session.
        </p>
      </div>

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
          </li>
        )}
      </ul>
    </div>
  );
}
