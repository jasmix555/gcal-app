"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { colorForKey } from "@/lib/colors";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import ConfirmDialog from "@/components/ConfirmDialog";
import RichTextEditor from "@/components/RichTextEditor";
import DateTimeField from "@/components/DateTimeField";

interface GroupSummary {
  id: string;
  name: string;
  isPersonal?: boolean;
}

interface Memo {
  id: string;
  title: string;
  content: string;
  groupId: string | null;
  remindAt: string | null;
  updatedAt: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  groups: GroupSummary[];
  defaultGroupId?: string | null;
  /** Open straight into a specific memo (e.g. from a calendar reminder click). */
  focusMemoId?: string | null;
  /** Bumped by the app's change poll to refresh the list in near-real-time. */
  refreshSignal?: number;
  /** Open straight into a new note prefilled with a deadline/calendar. */
  compose?: { remind?: string; groupId?: string | null } | null;
  onChanged?: () => void;
}

const input =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500";

const pad = (n: number) => String(n).padStart(2, "0");

function isoToLocal(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function plainText(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fmtRemind(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Human countdown to a deadline, e.g. "3 days 4 hours 12 minutes left". */
function timeLeft(iso: string): { text: string; overdue: boolean } {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return { text: "Past deadline", overdue: true };
  const totalMin = Math.floor(diff / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} day${days > 1 ? "s" : ""}`);
  if (hours) parts.push(`${hours} hour${hours > 1 ? "s" : ""}`);
  parts.push(`${mins} minute${mins !== 1 ? "s" : ""}`);
  return { text: `${parts.join(" ")} left`, overdue: false };
}

export default function NotesPanel({
  open,
  onClose,
  groups,
  defaultGroupId,
  focusMemoId,
  refreshSignal,
  compose,
  onChanged,
}: Props) {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Editor state. `editing` null = list view; "new" = creating; otherwise a memo id.
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [groupId, setGroupId] = useState<string>("");
  const [remind, setRemind] = useState<string>(""); // local "YYYY-MM-DDTHH:mm" or ""
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [preview, setPreview] = useState<Memo | null>(null);
  const [, setTick] = useState(0); // re-render to refresh the deadline countdown

  const load = useCallback(() => {
    setLoaded(false);
    fetch("/api/memos")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setMemos(d.memos || []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Near-real-time: reload the list when the change poll signals a memo change
  // (only while viewing the list, so it won't disrupt an in-progress edit).
  useEffect(() => {
    if (open && refreshSignal && editing === null && !preview) load();
  }, [refreshSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset to the list whenever the panel closes, so reopening doesn't leave you
  // stuck in a stale editor/preview (the component stays mounted while closed).
  useEffect(() => {
    if (!open) {
      setEditing(null);
      setPreview(null);
    }
  }, [open]);

  // Tick the deadline countdown once a minute while previewing.
  useEffect(() => {
    if (!preview?.remindAt) return;
    const t = setInterval(() => setTick((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, [preview]);

  const openMemo = useCallback((m: Memo) => {
    setPreview(null);
    setEditing(m.id);
    setTitle(m.title);
    setContent(m.content);
    setGroupId(m.groupId || "");
    setRemind(m.remindAt ? isoToLocal(m.remindAt) : "");
  }, []);

  // Open a memo read-only (preview) first; edit is one click away.
  const openPreview = useCallback((m: Memo) => {
    setEditing(null);
    setPreview(m);
  }, []);

  // Clicking a calendar reminder opens the note's preview.
  useEffect(() => {
    if (!open || !focusMemoId) return;
    const found = memos.find((m) => m.id === focusMemoId);
    if (found) openPreview(found);
  }, [open, focusMemoId, memos, openPreview]);

  // Open a new note prefilled (e.g. "Note" chosen from a calendar date).
  useEffect(() => {
    if (!open || !compose) return;
    setPreview(null);
    setEditing("new");
    setTitle("");
    setContent("");
    setGroupId(compose.groupId || defaultGroupId || "");
    setRemind(compose.remind || "");
  }, [open, compose]); // eslint-disable-line react-hooks/exhaustive-deps

  function openNew() {
    setPreview(null);
    setEditing("new");
    setTitle("");
    setContent("");
    setGroupId(defaultGroupId || "");
    setRemind("");
  }

  async function save() {
    setSaving(true);
    try {
      const payload = {
        title: title.trim() || "Untitled",
        content,
        groupId: groupId || null,
        remindAt: remind ? new Date(remind).toISOString() : null,
      };
      const res =
        editing === "new"
          ? await fetch("/api/memos", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
          : await fetch(`/api/memos/${editing}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error || "Could not save note");
      toast.success("Note saved");
      setEditing(null);
      setPreview(null);
      load();
      onChanged?.();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setConfirmDel(null);
    try {
      const res = await fetch(`/api/memos/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete note");
      toast.success("Note deleted");
      setEditing(null);
      setPreview(null);
      load();
      onChanged?.();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  if (!open) return null;

  const groupName = (id: string | null) =>
    id ? groups.find((g) => g.id === id)?.name : null;

  return (
    <>
      <div
        className="animate-fade-in fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="animate-slide-in-right fixed inset-y-0 right-0 z-50 flex w-[440px] max-w-[92vw] flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          {editing !== null || preview ? (
            <button
              onClick={() => {
                setEditing(null);
                setPreview(null);
              }}
              aria-label="Back to list"
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              ←
            </button>
          ) : null}
          <h2 className="text-base font-semibold">
            {editing === "new"
              ? "New note"
              : editing !== null
                ? "Edit note"
                : preview
                  ? "Note"
                  : "Notes"}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        {/* ---- List view ---- */}
        {editing === null && !preview && (
          <>
            <div className="px-4 py-3">
              <Button className="w-full" onClick={openNew}>
                + New note
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-4">
              {!loaded ? (
                <div className="flex flex-col gap-2 px-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex flex-col gap-2 rounded-lg border border-slate-100 p-3 dark:border-slate-800"
                    >
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  ))}
                </div>
              ) : memos.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-slate-400">
                  No notes yet. Create one to jot down a memo, a to-do list, or
                  a deadline.
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  {memos.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => openMemo(m)}
                      className="flex flex-col gap-1 rounded-lg px-3 py-2.5 text-left transition hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <div className="flex items-center gap-2">
                        {m.groupId && (
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: colorForKey(m.groupId) }}
                          />
                        )}
                        <span className="truncate text-sm font-medium">
                          {m.title}
                        </span>
                      </div>
                      <span className="line-clamp-1 text-xs text-slate-400">
                        {plainText(m.content) || "Empty note"}
                      </span>
                      {m.remindAt &&
                        (() => {
                          const { text, overdue } = timeLeft(m.remindAt);
                          return (
                            <span
                              className={`mt-0.5 inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${
                                overdue
                                  ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                                  : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                              }`}
                            >
                              ⏳ {text}
                            </span>
                          );
                        })()}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ---- Preview view (read-only) ---- */}
        {preview && editing === null && (
          <div className="flex flex-1 flex-col overflow-y-auto px-4 py-3">
            <h3 className="mb-3 text-lg font-semibold">{preview.title}</h3>
            <div
              className="rte-content rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:text-slate-100 [&_input]:pointer-events-none"
              dangerouslySetInnerHTML={{
                __html:
                  preview.content || '<p class="text-slate-400">Empty note</p>',
              }}
            />
            <div className="mt-4 flex flex-col gap-2 text-sm">
              {preview.groupId && (
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: colorForKey(preview.groupId) }}
                  />
                  {groupName(preview.groupId)}
                </div>
              )}
              {preview.remindAt &&
                (() => {
                  const { text, overdue } = timeLeft(preview.remindAt);
                  return (
                    <div className="flex flex-col gap-1">
                      <div className="text-xs uppercase tracking-wide text-slate-400">
                        Deadline
                      </div>
                      <div className="text-slate-600 dark:text-slate-300">
                        ⏳ {fmtRemind(preview.remindAt)}
                      </div>
                      <div
                        className={`text-sm font-semibold ${
                          overdue
                            ? "text-red-600 dark:text-red-400"
                            : "text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        {text}
                      </div>
                    </div>
                  );
                })()}
            </div>
            <div className="mt-5 flex items-center gap-2 pb-2">
              <Button onClick={() => openMemo(preview)} className="flex-1">
                Edit
              </Button>
              <Button
                variant="outline"
                onClick={() => setConfirmDel(preview.id)}
                className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                Delete
              </Button>
            </div>
          </div>
        )}

        {/* ---- Editor view ---- */}
        {editing !== null && (
          <div className="flex flex-1 flex-col overflow-y-auto px-4 py-3">
            <input
              className={`${input} mb-3 text-base font-medium`}
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            <RichTextEditor
              value={content}
              onChange={setContent}
              placeholder="Write a note, add a checklist…"
            />

            <div className="mt-4 grid gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                  Calendar
                </label>
                <select
                  className={`${input} select-chevron`}
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                >
                  <option value="">No calendar</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.isPersonal ? "Personal" : g.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                  Deadline
                </label>
                {remind ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <DateTimeField value={remind} onChange={setRemind} />
                    </div>
                    <button
                      onClick={() => setRemind("")}
                      className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                      title="Remove deadline"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      const d = new Date();
                      d.setHours(d.getHours() + 1, 0, 0, 0);
                      setRemind(isoToLocal(d.toISOString()));
                    }}
                    className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 transition hover:border-slate-400 hover:text-slate-700 dark:border-slate-600 dark:hover:text-slate-300"
                  >
                    ⏳ Add a deadline
                  </button>
                )}
                {remind && (
                  <p className="mt-1 text-xs text-slate-400">
                    Shows on the linked calendar on that day.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-5 flex items-center gap-2 pb-2">
              <Button onClick={save} disabled={saving} className="flex-1">
                {saving ? "Saving…" : "Save note"}
              </Button>
              {editing !== "new" && (
                <Button
                  variant="outline"
                  onClick={() => setConfirmDel(editing)}
                  className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
                >
                  Delete
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={(o) => !o && setConfirmDel(null)}
        title="Delete note?"
        description="This note will be permanently removed."
        confirmLabel="Delete"
        onConfirm={() => confirmDel && remove(confirmDel)}
      />
    </>
  );
}
