"use client";

import { useEffect, useState } from "react";

export interface EditableEvent {
  id?: string;
  title: string;
  description?: string;
  location?: string;
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
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent";
const label = "mb-1 block text-xs font-medium text-slate-500";

function toLocalInput(value: string, allDay?: boolean) {
  if (!value) return "";
  if (allDay) return value.slice(0, 10);
  const d = new Date(value);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
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

  useEffect(() => {
    setForm({
      ...event,
      start: toLocalInput(event.start, event.allDay),
      end: toLocalInput(event.end, event.allDay),
    });
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
      alert("Please enter a title.");
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

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="animate-scale-in flex max-h-[calc(100vh-3rem)] w-[440px] max-w-full flex-col gap-3.5 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">
          {isEdit ? "Edit event" : "New event"}
        </h3>

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

        <div className="flex flex-col gap-2.5 sm:flex-row">
          <div className="flex-1">
            <label className={label}>Start</label>
            <input
              className={input}
              type={form.allDay ? "date" : "datetime-local"}
              value={form.start}
              onChange={(e) => update("start", e.target.value)}
            />
          </div>
          <div className="flex-1">
            <label className={label}>End</label>
            <input
              className={input}
              type={form.allDay ? "date" : "datetime-local"}
              value={form.end}
              onChange={(e) => update("end", e.target.value)}
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

        {isEdit && (
          <div className="flex flex-col gap-1 border-t border-slate-200 pt-2.5 text-xs text-slate-500">
            <div>Created by {who(form.createdBy)}</div>
            {form.updatedBy && <div>Last edited by {who(form.updatedBy)}</div>}
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
        )}

        <div className="mt-1 flex items-center justify-between gap-2">
          {isEdit && canDelete && onDelete ? (
            <button
              className="rounded-lg border border-red-500 bg-white px-3 py-2 text-sm text-red-500 transition hover:bg-red-50 disabled:opacity-50"
              onClick={() => onDelete(form.id as string)}
              disabled={saving}
            >
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition hover:bg-slate-50 disabled:opacity-50"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              className="rounded-lg border border-accent bg-accent px-3 py-2 text-sm text-white transition hover:bg-accent-dark disabled:opacity-50"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
