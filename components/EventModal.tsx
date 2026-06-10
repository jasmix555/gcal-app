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
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500";
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
  const [confirmDelete, setConfirmDelete] = useState(false);

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

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit event" : "New event"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3.5">
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
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          {isEdit && canDelete && onDelete ? (
            <Button
              variant="outline"
              className="border-red-300 text-red-600 hover:bg-red-50 sm:mr-auto"
              onClick={() => setConfirmDelete(true)}
              disabled={saving}
            >
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
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
