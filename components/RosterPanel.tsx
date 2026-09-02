import type { User } from "@/lib/types";

export default function RosterPanel({
  dm,
  members,
}: {
  dm: User | null;
  members: User[];
}) {
  return (
    <div className="rounded border border-black/10 p-4 dark:border-white/10">
      <h2 className="mb-2 font-medium">Roster</h2>
      <ul className="flex flex-col gap-1 text-sm">
        {dm && (
          <li>
            {dm.display_name} <span className="text-black/50 dark:text-white/50">(DM)</span>
          </li>
        )}
        {members.map((m) => (
          <li key={m.id}>{m.display_name}</li>
        ))}
        {members.length === 0 && (
          <li className="text-black/60 dark:text-white/60">No approved players yet.</li>
        )}
      </ul>
    </div>
  );
}
