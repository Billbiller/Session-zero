import Link from "next/link";
import type { Campaign } from "@/lib/types";
import Section from "@/components/Section";

/** Backlog #67 (competitive research vs. StartPlaying.games): a DM who
 * duplicates a campaign (backlog #47) to run a second table of the same
 * game had no way to point browsers of one table at the DM's other
 * tables. Lists every other campaign in the same duplication lineage
 * (see lib/campaigns.ts's listRelatedCampaigns) -- the original this
 * campaign was copied from, plus any sibling copies. Public, not gated
 * behind hasPrivateAccess: this is meant for a prospective player
 * browsing the campaign detail page just as much as for the DM's own
 * cross-promotion. Deliberately renders nothing at all (not even the
 * Section card) when there's no duplication history -- unlike
 * RosterPanel's always-render-with-a-fallback-message convention -- since
 * an empty "Related sections" block would be pure noise on the vast
 * majority of campaigns that were never duplicated. */
export default function RelatedCampaignsPanel({ related }: { related: Campaign[] }) {
  if (related.length === 0) return null;
  return (
    <Section>
      <h2 className="mb-2 font-medium">Other tables by this DM</h2>
      <p className="mb-2 text-xs text-black/60 dark:text-white/60">
        This campaign shares a setup with the section(s) below.
      </p>
      <ul className="flex flex-col gap-1 text-sm">
        {related.map((c) => (
          <li key={c.id}>
            <Link href={`/campaigns/${c.id}`} className="underline">
              {c.title}
            </Link>
            {c.cancelled ? (
              <span className="text-black/50 dark:text-white/50"> (cancelled)</span>
            ) : null}
          </li>
        ))}
      </ul>
    </Section>
  );
}
