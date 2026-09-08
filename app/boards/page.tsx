import Link from "next/link";
import { listBoards, listThreads } from "@/lib/boards";

/** Backlog #37: lightweight community discussion boards -- the concrete
 * first slice of backlog #25 (clubs/curated community lists). A fixed,
 * curated set of topic boards (not user-created ones), mirroring
 * /systems' own index-page pattern exactly: public browsing, a curated
 * `as const` list resolved via lib/boards.ts, a "count" query per entry
 * using pageSize: 1 (only the total is needed here). */
export default async function BoardsIndexPage() {
  const boards = listBoards().map((board) => {
    const result = listThreads(board.slug, { pageSize: 1 });
    return { ...board, threadCount: result?.total ?? 0 };
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Community boards</h1>
          <p className="mt-1 max-w-2xl text-sm text-black/60 dark:text-white/60">
            Topic-based discussion, not tied to any one campaign -- anyone can read a board; sign in
            to start a thread or reply.
          </p>
        </div>
        <Link
          href="/boards/search"
          className="shrink-0 rounded border border-black/20 px-3 py-1.5 text-sm dark:border-white/20"
        >
          Search boards
        </Link>
      </div>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {boards.map((board) => (
          <li key={board.slug} className="rounded border border-black/10 p-4 dark:border-white/10">
            <Link href={`/boards/${board.slug}`} className="font-medium hover:underline">
              {board.name}
            </Link>
            <p className="mt-1 text-sm text-black/60 dark:text-white/60">{board.description}</p>
            <p className="mt-2 text-xs text-black/60 dark:text-white/60">
              {board.threadCount} thread{board.threadCount === 1 ? "" : "s"}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
