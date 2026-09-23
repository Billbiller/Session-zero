"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Section from "@/components/Section";

/** Backlog #68: a site-admin-only control on the campaign detail page for
 * featuring this campaign in the home page's Spotlight section (see
 * lib/campaigns.ts's setCampaignSpotlight/listSpotlightCampaigns). Only
 * rendered for a site admin -- the page gates it on isSiteAdmin, and the
 * API route re-checks. */
export default function SpotlightToggle({
  campaignId,
  spotlighted,
  eligible,
}: {
  campaignId: string;
  spotlighted: boolean;
  /** Whether the campaign would currently actually appear on the home
   * page if spotlighted (not cancelled, still accepting requests). */
  eligible: boolean;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function toggle() {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/spotlight`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spotlighted: !spotlighted }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  return (
    <Section>
      <h2 className="mb-1 font-medium">Home page spotlight (admin)</h2>
      <p className="mb-2 text-xs text-black/60 dark:text-white/60">
        {spotlighted
          ? "This campaign is spotlighted. The home page shows the most recently spotlighted open campaigns (up to 3)."
          : "Feature this campaign in the Spotlight section on the home page."}
        {spotlighted && !eligible && (
          <> It&apos;s hidden from the home page right now because it&apos;s cancelled or not accepting requests.</>
        )}
      </p>
      <button
        disabled={submitting}
        onClick={toggle}
        className="rounded border border-black/20 px-3 py-1 text-sm disabled:opacity-50 dark:border-white/20"
      >
        {spotlighted ? "Remove from spotlight" : "Spotlight on home page"}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </Section>
  );
}
