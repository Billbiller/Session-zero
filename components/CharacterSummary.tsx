import type { Character } from "@/lib/types";

/** Presentational-only display of a character's public fields — shared by
 * the editable "My characters" list on /profile and the read-only list on
 * /players/[id], so the two views can't drift apart. */
export default function CharacterSummary({ character }: { character: Character }) {
  return (
    <div className="flex gap-3">
      <span className="text-2xl leading-none" aria-hidden="true">
        {character.avatar_emoji}
      </span>
      <div className="flex flex-col gap-1">
        <p className="font-medium">
          {character.name}
          {character.archetype && (
            <span className="ml-2 text-xs font-normal text-black/60 dark:text-white/60">
              {character.archetype}
            </span>
          )}
        </p>
        {character.bio && <p className="text-sm">{character.bio}</p>}
        {character.backstory && (
          <p className="whitespace-pre-wrap text-sm text-black/70 dark:text-white/70">
            {character.backstory}
          </p>
        )}
      </div>
    </div>
  );
}
