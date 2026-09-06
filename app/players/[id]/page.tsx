import { notFound } from "next/navigation";
import { getUserById } from "@/lib/auth";
import { getProfile, splitPreferredSystems } from "@/lib/profiles";
import { listCharactersForUser } from "@/lib/characters";
import { getCampaign } from "@/lib/campaigns";
import CharacterSummary from "@/components/CharacterSummary";

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

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">{user.display_name}</h1>

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
