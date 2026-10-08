import Link from "next/link";
import { getCurrentUser } from "@/lib/currentUser";
import { getUserById } from "@/lib/auth";
import { approvedHeadcount, listSpotlightCampaigns } from "@/lib/campaigns";
import { seatsLeftLabel } from "@/lib/campaignCardCopy";

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

const FEATURES = [
  {
    title: "Find a table",
    copy: "Browse or search open campaigns by system, location, tone and schedule, then request a seat at the ones that fit.",
    Icon: IconCompass,
    tint: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  },
  {
    title: "Run your own",
    copy: "Post the campaign you're DMing, set a capacity and manage who joins as the roster fills in.",
    Icon: IconScroll,
    tint: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300",
  },
  {
    title: "Keep it going",
    copy: "Session logs, party notes, initiative, ratings and reminders live with the campaign -- one shared home for as long as it runs.",
    Icon: IconTable,
    tint: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  },
];

const STEPS = [
  { n: "1", title: "Create a profile", copy: "Tell us what you play, when you're free and how you like your games." },
  { n: "2", title: "Match with a table", copy: "Discover campaigns that fit your schedule and style, and send a request." },
  { n: "3", title: "Play, regularly", copy: "Schedule sessions, RSVP, log what happened and never lose track of the plot." },
];

const MEMBER_LINKS = [
  { href: "/campaigns", title: "Browse campaigns", copy: "Find an open seat at a table." },
  { href: "/profile", title: "My campaigns", copy: "Your tables, sessions and chat." },
  { href: "/campaigns/new", title: "Post a campaign", copy: "Recruit players for your game." },
  { href: "/subs", title: "Find a sub", copy: "Cover a session or pick one up." },
  { href: "/dice", title: "Dice roller", copy: "Roll anything, share the result." },
  { href: "/feed", title: "Feed", copy: "What your followed tables are up to." },
];

