"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Follow/unfollow toggle for a public /players/[id] page (backlog #38).
 * Simple two-state toggle, not a two-click confirm like
 * DeletePostButton -- unfollowing isn't destructive (unlike deleting a
 * post) and lib/follows.ts's unfollow() is already idempotent, so a
 * stray double-click has no bad effect. */
export default function FollowButton({
  userId,
  initiallyFollowing,
}: {
  userId: string;
  initiallyFollowing: boolean;
}) {
  const [following, setFollowing] = useState(initiallyFollowing);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function toggle() {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/follows/${userId}`, {
      method: following ? "DELETE" : "POST",
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setFollowing(!following);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={toggle}
        disabled={submitting}
        className={
          following
            ? "whitespace-nowrap rounded border border-black/10 px-3 py-1 text-sm disabled:opacity-50 dark:border-white/10"
            : "whitespace-nowrap rounded bg-black px-3 py-1 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
        }
      >
        {following ? "Following" : "Follow"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
