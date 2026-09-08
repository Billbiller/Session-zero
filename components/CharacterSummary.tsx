import Link from "next/link";
import { CHARACTER_STATUS_LABELS, type Character } from "@/lib/types";
import EndSubButton from "./EndSubButton";

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
  pilotName,
  canEndSub,
  onEndSubDone,
  hideSheetLink,
}: {
  character: Character;
  linkedCampaign?: { id: string; title: string } | null;
  /** Display name of whoever is currently piloting this character in the
   * owner's place (backlog #20 phase 2), if the caller has resolved one.
   * Omitted/undefined when the caller doesn't track this (e.g. contexts
   * that pre-date phase 2); character.temp_pilot_user_id is still checked
   * on its own so the badge still shows even without a resolved name. */
  pilotName?: string | null;
  /** Shows an "End sub" button next to the pilot badge when true -- the
   * caller decides this (the character's owner or the campaign's DM), not
   * this component. Rendered via a dedicated client component
   * (EndSubButton) rather than a callback prop, since this component is
   * used directly from Server Components (the campaign page, the public
   * player page) that can't pass event-handler functions as props. */
  canEndSub?: boolean;
  /** Passed through to EndSubButton for a client-side caller
   * (CharacterManager) that wants to re-load its own state instead of a
   * full router.refresh(). */
  onEndSubDone?: () => void;
  /** Backlog #49: suppresses the "View / print character sheet" link --
   * set by the character sheet page itself (app/characters/[id]/page.tsx)
   * so it doesn't link to itself, the same "omit when redundant here"
   * pattern linkedCampaign's own doc comment already established. Always
   * print:hidden regardless, since it's app navigation, not character
   * content -- it has no business appearing on a printed sheet. */
  hideSheetLink?: boolean;
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
        {character.temp_pilot_user_id && (
          <p className="text-xs text-black/60 dark:text-white/60">
            Currently piloted by {pilotName ?? "someone"} for a session
            {canEndSub && (
              <EndSubButton characterId={character.id} onDone={onEndSubDone} />
            )}
          </p>
        )}
        {linkedCampaign && (
          <p className="text-xs text-black/60 dark:text-white/60">
            Playing in{" "}
            <Link href={`/campaigns/${linkedCampaign.id}`} className="underline">
              {linkedCampaign.title}
            </Link>
          </p>
        )}
        {!hideSheetLink && (
          <p className="text-xs print:hidden">
            <Link href={`/characters/${character.id}`} className="underline">
              View / print character sheet
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
