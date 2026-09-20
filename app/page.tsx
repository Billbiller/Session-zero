import Link from "next/link";
import { getCurrentUser } from "@/lib/currentUser";

// Backlog #60: home page redesign. Small inline icon set kept local to this
// file rather than pulling in an icon library -- this app has no such
// dependency today and the redesign is scoped to this one page.
function IconD20({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 2 21 7.5v9L12 22 3 16.5v-9L12 2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M12 2v9M12 11 3 7.5M12 11l9-3.5M12 11v11M12 11 3 16.5M12 11l9 5.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconCompass({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="m15 9-4 2-2 4 4-2 2-4Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconScroll({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M6 4h9a3 3 0 0 1 3 3v10a3 3 0 0 0 3 3M6 4a2 2 0 0 0-2 2v1a2 2 0 0 0 2 2M6 4v14a3 3 0 0 0 3 3h9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M9 9h6M9 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconTable({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M3 8h18l-1.5 3H4.5L3 8Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M6 11v9M18 11v9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default async function Home() {
  const user = await getCurrentUser();
  return (
    <div className="flex flex-col">
      {/* Hero. Full-bleed via the calc(50%-50vw) trick so it escapes the
          shared max-w-4xl/py-6 <main> container from app/layout.tsx --
          scoped to this page only, per backlog #60's "not a site-wide
          redesign" scope. */}
      <section className="relative -mt-6 mx-[calc(50%-50vw)] w-screen overflow-hidden px-4 py-16 sm:py-24">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-br from-amber-100 via-orange-50 to-rose-100 dark:from-amber-950 dark:via-neutral-950 dark:to-rose-950"
        />
        <div
          aria-hidden="true"
          className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-amber-300/40 blur-3xl motion-safe:animate-[home-blob-float_11s_ease-in-out_infinite] dark:bg-amber-500/20"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-rose-300/40 blur-3xl motion-safe:animate-[home-blob-float_13s_ease-in-out_infinite_-6s] dark:bg-rose-500/10"
        />

        <div className="relative mx-auto flex max-w-4xl flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between sm:gap-10">
          <div className="flex flex-col items-start gap-6">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white/70 px-3 py-1 text-xs font-medium text-black/60 backdrop-blur dark:border-white/10 dark:bg-black/30 dark:text-white/60">
              <IconD20 className="h-3.5 w-3.5" />
              Find your table
            </span>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              Session{" "}
              <span className="bg-gradient-to-r from-amber-600 to-rose-600 bg-clip-text text-transparent dark:from-amber-400 dark:to-rose-400">
                Zero
              </span>
            </h1>
            <p className="max-w-md text-lg text-black/70 dark:text-white/70">
              Find a D&D (or other tabletop) group, or post one you&apos;re running,
              and keep track of the campaign once you&apos;re in.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/campaigns"
                className="group inline-flex items-center rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:bg-white dark:text-black"
              >
                Browse campaigns
                <span aria-hidden="true" className="ml-1.5 transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </Link>
              {!user && (
                <Link
                  href="/signin"
                  className="inline-flex items-center rounded-lg border border-black/20 bg-white/70 px-5 py-2.5 text-sm font-medium backdrop-blur transition hover:-translate-y-0.5 hover:border-black/40 dark:border-white/20 dark:bg-black/30 dark:hover:border-white/40"
                >
                  Sign in
                </Link>
              )}
            </div>
          </div>

          <IconD20
            aria-hidden="true"
            className="hidden h-32 w-32 shrink-0 text-black/15 motion-safe:animate-[home-blob-float_9s_ease-in-out_infinite_-3s] sm:block dark:text-white/10"
          />
        </div>
      </section>

      {!user && (
        <div className="flex flex-col gap-10 pt-10">
          <div>
            <h2 className="text-lg font-semibold">What is Session Zero?</h2>
            <p className="mt-2 max-w-2xl text-sm text-black/60 dark:text-white/60">
              Session Zero is a matchmaking and campaign-tracking site for tabletop
              roleplaying groups -- D&D and anything else played around a real table.
              It&apos;s built around getting people into an actual, ongoing game rather
              than just browsing listings: once you&apos;re seated, the same campaign
              page becomes the place for scheduling, session notes, the party roster,
              and everything else the table needs between sessions.
            </p>
          </div>

          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <li className="group rounded-xl border border-black/10 p-5 transition hover:-translate-y-1 hover:shadow-md dark:border-white/10">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700 transition-transform group-hover:scale-110 dark:bg-amber-500/10 dark:text-amber-400">
                <IconCompass className="h-5 w-5" />
              </div>
              <p className="font-medium">Find a table</p>
              <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                Browse or search open campaigns by system, location, and schedule, and
                request to join the ones that fit.
              </p>
            </li>
            <li className="group rounded-xl border border-black/10 p-5 transition hover:-translate-y-1 hover:shadow-md dark:border-white/10">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-rose-100 text-rose-700 transition-transform group-hover:scale-110 dark:bg-rose-500/10 dark:text-rose-400">
                <IconScroll className="h-5 w-5" />
              </div>
              <p className="font-medium">Run your own</p>
              <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                Post a campaign you&apos;re DMing, set a capacity, and manage who joins
                as the roster fills in.
              </p>
            </li>
            <li className="group rounded-xl border border-black/10 p-5 transition hover:-translate-y-1 hover:shadow-md dark:border-white/10">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 transition-transform group-hover:scale-110 dark:bg-indigo-500/10 dark:text-indigo-400">
                <IconTable className="h-5 w-5" />
              </div>
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
