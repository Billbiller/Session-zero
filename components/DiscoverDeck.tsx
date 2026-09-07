"use client";

import { useState } from "react";
import Link from "next/link";
import { DANGER_LEVEL_LABELS, type DangerLevel } from "@/lib/types";

export interface DiscoverCard {
  id: string;
  title: string;
  description: string;
  system: string;
  location: string;
  danger_level: DangerLevel | null;
  new_player_friendly: number;
  accepting_requests: number;
  cancelled: number;
  capacity: number;
  headcount: number;
  dmName: string | null;
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
export default function DiscoverDeck({ cards }: { cards: DiscoverCard[] }) {
  const [index, setIndex] = useState(0);

  if (cards.length === 0) {
    return (
      <p className="text-sm text-black/60 dark:text-white/60">
        No campaigns to discover yet.
      </p>
    );
  }

  if (index >= cards.length) {
    return (
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
    );
  }

  const card = cards[index];

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-xs text-black/60 dark:text-white/60">
        {index + 1} of {cards.length}
      </p>
      <div className="w-full max-w-md rounded border border-black/10 p-5 dark:border-white/10">
        <h2 className="text-lg font-semibold">{card.title}</h2>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          {card.system}
          {card.dmName && <> &middot; DM: {card.dmName}</>} &middot; {card.headcount}/
          {card.capacity} players
          {card.location && <> &middot; {card.location}</>}
        </p>
        {card.danger_level && (
          <span className="mt-2 inline-block rounded-full border border-black/20 px-2 py-0.5 text-xs dark:border-white/20">
            {DANGER_LEVEL_LABELS[card.danger_level]}
          </span>
        )}
        {!!card.new_player_friendly && (
          <span className="mt-2 ml-2 inline-block rounded-full border border-black/20 px-2 py-0.5 text-xs dark:border-white/20">
            New-player friendly
          </span>
        )}
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
