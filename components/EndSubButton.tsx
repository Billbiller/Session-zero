"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** The "End sub" action next to a character's temporary-pilot badge
 * (backlog #20 phase 2). A small dedicated client component, not a
 * callback prop on CharacterSummary, because CharacterSummary itself is
 * rendered directly by Server Components (the campaign page, the public
 * player page) that can't pass event-handler functions across the
 * server/client boundary -- only a genuine Client Component can own the
 * click handler. onDone lets a client-side caller (CharacterManager, which
 * already self-fetches) re-load its own state instead of a full
 * router.refresh(); server-rendered callers get the router.refresh()
 * default. */
export default function EndSubButton({
  characterId,
  onDone,
}: {
  characterId: string;
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function endSub() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/characters/${characterId}/end-sub`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    if (onDone) {
      onDone();
    } else {
      router.refresh();
    }
  }

  return (
    <>
      {" "}
      &middot;{" "}
      <button onClick={endSub} disabled={busy} className="underline disabled:opacity-50">
        End sub
      </button>
      {error && <span className="ml-1 text-red-600">{error}</span>}
    </>
  );
}
