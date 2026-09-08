import { notFound } from "next/navigation";
import Link from "next/link";
import { getCharacter } from "@/lib/characters";
import { getUserById } from "@/lib/auth";
import { getCampaign } from "@/lib/campaigns";
import CharacterSummary from "@/components/CharacterSummary";
import PrintButton from "@/components/PrintButton";

/** Backlog #49: a dedicated, printable/exportable view of a single
 * character -- reachable from the "View / print character sheet" link
 * CharacterSummary now carries everywhere it renders (profile, public
 * player page, campaign page, sub-request panel). No auth/access check:
 * a character's own fields are already fully public via /players/[id]
 * (see CharacterSummary's own doc comment), so this page just gives that
 * same already-public data its own URL and a print-friendly layout,
 * mirroring how backlog #46's .ics export re-serves already-visible
 * schedule data as a downloadable file. */
export default async function CharacterSheetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const character = getCharacter(id);
  if (!character) notFound();

  const owner = getUserById(character.user_id);
  const campaign = character.campaign_id ? getCampaign(character.campaign_id) : null;
  const pilot = character.temp_pilot_user_id
    ? getUserById(character.temp_pilot_user_id)
    : null;

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link
          href={owner ? `/players/${owner.id}` : "/"}
          className="text-sm underline"
        >
          &larr; Back to {owner ? owner.display_name : "player"}&apos;s profile
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <PrintButton />
          <a href={`/api/characters/${character.id}/export`} className="underline">
            Download as text
          </a>
        </div>
      </div>

      <div className="rounded border border-black/10 p-4 dark:border-white/10 print:border-0 print:p-0">
        <p className="mb-3 text-xs text-black/60 dark:text-white/60">
          Character sheet{owner ? ` — played by ${owner.display_name}` : ""}
        </p>
        <CharacterSummary
          character={character}
          linkedCampaign={campaign ? { id: campaign.id, title: campaign.title } : null}
          pilotName={pilot?.display_name ?? null}
          hideSheetLink
        />
      </div>
    </div>
  );
}
