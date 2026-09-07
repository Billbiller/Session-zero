import Link from "next/link";
import { notFound } from "next/navigation";
import { getBoard, listThreads } from "@/lib/boards";
import { getCurrentUser } from "@/lib/currentUser";
import NewThreadForm from "@/components/NewThreadForm";

const PAGE_SIZE = 20;

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const board = getBoard(slug);
  if (!board) notFound();

  const { page: pageParam } = await searchParams;
  const page = Number(pageParam || "1");
  const result = listThreads(slug, { page, pageSize: PAGE_SIZE });
  if (!result) notFound();
  const { items, total } = result;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const viewer = await getCurrentUser();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/boards" className="text-sm text-black/60 hover:underline dark:text-white/60">
          &larr; All boards
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{board.name}</h1>
        <p className="mt-1 max-w-2xl text-sm text-black/60 dark:text-white/60">
          {board.description}
        </p>
      </div>

      <NewThreadForm boardSlug={slug} signedIn={!!viewer} />

      {items.length === 0 ? (
        <p className="text-sm text-black/60 dark:text-white/60">
          No threads yet on this board. Be the first to post one.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((thread) => (
            <li key={thread.id} className="rounded border border-black/10 p-4 dark:border-white/10">
              <Link href={`/boards/${slug}/${thread.id}`} className="font-medium hover:underline">
                {thread.title}
              </Link>
              <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                by {thread.authorName} &middot;{" "}
                {new Date(thread.created_at).toLocaleDateString()} &middot; {thread.replyCount}{" "}
                repl{thread.replyCount === 1 ? "y" : "ies"}
              </p>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex gap-2 text-sm">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={{ pathname: `/boards/${slug}`, query: { page: p } }}
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
