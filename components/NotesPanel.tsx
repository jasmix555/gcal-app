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

export default function NotesPanel({
  open,
  onClose,
  groups,
  defaultGroupId,
  focusMemoId,
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

  const openMemo = useCallback((m: Memo) => {
    setEditing(m.id);
    setTitle(m.title);
    setContent(m.content);
    setGroupId(m.groupId || "");
    setRemind(m.remindAt ? isoToLocal(m.remindAt) : "");
  }, []);

  // Jump to a specific memo when asked (e.g. clicking a calendar reminder).
  useEffect(() => {
    if (!open || !focusMemoId) return;
    const found = memos.find((m) => m.id === focusMemoId);
    if (found) openMemo(found);
  }, [open, focusMemoId, memos, openMemo]);

  function openNew() {
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
          {editing !== null ? (
            <button
              onClick={() => setEditing(null)}
              aria-label="Back to list"
              className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              ←
            </button>
          ) : null}
          <h2 className="text-base font-semibold">
            {editing === null
              ? "Notes"
              : editing === "new"
                ? "New note"
                : "Edit note"}
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
        {editing === null && (
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
                  a reminder.
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
                      {m.remindAt && (
                        <span className="mt-0.5 inline-flex w-fit items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                          ⏰ {fmtRemind(m.remindAt)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
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
                  className={input}
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
                  Reminder
                </label>
                {remind ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <DateTimeField value={remind} onChange={setRemind} />
                    </div>
                    <button
                      onClick={() => setRemind("")}
                      className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                      title="Remove reminder"
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
                    ⏰ Add a reminder date
                  </button>
                )}
                {remind && (
                  <p className="mt-1 text-xs text-slate-400">
                    Shows on the selected calendar that day.
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
