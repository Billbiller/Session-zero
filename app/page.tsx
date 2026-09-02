import Link from "next/link";
import { getCurrentUser } from "@/lib/currentUser";

export default async function Home() {
  const user = await getCurrentUser();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Session Zero</h1>
      <p className="text-black/70 dark:text-white/70">
        Find a D&D (or other tabletop) group, or post one you&apos;re running,
        and keep track of the campaign once you&apos;re in.
      </p>
      <div className="flex gap-3">
        <Link
          href="/campaigns"
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          Browse campaigns
        </Link>
        {!user && (
          <Link
            href="/signin"
            className="rounded border border-black/20 px-4 py-2 text-sm font-medium dark:border-white/20"
          >
            Sign in
          </Link>
        )}
      </div>
    </div>
  );
}
