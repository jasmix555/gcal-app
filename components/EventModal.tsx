"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import ConfirmDialog from "@/components/ConfirmDialog";
import DateTimeField from "@/components/DateTimeField";
import { PASTEL_PALETTE } from "@/lib/colors";

export interface EditableEvent {
  id?: string;
  title: string;
  description?: string;
  location?: string;
  color?: string | null;
  start: string;
  end: string;
  allDay?: boolean;
  createdBy?: { name?: string | null; email?: string | null };
  updatedBy?: { name?: string | null; email?: string | null } | null;
}

interface Activity {
  action: string;
  user: { name?: string | null; email?: string | null };
  createdAt: string;
}

interface Props {
  event: EditableEvent;
  canDelete?: boolean;
  onSave: (e: EditableEvent) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
  saving?: boolean;
}

const input =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500";
const label =
  "mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400";

function toLocalInput(value: string, allDay?: boolean) {
  if (!value) return "";
  if (allDay) return value.slice(0, 10);
  const d = new Date(value);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

function parseLocal(value: string, allDay?: boolean): Date {
  const [datePart, timePart = ""] = (value || "").split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const date = new Date(y || 1970, (m || 1) - 1, d || 1);
  if (!allDay && timePart) {
    const [hh, mm] = timePart.split(":").map(Number);
    date.setHours(hh || 0, mm || 0, 0, 0);
  }
  return date;
}

function formatRange(start: string, end: string, allDay?: boolean) {
  const s = parseLocal(start, allDay);
  const e = parseLocal(end, allDay);
  const dOpts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  const tOpts: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
  };
  const sameDate = s.toDateString() === e.toDateString();
  if (allDay) {
    return sameDate
      ? s.toLocaleDateString(undefined, dOpts)
      : `${s.toLocaleDateString(undefined, dOpts)} – ${e.toLocaleDateString(undefined, dOpts)}`;
  }
  if (sameDate) {
    return `${s.toLocaleDateString(undefined, dOpts)} · ${s.toLocaleTimeString([], tOpts)} – ${e.toLocaleTimeString([], tOpts)}`;
  }
  return `${s.toLocaleDateString(undefined, dOpts)} ${s.toLocaleTimeString([], tOpts)} – ${e.toLocaleDateString(undefined, dOpts)} ${e.toLocaleTimeString([], tOpts)}`;
}

function who(u?: { name?: string | null; email?: string | null } | null) {
  if (!u) return "unknown";
  return u.name || u.email || "unknown";
}