export default async function Home() {
  const user = await getCurrentUser();
  // Backlog #68: admin-curated spotlight campaigns, shown to signed-out
  // visitors only (same audience as the intro copy below). Empty = the
  // section doesn't render at all.
  const spotlight = user ? [] : listSpotlightCampaigns();
  return (
    <div className="flex flex-col">
      {/* Hero. Full-bleed via the calc(50%-50vw) trick so it escapes the
          shared max-w-6xl <main> container from app/layout.tsx. */}
      <section className="relative -mt-8 mx-[calc(50%-50vw)] w-screen overflow-hidden px-4 py-16 sm:-mt-10 sm:py-24">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-br from-violet-100 via-background to-fuchsia-100 dark:from-violet-950 dark:via-background dark:to-fuchsia-950/60"
        />
        <div
          aria-hidden="true"
          className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-violet-400/30 blur-3xl motion-safe:animate-[home-blob-float_11s_ease-in-out_infinite] dark:bg-violet-500/20"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-fuchsia-300/40 blur-3xl motion-safe:animate-[home-blob-float_13s_ease-in-out_infinite_-6s] dark:bg-fuchsia-500/10"
        />

        <div className="relative mx-auto flex max-w-6xl flex-col items-start gap-8 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
          <div className="flex max-w-xl flex-col items-start gap-6">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white/70 px-3 py-1 text-xs font-medium text-black/70 backdrop-blur dark:border-white/10 dark:bg-black/30 dark:text-white/70">
              <IconD20 className="h-3.5 w-3.5" />
              Tabletop matchmaking &amp; campaign tracking
            </span>
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl">
              {user ? "Welcome back to " : "Find your "}
              <span className="bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent dark:from-violet-300 dark:to-fuchsia-300">
                {user ? "Session Zero" : "table."}
              </span>
            </h1>
            <p className="text-lg text-black/70 dark:text-white/70">
              Find a D&amp;D (or other tabletop) group, or post one you&apos;re running,
              and keep track of the campaign once you&apos;re in.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/campaigns"
                className="group inline-flex items-center rounded-xl bg-black px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5"
              >
                Browse campaigns
                <span aria-hidden="true" className="ml-1.5 transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </Link>
              <Link
                href={user ? "/campaigns/new" : "/signin"}
                className="inline-flex items-center rounded-xl border border-black/15 bg-white/70 px-6 py-3 text-sm font-semibold backdrop-blur transition hover:-translate-y-0.5 hover:border-black/35 dark:border-white/20 dark:bg-black/30 dark:hover:border-white/40"
              >
                {user ? "Post a campaign" : "Sign in"}
              </Link>
            </div>
          </div>

          <div aria-hidden="true" className="relative hidden shrink-0 lg:block">
            <div className="grid h-56 w-56 place-items-center rounded-[2rem] border border-white/60 bg-white/50 shadow-[var(--shadow-pop)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
              <IconD20 className="h-32 w-32 text-violet-600/80 motion-safe:animate-[home-blob-float_9s_ease-in-out_infinite_-3s] dark:text-violet-300/80" />
            </div>
          </div>
        </div>
      </section>

      {user ? (
        <section className="pt-10" aria-labelledby="quick-heading">
          <h2 id="quick-heading" className="text-xl font-bold">
            Jump back in
          </h2>
          <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MEMBER_LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="group flex h-full flex-col rounded-2xl border border-black/10 bg-surface p-5 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-[var(--shadow-pop)] dark:border-white/10"
                >
                  <span className="font-semibold">
                    {l.title}
                    <span aria-hidden="true" className="ml-1 inline-block text-brand transition-transform group-hover:translate-x-1">
                      →
                    </span>
                  </span>
                  <span className="mt-1 text-sm text-black/60 dark:text-white/60">{l.copy}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <div className="flex flex-col gap-16 pt-14">
          <ul className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {FEATURES.map(({ title, copy, Icon, tint }) => (
              <li
                key={title}
                className="group rounded-2xl border border-black/10 bg-surface p-6 shadow-[var(--shadow-card)] transition hover:-translate-y-1 hover:shadow-[var(--shadow-pop)] dark:border-white/10"
              >
                <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl transition-transform group-hover:scale-110 ${tint}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <h2 className="text-lg font-semibold">{title}</h2>
                <p className="mt-1.5 text-sm text-black/65 dark:text-white/65">{copy}</p>
              </li>
            ))}
          </ul>

          {spotlight.length > 0 && (
            <section aria-labelledby="spotlight-heading">
              <h2 id="spotlight-heading" className="text-2xl font-bold">
                Spotlight
              </h2>
              <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                Open tables hand-picked by the Session Zero team.
              </p>
              <ul className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {spotlight.map((campaign) => {
                  const dm = getUserById(campaign.dm_id);
                  return (
                    <li
                      key={campaign.id}
                      className="flex flex-col gap-1.5 rounded-2xl border border-violet-300/60 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-5 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-pop)] dark:border-violet-400/30 dark:from-violet-500/10 dark:to-fuchsia-500/5"
                    >
                      <Link href={`/campaigns/${campaign.id}`} className="font-semibold hover:underline">
                        {campaign.title}
                      </Link>
                      <p className="text-sm text-black/65 dark:text-white/65">
                        {campaign.system}
                        {dm && <> &middot; DM: {dm.display_name}</>}
                      </p>
                      <p className="text-xs text-black/60 dark:text-white/60">
                        {seatsLeftLabel(approvedHeadcount(campaign.id), campaign.capacity)}
                        {campaign.location && <> &middot; {campaign.location}</>}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section aria-labelledby="how-heading">
            <h2 id="how-heading" className="text-2xl font-bold">
              How it works
            </h2>
            <ol className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-3">
              {STEPS.map((st) => (
                <li key={st.n} className="rounded-2xl bg-surface-muted p-6">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-brand text-sm font-bold text-white">
                    {st.n}
                  </span>
                  <h3 className="mt-3 font-semibold">{st.title}</h3>
                  <p className="mt-1 text-sm text-black/65 dark:text-white/65">{st.copy}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-3xl bg-gradient-to-br from-violet-600 to-fuchsia-600 px-6 py-12 text-center text-white shadow-[var(--shadow-pop)] sm:px-12">
            <h2 className="text-2xl font-bold sm:text-3xl">Ready to roll initiative?</h2>
            <p className="mx-auto mt-2 max-w-xl text-white/85">
              Session Zero is built around getting people into an actual, ongoing game --
              in-person-first, with one shared home for the group between sessions.
            </p>
            <Link
              href="/signin"
              className="mt-6 inline-flex rounded-xl bg-white px-6 py-3 text-sm font-semibold text-violet-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              Create your account
            </Link>
          </section>
        </div>
      )}
    </div>
  );
}
