import Link from "next/link";
import { searchBoards, getBoard } from "@/lib/boards";

const PAGE_SIZE = 20;

/** Backlog #52: search across all four boards at once. Distinct from
 * /boards/[slug] (one board's own thread list) -- as boards accumulate
 * threads there was previously no way to find a relevant past thread
 * without already knowing which board it's on. A match can come from a
 * thread's own title/body or from any reply on it (see
 * lib/boards.ts's searchBoards() doc comment); a reply-only match still
 * links to its parent thread with a note explaining why it matched,
 * since a reply has no page of its own to link to. */
export default async function BoardSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const page = Number(params.page || "1");
  const { items, total } = searchBoards(q, { page, pageSize: PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/boards" className="text-sm text-black/60 hover:underline dark:text-white/60">
          &larr; All boards
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Search boards</h1>
        <p className="mt-1 max-w-2xl text-sm text-black/60 dark:text-white/60">
          Search thread titles, posts, and replies across every board at once.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3 text-sm" method="get">
        <label className="flex flex-col gap-1">
          Search
          <input
            name="q"
            defaultValue={q}
            placeholder="Keyword in a thread or reply"
            autoFocus
            className="w-72 rounded border border-black/20 px-3 py-1.5 dark:border-white/20 dark:bg-transparent"
          />
        </label>
        <button
          type="submit"
          className="rounded border border-black/20 px-3 py-1.5 dark:border-white/20"
        >
          Search
        </button>
      </form>

      {!q && (
        <p className="text-sm text-black/60 dark:text-white/60">
          Enter a search term above to look across every board.
        </p>
      )}

      {q && items.length === 0 && (
        <p className="text-sm text-black/60 dark:text-white/60">
          No threads or replies match &ldquo;{q}&rdquo;.
        </p>
      )}

      {q && items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((result) => {
            const board = getBoard(result.board_slug);
            return (
              <li
                key={result.id}
                className="rounded border border-black/10 p-4 dark:border-white/10"
              >
                <p className="text-xs text-black/60 dark:text-white/60">
                  {board?.name ?? result.board_slug}
                </p>
                <Link
                  href={`/boards/${result.board_slug}/${result.id}`}
                  className="font-medium hover:underline"
                >
                  {result.title}
                </Link>
                <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                  by {result.authorName} &middot;{" "}
                  {new Date(result.created_at).toLocaleDateString()} &middot; {result.replyCount}{" "}
                  repl{result.replyCount === 1 ? "y" : "ies"}
                </p>
                {!result.matchedInThread && (
                  <p className="mt-1 text-xs text-black/60 dark:text-white/60">
                    Matched in a reply on this thread, not the original post.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {q && totalPages > 1 && (
        <div className="flex gap-2 text-sm">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={{ pathname: "/boards/search", query: { q, page: p } }}
              className={
                p === page
                  ? "font-semibold underline"
                  : "text-black/60 hover:underline dark:text-white/60"
              }
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
