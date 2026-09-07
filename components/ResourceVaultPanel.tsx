"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { CampaignResourceWithUploader } from "@/lib/types";
import Section from "@/components/Section";

// Mirrors MAX_RESOURCE_DATA_URL_LENGTH's ~4MB budget in
// lib/campaignResources.ts, checked against the raw file here (before
// base64 inflates it ~33%) so a too-large file is rejected immediately
// instead of after an upload+encode round trip -- same pattern as
// CharacterManager's MAX_PORTRAIT_FILE_BYTES.
const MAX_RESOURCE_FILE_BYTES = 4 * 1024 * 1024;

function isImage(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

/** Backlog #34, phase 1: per-campaign resource vault (maps, handouts,
 * homebrew notes) -- only ever rendered behind the campaign page's own
 * hasPrivateAccess gate (same as PartyNotesPanel/CampaignChatPanel), so
 * every viewer here is already the DM or an active member. The
 * cross-community library the backlog line also describes is an
 * explicit future phase, not built here -- see claude/progress.md. */
export default function ResourceVaultPanel({
  campaignId,
  viewerId,
  isDm,
}: {
  campaignId: string;
  viewerId: string | null;
  isDm: boolean;
}) {
  const [resources, setResources] = useState<CampaignResourceWithUploader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [fileLabel, setFileLabel] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/campaigns/${campaignId}/resources`);
    if (res.ok) {
      const data = await res.json();
      setResources(data.resources ?? []);
    }
    setLoading(false);
  }, [campaignId]);

  useEffect(() => {
    // load() only sets state after its await resolves and is also called
    // again after every mutation below, so it can't be inlined into this
    // effect body -- same pattern as CampaignChatPanel/PartyNotesPanel.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > MAX_RESOURCE_FILE_BYTES) {
      setError(
        `That file is too large — please use one under ${Math.round(MAX_RESOURCE_FILE_BYTES / (1024 * 1024))}MB.`
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setDataUrl(reader.result);
        setFileLabel(file.name);
        if (!name.trim()) setName(file.name);
      }
    };
    reader.onerror = () => setError("Couldn't read that file — please try again.");
    reader.readAsDataURL(file);
  }

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !dataUrl) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/resources`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, dataUrl }),
    });
    if (res.ok) {
      setName("");
      setDescription("");
      setDataUrl(null);
      setFileLabel(null);
      await load();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't upload that file.");
    }
    setBusy(false);
  }

  function startEdit(resource: CampaignResourceWithUploader) {
    setEditingId(resource.id);
    setEditName(resource.name);
    setEditDescription(resource.description);
  }

  async function saveEdit(resourceId: string) {
    if (!editName.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/resources/${resourceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, description: editDescription }),
    });
    if (res.ok) {
      setEditingId(null);
      await load();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't save that change.");
    }
    setBusy(false);
  }

  async function remove(resourceId: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/resources/${resourceId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      await load();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't remove that resource.");
    }
    setBusy(false);
  }

  return (
    <Section>
      <h2 className="mb-2 font-medium">Resource vault</h2>
      <p className="mb-3 text-xs text-black/60 dark:text-white/60">
        Maps, handouts, and homebrew notes shared with your table -- images, PDFs, and plain text, up to{" "}
        {Math.round(MAX_RESOURCE_FILE_BYTES / (1024 * 1024))}MB each.
      </p>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-sm">Loading...</p>
      ) : (
        <ul className="mb-3 flex flex-col gap-2">
          {resources.map((resource) => {
            const canManage = isDm || resource.uploader_id === viewerId;
            return (
              <li
                key={resource.id}
                className="rounded border border-black/10 p-2 text-sm dark:border-white/10"
              >
                {editingId === resource.id ? (
                  <div className="flex flex-col gap-2">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Name"
                      className="rounded border border-black/20 px-2 py-1 dark:border-white/20 dark:bg-transparent"
                    />
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Description"
                      rows={2}
                      className="rounded border border-black/20 px-2 py-1 dark:border-white/20 dark:bg-transparent"
                    />
                    <div className="flex gap-2">
                      <button
                        disabled={busy}
                        onClick={() => saveEdit(resource.id)}
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
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 gap-3">
                      {isImage(resource.mime_type) ? (
                        // eslint-disable-next-line @next/next/no-img-element -- data: URL can't use next/image's optimizer.
                        <img
                          src={resource.data_url}
                          alt=""
                          className="h-12 w-12 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <span className="text-2xl leading-none">
                          {resource.mime_type === "application/pdf" ? "📄" : "📝"}
                        </span>
                      )}
                      <div className="min-w-0">
                        <a
                          href={resource.data_url}
                          download={resource.name}
                          className="font-medium underline"
                        >
                          {resource.name}
                        </a>
                        {resource.description && (
                          <p className="whitespace-pre-wrap text-black/70 dark:text-white/70">
                            {resource.description}
                          </p>
                        )}
                        <p className="text-xs text-black/50 dark:text-white/50">
                          Uploaded by {resource.uploaderName}
                        </p>
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex shrink-0 gap-2 text-xs">
                        <button onClick={() => startEdit(resource)} className="underline">
                          Edit
                        </button>
                        <button onClick={() => remove(resource.id)} className="underline">
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
          {resources.length === 0 && (
            <li className="text-black/60 dark:text-white/60">No resources uploaded yet.</li>
          )}
        </ul>
      )}
      <form onSubmit={handleUpload} className="flex flex-col gap-2 text-sm">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          maxLength={150}
          className="rounded border border-black/20 px-2 py-1 dark:border-white/20 dark:bg-transparent"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
          className="rounded border border-black/20 px-2 py-1 dark:border-white/20 dark:bg-transparent"
        />
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain"
          onChange={(e) => handleFile(e.target.files?.[0])}
          className="text-xs"
        />
        {fileLabel && <span className="text-xs text-black/60 dark:text-white/60">Selected: {fileLabel}</span>}
        <button
          type="submit"
          disabled={busy || !name.trim() || !dataUrl}
          className="w-fit rounded bg-black px-3 py-1.5 text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          Upload
        </button>
      </form>
    </Section>
  );
}
