"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SessionLogAttendanceSummary, SessionLogEntryWithKudos } from "@/lib/types";
import Section from "@/components/Section";

/** Backlog #39: a DM-only, per-entry "who actually showed up" record --
 * see lib/attendance.ts for the full data-honesty reasoning (this is
 * deliberately NOT derived from backlog #35's RSVP data, which is intent
 * to attend, not a durable record of who actually did). Party members
 * default to checked when the DM turns attendance-recording on for a new
 * entry (uncheck whoever missed it); editing an already-posted entry's
 * attendance starts from whatever is currently recorded, with any never-
 * recorded member also defaulting to unchecked -- saving always submits
 * the complete current checklist (a full replace, mirroring how the
 * weekly-availability grid saves), so the UI says so up front. */
function AttendanceChecklist({
  members,
  checked,
  onToggle,
}: {
  members: { id: string; display_name: string }[];
  checked: Record<string, boolean>;
  onToggle: (userId: string) => void;
}) {
  return (
    <ul className="flex flex-col gap-1 rounded border border-black/10 p-2 dark:border-white/10">
      {members.map((m) => (
        <li key={m.id}>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={checked[m.id] ?? false}
              onChange={() => onToggle(m.id)}
            />
            {m.display_name}
          </label>
        </li>
      ))}
    </ul>
  );
}

