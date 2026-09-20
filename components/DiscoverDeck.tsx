"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CAMPAIGN_TONE_TAG_LABELS,
  DANGER_LEVEL_LABELS,
  SESSION_FORMAT_LABELS,
  type AvailabilitySlot,
  type CampaignToneTag,
  type DangerLevel,
  type SessionFormat,
} from "@/lib/types";
import { matchesAvailability } from "@/lib/availabilityMatch";

export interface DiscoverCard {
  id: string;
  title: string;
  description: string;
  system: string;
  location: string;
  danger_level: DangerLevel | null;
  session_format: SessionFormat | null;
  starting_level: string | null;
  tone_tags: CampaignToneTag[];
  new_player_friendly: number;
  accepting_requests: number;
  cancelled: number;
  capacity: number;
  headcount: number;
  dmName: string | null;
  /** Backlog #27 phase 2: needed client-side to compare against the
   * viewer's own saved availability grid -- see matchesAvailability's own
   * doc comment in lib/availabilityMatch.ts for why this has to be a raw
   * ISO instant rather than a pre-computed label. */
  next_session_at: string | null;
}

/** A one-at-a-time "swipe deck" presentation of the same campaigns the list
 * view already shows — an alternate way to browse, not a new capability.
 * "Pass" just advances to the next card; there's deliberately no join/leave
 * action duplicated here (that stays on the campaign's own detail page,
 * the single source of truth for membership state) — this component only
 * needs to know what to *show*, not the viewer's relationship to each
 * campaign, which keeps it simple and avoids a second, parallel join flow
 * that could drift from the real one. Pass/skip decisions are session-only
 * UI state (a plain useState index), not persisted anywhere: there's no
 * "come back to this later" queue, just a fresh pass through the current
 * filtered results every time this view loads. */
