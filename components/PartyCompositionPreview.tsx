import { summarizePartyComposition } from "@/lib/partyComposition";
import type { Character } from "@/lib/types";
import Section from "@/components/Section";

/**
 * Backlog #71 (competitive research vs. StartPlaying.games): a public
 * "current party" preview -- just the aggregate archetype list of a
 * campaign's currently-active linked characters (e.g. "Human Wizard,
 * Aasimar Cleric"), no names or player identities -- shown to every
 * viewer, including a signed-out prospective joiner, so they can pick a
 * complementary concept before requesting to join. Same
 * public-outside-hasPrivateAccess, render-nothing-with-nothing-to-show
 * shape as UpcomingSessionsPreview (backlog #70).
 *
 * Rendered by the caller only when the campaign is accepting requests --
 * a party that isn't currently recruiting has no "should I apply"
 * decision for this to inform -- and only when there's at least one
 * active character to summarize (summarizePartyComposition already
 * returns an empty list otherwise, so this component renders null on
 * its own too).
 */
export default function PartyCompositionPreview({
  characters,
}: {
  characters: Pick<Character, "archetype" | "status">[];
}) {
  const entries = summarizePartyComposition(characters);
  if (entries.length === 0) return null;

  return (
    <Section>
      <h2 className="mb-2 font-medium">Current party</h2>
      <ul className="flex flex-wrap gap-2 text-sm">
        {entries.map((entry) => (
          <li
            key={entry.archetype.toLowerCase()}
            className="rounded-full border border-black/20 px-2 py-0.5 text-xs dark:border-white/20"
          >
            {entry.count > 1 ? `${entry.count}x ${entry.archetype}` : entry.archetype}
          </li>
        ))}
      </ul>
    </Section>
  );
}