export default function EventModal({
  event,
  canDelete,
  onSave,
  onDelete,
  onClose,
  saving,
}: Props) {
  const [form, setForm] = useState<EditableEvent>(event);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">(event.id ? "view" : "edit");

  useEffect(() => {
    setForm({
      ...event,
      color: event.color ?? (event.id ? null : PASTEL_PALETTE[6]),
      start: toLocalInput(event.start, event.allDay),
      end: toLocalInput(event.end, event.allDay),
    });
    setMode(event.id ? "view" : "edit");
    if (event.id) {
      fetch(`/api/events/${event.id}`)
        .then((r) => r.json())
        .then((d) => setActivities(d.event?.activities || []))
        .catch(() => setActivities([]));
    } else {
      setActivities([]);
    }
  }, [event]);

  const isEdit = Boolean(form.id);

  function update<K extends keyof EditableEvent>(
    key: K,
    val: EditableEvent[K]
  ) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function handleSave() {
    if (!form.title.trim()) {
      toast.error("Please enter a title.");
      return;
    }
    onSave({
      ...form,
      start: form.allDay
        ? form.start.slice(0, 10)
        : new Date(form.start).toISOString(),
      end: form.allDay
        ? form.end.slice(0, 10)
        : new Date(form.end).toISOString(),
    });
  }

  const dotColor = form.color || "#2563eb";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0"
        onInteractOutside={(e) => {
          // Don't close the modal when interacting with the floating date picker.
          const t = (e.detail as any)?.originalEvent?.target as
            | HTMLElement
            | undefined;
          if (t?.closest?.("[data-dt-popover]")) e.preventDefault();
        }}
      >
        {mode === "view" ? (
          <>
            {/* Toolbar: edit / delete (close is built into DialogContent) */}
            <div className="flex items-center justify-end gap-1 px-3 pb-1 pr-12 pt-3">
              <button
                onClick={() => setMode("edit")}
                title="Edit"
                aria-label="Edit event"
                className="rounded-md p-2 text-slate-500 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
              {canDelete && onDelete && (
                <button
                  onClick={() => setConfirmDelete(true)}
                  title="Delete"
                  aria-label="Delete event"
                  className="rounded-md p-2 text-slate-500 transition hover:bg-red-50 hover:text-red-600 dark:text-slate-300 dark:hover:bg-red-950/40"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  </svg>
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-6">
              <div className="flex items-start gap-3">
                <span
                  className="mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full"
                  style={{ backgroundColor: dotColor }}
                />
                <DialogTitle className="text-xl leading-snug">
                  {form.title || "(no title)"}
                </DialogTitle>
              </div>

              <div className="mt-3 flex flex-col gap-2 pl-[26px] text-sm text-slate-600 dark:text-slate-300">
                <div>{formatRange(form.start, form.end, form.allDay)}</div>
                {form.location && <div>📍 {form.location}</div>}
                {form.description && (
                  <div className="whitespace-pre-wrap text-slate-600 dark:text-slate-300">
                    {form.description}
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-col gap-1 border-t border-slate-200 pl-[26px] pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <div>Created by {who(form.createdBy)}</div>
                {form.updatedBy && (
                  <div>Last edited by {who(form.updatedBy)}</div>
                )}
                {activities.length > 0 && (
                  <>
                    <div className="mt-1 font-semibold">History</div>
                    {activities.slice(0, 6).map((a, i) => (
                      <div key={i} className="flex gap-1.5">
                        <span>{who(a.user)}</span>
                        <span>{a.action}</span>
                        <span>· {new Date(a.createdAt).toLocaleString()}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <DialogHeader className="px-6 pb-2 pt-6">
              <DialogTitle>{isEdit ? "Edit event" : "New event"}</DialogTitle>
            </DialogHeader>

            <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-6 py-2">
              <div>
                <label className={label}>Title</label>
                <input
                  autoFocus
                  className={input}
                  value={form.title}
                  onChange={(e) => update("title", e.target.value)}
                  placeholder="Add a title"
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!form.allDay}
                  onChange={(e) => update("allDay", e.target.checked)}
                />
                All day
              </label>

              <div>
                <label className={label}>Color</label>
                <div className="flex flex-wrap gap-2">
                  {PASTEL_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => update("color", c)}
                      aria-label={`Pick color ${c}`}
                      className={`h-7 w-7 rounded-full border transition hover:scale-110 ${
                        form.color === c
                          ? "border-transparent ring-2 ring-slate-400 ring-offset-2 dark:ring-offset-slate-900"
                          : "border-black/10"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2.5 sm:flex-row">
                <div className="flex-1">
                  <label className={label}>Start</label>
                  <DateTimeField
                    value={form.start}
                    allDay={form.allDay}
                    onChange={(v) => update("start", v)}
                  />
                </div>
                <div className="flex-1">
                  <label className={label}>End</label>
                  <DateTimeField
                    value={form.end}
                    allDay={form.allDay}
                    onChange={(v) => update("end", v)}
                  />
                </div>
              </div>

              <div>
                <label className={label}>Location</label>
                <input
                  className={input}
                  value={form.location || ""}
                  onChange={(e) => update("location", e.target.value)}
                  placeholder="Optional"
                />
              </div>

              <div>
                <label className={label}>Description</label>
                <textarea
                  className={`${input} min-h-[64px] resize-y`}
                  value={form.description || ""}
                  onChange={(e) => update("description", e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>

            <DialogFooter className="border-t border-slate-200 px-6 py-4 dark:border-slate-800 sm:justify-between">
              {isEdit && canDelete && onDelete ? (
                <Button
                  variant="destructive"
                  className="border border-red-700 sm:mr-auto"
                  onClick={() => setConfirmDelete(true)}
                  disabled={saving}
                >
                  Delete
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => (isEdit ? setMode("view") : onClose())}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this event?"
        description="This permanently removes the event for everyone in the group."
        confirmLabel="Delete"
        onConfirm={() => {
          setConfirmDelete(false);
          if (form.id && onDelete) onDelete(form.id);
        }}
      />
    </Dialog>
  );
}
