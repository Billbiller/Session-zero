import { listCampaigns, type CampaignSort } from "./campaigns";
import {
  CURATED_SYSTEMS,
  CURATED_SYSTEM_INFO,
  type Campaign,
  type CuratedSystemInfo,
  type CuratedSystemSlug,
} from "./types";

export function isCuratedSystemSlug(value: string): value is CuratedSystemSlug {
  return (CURATED_SYSTEMS as readonly string[]).includes(value);
}

export interface CuratedSystem extends CuratedSystemInfo {
  slug: CuratedSystemSlug;
}

/** Every curated system, in the same order as CURATED_SYSTEMS -- the
 * order `/systems` displays them in. */
export function listCuratedSystems(): CuratedSystem[] {
  return CURATED_SYSTEMS.map((slug) => ({ slug, ...CURATED_SYSTEM_INFO[slug] }));
}

/** Null for an unrecognized slug, so callers (the /systems/[slug] page)
 * can 404 cleanly rather than rendering an empty-but-plausible hub for a
 * system that was never curated at all. */
export function getCuratedSystem(slug: string): CuratedSystem | null {
  if (!isCuratedSystemSlug(slug)) return null;
  return { slug, ...CURATED_SYSTEM_INFO[slug] };
}

/**
 * Resolves a curated system slug to the list of case-insensitive
 * substring patterns (its canonical name plus its curated aliases) used
 * to decide whether a campaign's free-text `system` field belongs to
 * this hub. This is the actual resolution of the "curated list vs.
 * system-agnostic free text" tension the backlog item raises (see the
 * doc comment on CURATED_SYSTEMS in lib/types.ts for the full reasoning):
 * a slug never maps to an authoritative classification of any campaign
 * row, only to a set of substrings a query can match against. Null for
 * an unrecognized slug.
 */
export function systemMatchPatterns(slug: string): string[] | null {
  const system = getCuratedSystem(slug);
  if (!system) return null;
  return [system.name, ...system.aliases];
}

/**
 * Live query of campaigns whose free-text `system` matches a curated
 * system's name/aliases (case-insensitive substring, via
 * lib/campaigns.ts's listCampaigns()'s `systemAliases` option, which
 * reuses that file's own escapeLikePattern/LIKE-with-ESCAPE convention
 * already established for the `q` keyword search and `location` filter).
 * Returns null for an unrecognized slug -- distinct from an empty
 * `{ items: [], total: 0 }` result, which means "a real curated system
 * with no matching campaigns yet" rather than "not a curated system at
 * all". Excludes cancelled campaigns by default, matching listCampaigns'
 * own default and the rest of this app's browse surfaces.
 */
export function campaignsForSystem(
  slug: string,
  opts: { page?: number; pageSize?: number; sort?: CampaignSort } = {}
): { items: Campaign[]; total: number } | null {
  const patterns = systemMatchPatterns(slug);
  if (!patterns) return null;
  return listCampaigns({ ...opts, systemAliases: patterns });
}
