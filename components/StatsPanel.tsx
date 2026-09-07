import type { UserStats } from "@/lib/types";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col">
      <span className="text-lg font-semibold">{value}</span>
      <span className="text-xs text-black/60 dark:text-white/60">{label}</span>
    </div>
  );
}

/** A "year in review"-style stats block — sessions run/played, systems
 * tried, and the longest campaign, all derived from data this app already
 * tracks (session log entries, memberships, characters). Presentational
 * only, no data fetching of its own, so it renders identically whether the
 * caller is a server component (the public /players/[id] page) or a client
 * component (the self-editable /profile page). Renders unconditionally,
 * even for a brand-new user with all-zero stats, rather than hiding itself
 * — an empty dashboard is still useful context ("nothing logged yet"). */
export default function StatsPanel({ stats }: { stats: UserStats }) {
  return (
    <div className="rounded border border-black/10 p-3 dark:border-white/10">
      <h2 className="mb-2 text-sm font-medium">Stats</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Campaigns DMed" value={stats.campaignsAsDm} />
        <Stat label="Campaigns played" value={stats.campaignsAsPlayer} />
        <Stat label="Sessions run" value={stats.sessionsRun} />
        <Stat label="Sessions played" value={stats.sessionsPlayed} />
        <Stat label="Characters created" value={stats.charactersCreated} />
        <Stat label="Systems tried" value={stats.systemsPlayed.length} />
      </div>
      {stats.mostPlayedSystem && (
        <p className="mt-3 text-xs text-black/60 dark:text-white/60">
          Most played system: <span className="font-medium text-black dark:text-white">{stats.mostPlayedSystem}</span>
        </p>
      )}
      {stats.longestCampaign && (
        <p className="mt-1 text-xs text-black/60 dark:text-white/60">
          Longest-running campaign:{" "}
          <span className="font-medium text-black dark:text-white">{stats.longestCampaign.title}</span>{" "}
          ({stats.longestCampaign.sessionCount} session{stats.longestCampaign.sessionCount === 1 ? "" : "s"} logged)
        </p>
      )}
    </div>
  );
}