export default function DiscoverDeck({
  cards,
  viewerAvailability = [],
}: {
  cards: DiscoverCard[];
  /** The signed-in viewer's own saved weekly availability grid, if any.
   * Empty for a signed-out viewer or one who hasn't saved a grid yet --
   * the availability filter/badges simply don't appear in that case. */
  viewerAvailability?: AvailabilitySlot[];
}) {
  const [index, setIndex] = useState(0);
  const [onlyFitsAvailability, setOnlyFitsAvailability] = useState(false);

  // Backlog #27 phase 2: matchesAvailability() reads `next_session_at`
  // using whatever timezone it's called in (see that function's own doc
  // comment in lib/availabilityMatch.ts) -- computed directly during
  // render here, the same way ScheduleForm.tsx already renders
  // `next_session_at` with a plain `new Date(...).toLocaleString()` call
  // with no special client-only gating. Like that existing call, this can
  // differ between the server's first-pass render and the viewer's own
  // browser if they're in different timezones; this app has already
  // accepted that tradeoff for every other date display rather than
  // adding machinery to avoid it.
  const hasAvailability = viewerAvailability.length > 0;

  const visibleCards = useMemo(() => {
    if (!hasAvailability || !onlyFitsAvailability) return cards;
    return cards.filter(
      (card) => matchesAvailability(card.next_session_at, viewerAvailability) === true
    );
  }, [cards, hasAvailability, onlyFitsAvailability, viewerAvailability]);

  if (cards.length === 0) {
    return (
      <p className="text-sm text-black/60 dark:text-white/60">
        No campaigns to discover yet.
      </p>
    );
  }

  // The filter can change which cards are visible out from under the
  // current index (e.g. toggling it on mid-deck) -- reset to the top of
  // the (possibly shorter) filtered deck in the same handler that flips
  // the toggle, rather than leaving `index` pointing past the end or at
  // an unrelated card.
  function toggleAvailabilityFilter(checked: boolean) {
    setOnlyFitsAvailability(checked);
    setIndex(0);
  }

  const availabilityToggle = hasAvailability && (
    <label className="flex items-center gap-2 text-xs text-black/60 dark:text-white/60">
      <input
        type="checkbox"
        checked={onlyFitsAvailability}
        onChange={(e) => toggleAvailabilityFilter(e.target.checked)}
      />
      Only show sessions that fit my saved availability
    </label>
  );

  if (visibleCards.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3">
        {availabilityToggle}
        <div className="flex flex-col items-center gap-3 rounded border border-black/10 p-8 text-center dark:border-white/10">
          <p className="text-sm text-black/60 dark:text-white/60">
            {onlyFitsAvailability
              ? "No scheduled campaigns fit your saved availability right now."
              : "No campaigns to discover yet."}
          </p>
        </div>
      </div>
    );
  }

  if (index >= visibleCards.length) {
    return (
      <div className="flex flex-col items-center gap-3">
        {availabilityToggle}
        <div className="flex flex-col items-center gap-3 rounded border border-black/10 p-8 text-center dark:border-white/10">
          <p className="text-sm text-black/60 dark:text-white/60">
            That&apos;s every campaign matching your filters.
          </p>
          <button
            onClick={() => setIndex(0)}
            className="rounded border border-black/20 px-3 py-1.5 text-sm dark:border-white/20"
          >
            Start over
          </button>
        </div>
      </div>
    );
  }

  const card = visibleCards[index];
  const availabilityMatch = hasAvailability
    ? matchesAvailability(card.next_session_at, viewerAvailability)
    : null;

  return (
    <div className="flex flex-col items-center gap-4">
      {availabilityToggle}
      <p className="text-xs text-black/60 dark:text-white/60">
        {index + 1} of {visibleCards.length}
      </p>
      <div className="w-full max-w-md rounded border border-black/10 p-5 dark:border-white/10">
        <h2 className="text-lg font-semibold">{card.title}</h2>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          {card.system}
          {card.dmName && <> &middot; DM: {card.dmName}</>} &middot; {card.headcount}/
          {card.capacity} players
          {card.location && <> &middot; {card.location}</>}
        </p>
        {availabilityMatch !== null && (
          <p
            className={`mt-1 text-xs ${
              availabilityMatch
                ? "text-green-700 dark:text-green-400"
                : "text-black/50 dark:text-white/50"
            }`}
          >
            {availabilityMatch
              ? "Fits your saved availability"
              : "Outside your saved availability"}
          </p>
        )}
        {card.session_format && (
          <span className="mt-2 inline-block rounded-full border border-black/20 px-2 py-0.5 text-xs dark:border-white/20">
            {SESSION_FORMAT_LABELS[card.session_format]}
          </span>
        )}
        {card.danger_level && (
          <span className="mt-2 ml-2 inline-block rounded-full border border-black/20 px-2 py-0.5 text-xs dark:border-white/20">
            {DANGER_LEVEL_LABELS[card.danger_level]}
          </span>
        )}
        {card.starting_level && (
          <span className="mt-2 ml-2 inline-block rounded-full border border-black/20 px-2 py-0.5 text-xs dark:border-white/20">
            Starting level: {card.starting_level}
          </span>
        )}
        {!!card.new_player_friendly && (
          <span className="mt-2 ml-2 inline-block rounded-full border border-black/20 px-2 py-0.5 text-xs dark:border-white/20">
            New-player friendly
          </span>
        )}
        {card.tone_tags.map((tag) => (
          <span
            key={tag}
            className="mt-2 ml-2 inline-block rounded-full border border-black/20 px-2 py-0.5 text-xs dark:border-white/20"
          >
            {CAMPAIGN_TONE_TAG_LABELS[tag]}
          </span>
        ))}
        {card.description && <p className="mt-3 text-sm">{card.description}</p>}
        {!card.cancelled && !card.accepting_requests && (
          <p className="mt-3 text-xs text-black/60 dark:text-white/60">
            Closed to new requests right now.
          </p>
        )}
        {!!card.cancelled && (
          <p className="mt-3 text-xs text-red-600 dark:text-red-400">Cancelled.</p>
        )}
      </div>
      <div className="flex gap-3">
        <button
          onClick={() => setIndex((i) => i + 1)}
          className="rounded border border-black/20 px-4 py-2 text-sm dark:border-white/20"
        >
          Pass
        </button>
        <Link
          href={`/campaigns/${card.id}`}
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          View &amp; join
        </Link>
      </div>
    </div>
  );
}
