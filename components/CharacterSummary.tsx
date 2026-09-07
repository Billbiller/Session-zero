import Link from "next/link";
import { CHARACTER_STATUS_LABELS, type Character } from "@/lib/types";

/** Presentational-only display of a character's public fields — shared by
 * the editable "My characters" list on /profile, the read-only list on
 * /players/[id], and the read-only "characters at this table" list on a
 * campaign's page, so none of the three views can drift apart.
 *
 * linkedCampaign is optional context about the campaign a character is
 * attached to (if any) — omitted entirely on the campaign's own page
 * (redundant there), shown as a link back to that campaign everywhere
 * else (the profile and public-player views). */
export default function CharacterSummary({
  character,
  linkedCampaign,
}: {
  character: Character;
  linkedCampaign?: { id: string; title: string } | null;
}) {
  return (
    <div className="flex gap-3">
      {character.portrait_data_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- data: URL can't use next/image's optimizer.
        <img
          src={character.portrait_data_url}
          alt=""
          className="h-10 w-10 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span className="text-2xl leading-none" aria-hidden="true">
          {character.avatar_emoji}
        </span>
      )}
      <div className="flex flex-col gap-1">
        <p className="font-medium">
          {character.name}
          {character.archetype && (
            <span className="ml-2 text-xs font-normal text-black/60 dark:text-white/60">
              {character.archetype}
            </span>
          )}
          {character.status !== "active" && (
            <span
              className={`ml-2 rounded-full border px-2 py-0.5 text-xs font-normal ${
                character.status === "fallen"
                  ? "border-red-300 text-red-700 dark:border-red-800 dark:text-red-300"
                  : "border-black/20 text-black/60 dark:border-white/20 dark:text-white/60"
              }`}
            >
              {CHARACTER_STATUS_LABELS[character.status]}
            </span>
          )}
        </p>
        {linkedCampaign && (
          <p className="text-xs text-black/60 dark:text-white/60">
            Playing in{" "}
            <Link href={`/campaigns/${linkedCampaign.id}`} className="underline">
              {linkedCampaign.title}
            </Link>
          </p>
        )}
        {character.bio && <p className="text-sm">{character.bio}</p>}
        {character.backstory && (
          <p className="whitespace-pre-wrap text-sm text-black/70 dark:text-white/70">
            {character.backstory}
          </p>
        )}
        {character.status !== "active" && character.epilogue && (
          <p className="whitespace-pre-wrap text-sm italic text-black/70 dark:text-white/70">
            {character.epilogue}
          </p>
        )}
      </div>
    </div>
  );
}
