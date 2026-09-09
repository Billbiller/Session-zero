import Link from "next/link";
import { getCurrentUser } from "@/lib/currentUser";

export default async function Home() {
  const user = await getCurrentUser();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Session Zero</h1>
      <p className="text-black/70 dark:text-white/70">
        Find a D&D (or other tabletop) group, or post one you&apos;re running,
        and keep track of the campaign once you&apos;re in.
      </p>
      <div className="flex gap-3">
        <Link
          href="/campaigns"
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Browse campaigns
        </Link>
        {!user && (
          <Link
            href="/signin"
            className="rounded border border-black/20 px-4 py-2 text-sm font-medium dark:border-white/20"
          >
            Sign in
          </Link>
        )}
      </div>

      {!user && (
        <div className="mt-4 flex flex-col gap-4 border-t border-black/10 pt-6 dark:border-white/10">
          <div>
            <h2 className="text-lg font-semibold">What is Session Zero?</h2>
            <p className="mt-1 max-w-2xl text-sm text-black/60 dark:text-white/60">
              Session Zero is a matchmaking and campaign-tracking site for tabletop
              roleplaying groups -- D&D and anything else played around a real table.
              It&apos;s built around getting people into an actual, ongoing game rather
              than just browsing listings: once you&apos;re seated, the same campaign
              page becomes the place for scheduling, session notes, the party roster,
              and everything else the table needs between sessions.
            </p>
          </div>

          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <li className="rounded border border-black/10 p-4 dark:border-white/10">
              <p className="font-medium">Find a table</p>
              <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                Browse or search open campaigns by system, location, and schedule, and
                request to join the ones that fit.
              </p>
            </li>
            <li className="rounded border border-black/10 p-4 dark:border-white/10">
              <p className="font-medium">Run your own</p>
              <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                Post a campaign you&apos;re DMing, set a capacity, and manage who joins
                as the roster fills in.
              </p>
            </li>
            <li className="rounded border border-black/10 p-4 dark:border-white/10">
              <p className="font-medium">Keep it going</p>
              <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                Session logs, party notes, ratings, and reminders live with the
                campaign, so the group has one shared home for as long as it runs.
              </p>
            </li>
          </ul>

          <p className="max-w-2xl text-xs text-black/50 dark:text-white/50">
            Session Zero is focused on helping real groups find each other and meet
            regularly -- it&apos;s a tool for organizing in-person-first play, not a
            place to play the game itself.
          </p>
        </div>
      )}
    </div>
  );
}