export default function SessionLogPanel({
  campaignId,
  isDm,
  entries,
  viewerId,
  partyMembers = [],
}: {
  campaignId: string;
  isDm: boolean;
  entries: SessionLogEntryWithKudos[];
  /** Null when signed out, though in practice this panel only renders
   * behind the private-access gate on the campaign page. Used solely to
   * decide whether the kudos button is clickable. */
  viewerId: string | null;
  /** The campaign's current approved members (DM excluded) -- the
   * attendance-marking candidate set (backlog #39, see
   * lib/attendance.ts's attendanceCandidates()). Only used by the DM;
   * defaults to empty for callers that don't pass it. */
  partyMembers?: { id: string; display_name: string }[];
}) {
  const [newContent, setNewContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [kudosBusyId, setKudosBusyId] = useState<string | null>(null);

  const [recordAttendance, setRecordAttendance] = useState(false);
  const [newAttendance, setNewAttendance] = useState<Record<string, boolean>>({});

  const [attendanceEntryId, setAttendanceEntryId] = useState<string | null>(null);
  const [attendanceDraft, setAttendanceDraft] = useState<Record<string, boolean>>({});
  const [attendanceSummary, setAttendanceSummary] = useState<
    Record<string, SessionLogAttendanceSummary[]>
  >({});
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  const router = useRouter();

  function toggleNewAttendance(userId: string) {
    setNewAttendance((prev) => ({ ...prev, [userId]: !(prev[userId] ?? true) }));
  }

  function enableRecordAttendance() {
    setRecordAttendance(true);
    // Default everyone to "attended" -- the DM unchecks whoever missed.
    setNewAttendance(Object.fromEntries(partyMembers.map((m) => [m.id, true])));
  }

  async function post() {
    if (!newContent.trim()) return;
    setSubmitting(true);
    setError(null);
    const attendance =
      recordAttendance && partyMembers.length > 0
        ? partyMembers.map((m) => ({ userId: m.id, attended: newAttendance[m.id] ?? true }))
        : undefined;
    const res = await fetch(`/api/campaigns/${campaignId}/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newContent, attendance }),
    });
    setSubmitting(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setNewContent("");
    setRecordAttendance(false);
    setNewAttendance({});
    router.refresh();
  }

  async function saveEdit(entryId: string) {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/log/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: editContent }),
    });
    setSubmitting(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setEditingId(null);
    router.refresh();
  }

  async function remove(entryId: string) {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/log/${entryId}`, {
      method: "DELETE",
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  async function toggleKudos(entryId: string) {
    if (!viewerId || kudosBusyId) return;
    setKudosBusyId(entryId);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/log/${entryId}/kudos`, {
      method: "POST",
    });
    setKudosBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  async function openAttendanceEditor(entryId: string) {
    if (attendanceEntryId === entryId) {
      setAttendanceEntryId(null);
      return;
    }
    setAttendanceLoading(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/log/${entryId}/attendance`);
    setAttendanceLoading(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Couldn't load attendance.");
      return;
    }
    const summary: SessionLogAttendanceSummary[] = data.attendance ?? [];
    setAttendanceSummary((prev) => ({ ...prev, [entryId]: summary }));
    setAttendanceDraft(
      Object.fromEntries(summary.map((s) => [s.userId, s.attended ?? false]))
    );
    setAttendanceEntryId(entryId);
  }

  async function saveAttendance(entryId: string) {
    setSubmitting(true);
    setError(null);
    const members = attendanceSummary[entryId] ?? [];
    const attendance = members.map((m) => ({
      userId: m.userId,
      attended: attendanceDraft[m.userId] ?? false,
    }));
    const res = await fetch(`/api/campaigns/${campaignId}/log/${entryId}/attendance`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attendance }),
    });
    setSubmitting(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setAttendanceSummary((prev) => ({ ...prev, [entryId]: data.attendance ?? [] }));
    setAttendanceEntryId(null);
  }

  return (
    <Section>
      <h2 className="mb-2 font-medium">Session log</h2>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {isDm && (
        <div className="mb-3 flex flex-col gap-2">
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            rows={3}
            placeholder="What happened this session?"
            className="rounded border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
          />
          {partyMembers.length > 0 && (
            <div className="flex flex-col gap-2 text-xs">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={recordAttendance}
                  onChange={(e) => (e.target.checked ? enableRecordAttendance() : setRecordAttendance(false))}
                />
                Record who attended this session
              </label>
              {recordAttendance && (
                <>
                  <p className="text-black/60 dark:text-white/60">
                    Uncheck anyone who didn&apos;t make it. This feeds each player&apos;s public
                    attendance rate -- not the same as their RSVP.
                  </p>
                  <AttendanceChecklist
                    members={partyMembers}
                    checked={newAttendance}
                    onToggle={toggleNewAttendance}
                  />
                </>
              )}
            </div>
          )}
          <button
            disabled={submitting}
            onClick={post}
            className="w-fit rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            Post entry
          </button>
        </div>
      )}
      <ul className="flex flex-col gap-3">
        {entries.map((entry) => (
          <li key={entry.id} className="border-t border-black/10 pt-2 text-sm dark:border-white/10">
            {editingId === entry.id ? (
              <div className="flex flex-col gap-2">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={3}
                  className="rounded border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-transparent"
                />
                <div className="flex gap-2">
                  <button
                    disabled={submitting}
                    onClick={() => saveEdit(entry.id)}
                    className="rounded bg-black px-2 py-1 text-white disabled:opacity-50 dark:bg-white dark:text-black"
                  >
                    Save
                  </button>
                  <button onClick={() => setEditingId(null)} className="underline">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="whitespace-pre-wrap">{entry.content}</p>
                <div className="mt-1 flex items-center gap-2 text-xs text-black/50 dark:text-white/50">
                  <p>
                    {new Date(entry.created_at).toLocaleString()}
                    {isDm && (
                      <>
                        {" "}
                        &middot;{" "}
                        <button
                          onClick={() => {
                            setEditingId(entry.id);
                            setEditContent(entry.content);
                          }}
                          className="underline"
                        >
                          Edit
                        </button>{" "}
                        &middot;{" "}
                        <button onClick={() => remove(entry.id)} className="underline">
                          Delete
                        </button>
                        {partyMembers.length > 0 && (
                          <>
                            {" "}
                            &middot;{" "}
                            <button
                              disabled={attendanceLoading}
                              onClick={() => openAttendanceEditor(entry.id)}
                              className="underline disabled:opacity-50"
                            >
                              {attendanceEntryId === entry.id ? "Cancel attendance" : "Attendance"}
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </p>
                  <button
                    onClick={() => toggleKudos(entry.id)}
                    disabled={!viewerId || kudosBusyId === entry.id}
                    aria-pressed={entry.viewerGaveKudos}
                    title={entry.viewerGaveKudos ? "Remove kudos" : "Give kudos"}
                    className={`ml-auto rounded-full border px-2 py-0.5 disabled:opacity-50 ${
                      entry.viewerGaveKudos
                        ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                        : "border-black/20 dark:border-white/20"
                    }`}
                  >
                    👏 {entry.kudosCount}
                  </button>
                </div>
                {isDm && attendanceEntryId === entry.id && (
                  <div className="mt-2 flex flex-col gap-2 text-xs">
                    <p className="text-black/60 dark:text-white/60">
                      Saving submits the full checklist below -- anyone left unchecked is
                      recorded as not having attended.
                    </p>
                    <AttendanceChecklist
                      members={partyMembers}
                      checked={attendanceDraft}
                      onToggle={(userId) =>
                        setAttendanceDraft((prev) => ({ ...prev, [userId]: !(prev[userId] ?? false) }))
                      }
                    />
                    <button
                      disabled={submitting}
                      onClick={() => saveAttendance(entry.id)}
                      className="w-fit rounded bg-black px-2 py-1 text-white disabled:opacity-50 dark:bg-white dark:text-black"
                    >
                      Save attendance
                    </button>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
        {entries.length === 0 && (
          <li className="text-black/60 dark:text-white/60">No entries yet.</li>
        )}
      </ul>
    </Section>
  );
}
