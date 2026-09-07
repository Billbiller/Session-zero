"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** The volunteer/withdraw control for one sub request on the app-wide
 * browse pool (app/subs/page.tsx, a server component -- this is the one
 * client-interactive sliver of that page, matching how DiscoverDeck is
 * the one client sliver of the campaigns browse page). */
export default function SubVolunteerAction({
  requestId,
  signedIn,
  initialHasVolunteered,
}: {
  requestId: string;
  signedIn: boolean;
  initialHasVolunteered: boolean;
}) {
  const [hasVolunteered, setHasVolunteered] = useState(initialHasVolunteered);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function volunteer() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/subs/${requestId}/volunteer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setHasVolunteered(true);
    router.refresh();
  }

  async function withdraw() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/subs/${requestId}/volunteer`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setHasVolunteered(false);
    router.refresh();
  }

  if (!signedIn) {
    return <p className="text-xs text-black/60 dark:text-white/60">Sign in to volunteer.</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      {error && <p className="text-xs text-red-600">{error}</p>}
      {hasVolunteered ? (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-black/60 dark:text-white/60">You&apos;ve volunteered.</span>
          <button disabled={busy} onClick={withdraw} className="underline disabled:opacity-50">
            Withdraw
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-1 sm:flex-row">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={500}
            placeholder="Optional note to the requester"
            className="flex-1 rounded border border-black/20 px-2 py-1 text-xs dark:border-white/20 dark:bg-transparent"
          />
          <button
            disabled={busy}
            onClick={volunteer}
            className="w-fit rounded bg-black px-2 py-1 text-xs text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            Volunteer
          </button>
        </div>
      )}
    </div>
  );
}
