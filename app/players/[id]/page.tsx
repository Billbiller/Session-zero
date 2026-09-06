import { notFound } from "next/navigation";
import { getUserById } from "@/lib/auth";
import { getProfile, splitPreferredSystems } from "@/lib/profiles";
import { listCharactersForUser } from "@/lib/characters";
import { getCampaign } from "@/lib/campaigns";
import { getUserRatingSummary } from "@/lib/ratings";
import CharacterSummary from "@/components/CharacterSummary";

function reputationLine(label: string, summary: { average: number | null; count: number; tagCounts: Record<string, number> }) {
  const topTags = Object.entries(summary.tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => tag);
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-medium">{label}</p>
      {summary.count === 0 ? (
        <p className="text-sm text-black/60 dark:text-white/60">Unrated so far</p>
      ) : (
        <>
          <p className="text-sm">
            {"★".repeat(Math.round(summary.average ?? 0))}
            {"☆".repeat(5 - Math.round(summary.average ?? 0))}{" "}
            <span className="text-black/60 dark:text-white/60">
              {(summary.average ?? 0).toFixed(1)} ({summary.count} rating{summary.count === 1 ? "" : "s"})
            </span>
          </p>
          {topTags.length > 0 && (
            <p className="text-xs text-black/60 dark:text-white/60">{topTags.join(" · ")}</p>
          )}
        </>
      )}
    </div>
  );
}

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = getUserById(id);
  if (!user) notFound();

  const profile = getProfile(id);
  const systems = splitPreferredSystems(profile.preferred_systems);
  const characters = listCharactersForUser(id);
  const ratingSummary = getUserRatingSummary(id);

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">{user.display_name}</h1>

      <div className="flex flex-col gap-3 rounded border border-black/10 p-3 dark:border-white/10 sm:flex-row sm:gap-6">
        {reputationLine("As DM", ratingSummary.asDm)}
        {reputationLine("As player", ratingSummary.asPlayer)}
      </div>

      {profile.bio ? (
        <p className="text-sm">{profile.bio}</p>
      ) : (
        <p className="text-sm text-black/60 dark:text-white/60">No bio yet.</p>
      )}

      {systems.length > 0 && (
        <div>
          <h2 className="text-sm font-medium">Preferred systems</h2>
          <ul className="mt-1 flex flex-wrap gap-2">
            {systems.map((s) => (
              <li
                key={s}
                className="rounded-full border border-black/10 px-2 py-0.5 text-xs dark:border-white/10"
              >
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {profile.availability && (
        <div>
          <h2 className="text-sm font-medium">Availability</h2>
          <p className="text-sm">{profile.availability}</p>
        </div>
      )}

      {characters.length > 0 && (
        <div>
          <h2 className="text-sm font-medium">Characters</h2>
          <ul className="mt-2 flex flex-col gap-3">
            {characters.map((c) => {
              const campaign = c.campaign_id ? getCampaign(c.campaign_id) : null;
              return (
                <li key={c.id} className="border-t border-black/10 pt-3 dark:border-white/10">
                  <CharacterSummary
                    character={c}
                    linkedCampaign={campaign ? { id: campaign.id, title: campaign.title } : null}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
