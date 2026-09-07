import Link from "next/link";
import { listCuratedSystems, campaignsForSystem } from "@/lib/systems";

export default async function SystemsIndexPage() {
  const systems = listCuratedSystems().map((system) => {
    // pageSize: 1 -- only the total count is needed here; the hub page
    // itself does the real paginated fetch.
    const result = campaignsForSystem(system.slug, { pageSize: 1 });
    return { ...system, campaignCount: result?.total ?? 0 };
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Browse by system</h1>
        <p className="mt-1 max-w-2xl text-sm text-black/60 dark:text-white/60">
          A curated starting point for well-known tabletop systems. A campaign&apos;s system is
          always free text, set by its DM -- these hubs are a best-effort view over that text, not
          a restriction on what you can post or search for.
        </p>
      </div>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {systems.map((system) => (
          <li
            key={system.slug}
            className="rounded border border-black/10 p-4 dark:border-white/10"
          >
            <Link href={`/systems/${system.slug}`} className="font-medium hover:underline">
              {system.name}
            </Link>
            <p className="mt-1 text-sm text-black/60 dark:text-white/60">{system.description}</p>
            <p className="mt-2 text-xs text-black/60 dark:text-white/60">
              {system.campaignCount} campaign{system.campaignCount === 1 ? "" : "s"}
            </p>
          </li>
        ))}
        <li className="rounded border border-dashed border-black/20 p-4 dark:border-white/20">
          <Link href="/campaigns" className="font-medium hover:underline">
            Other / homebrew
          </Link>
          <p className="mt-1 text-sm text-black/60 dark:text-white/60">
            Running or looking for something that isn&apos;t listed above? Every system is welcome
            here -- browse and search the full campaign list, or post your own with any system
            name you like.
          </p>
        </li>
      </ul>
    </div>
  );
}
