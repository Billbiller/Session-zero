"use client";

import { useEffect, useState, useCallback } from "react";

interface PrefRow {
  type: string;
  label: string;
  enabled: boolean;
}

export default function NotificationSettingsPage() {
  const [rows, setRows] = useState<PrefRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/notifications/preferences");
    if (res.ok) {
      const data = await res.json();
      setRows(data.types ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // load() sets state only after its await resolves (an async microtask
    // continuation), and is also called after each toggle, so it can't be
    // inlined into this effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function toggle(type: string, enabled: boolean) {
    setRows((prev) => prev.map((r) => (r.type === type ? { ...r, enabled } : r)));
    await fetch("/api/notifications/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, enabled }),
    });
  }

  if (loading) return <p className="text-sm">Loading...</p>;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Notification settings</h1>
      <p className="text-sm text-black/60 dark:text-white/60">
        Mute any notification type so it&apos;s never created for you again.
      </p>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li
            key={row.type}
            className="flex items-center justify-between rounded border border-black/10 p-3 text-sm dark:border-white/10"
          >
            <span>{row.label}</span>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={row.enabled}
                onChange={(e) => toggle(row.type, e.target.checked)}
              />
              {row.enabled ? "On" : "Muted"}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
