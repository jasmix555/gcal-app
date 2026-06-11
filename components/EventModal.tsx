"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import ConfirmDialog from "@/components/ConfirmDialog";
import DateTimeField from "@/components/DateTimeField";
import { colorForKey } from "@/lib/colors";
import Avatar from "@/components/Avatar";

export interface EditableEvent {
  id?: string;
  title: string;
  description?: string;
  location?: string;
  color?: string | null;
  groupId?: string | null; // which calendar the event belongs to
  start: string;
  end: string;
  allDay?: boolean;
  attendees?: string[]; // emails (sent on save)
  createdBy?: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  updatedBy?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
}

interface Attendee {
  id?: string;
  name?: string | null;
  email: string;
  image?: string | null;
  status?: string;
}

interface Activity {
  action: string;
  user: { name?: string | null; email?: string | null };
  createdAt: string;
}

interface GroupOption {
  id: string;
  name: string;
  isPersonal?: boolean;
}

interface Props {
  event: EditableEvent;
  canDelete?: boolean;
  groups?: GroupOption[];
  defaultGroupId?: string | null;
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

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Shift a "YYYY-MM-DD" (or ISO) date string by N whole days, keeping date-only. */
function shiftDate(value: string, days: number): string {
  const [y, m, d] = (value || "").split("T")[0].split("-").map(Number);
  const dt = new Date(y || 1970, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
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

const STATUS_STYLE: Record<string, string> = {
  ACCEPTED:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  DECLINED: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  PROPOSED:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  INVITED: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};
const STATUS_LABEL: Record<string, string> = {
  ACCEPTED: "Going",
  DECLINED: "Declined",
  PROPOSED: "Proposed new time",
  INVITED: "Invited",
};

export default function EventModal({
  event,
  canDelete,
  groups = [],
  defaultGroupId,
  onSave,
  onDelete,
  onClose,
  saving,
}: Props) {
  const { data: session } = useSession();
  const myId = (session?.user as any)?.id as string | undefined;

  const [form, setForm] = useState<EditableEvent>(event);
  const [targetGroupId, setTargetGroupId] = useState<string | null>(
    event.groupId ?? defaultGroupId ?? null
  );
  const [activities, setActivities] = useState<Activity[]>([]);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [members, setMembers] = useState<Attendee[]>([]);
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPickerOpen, setGuestPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">(event.id ? "view" : "edit");
  const [proposing, setProposing] = useState(false);
  const [proposeStart, setProposeStart] = useState("");
  const [proposeEnd, setProposeEnd] = useState("");
  const [rsvpLoading, setRsvpLoading] = useState(false);

  useEffect(() => {
    // All-day ends are stored exclusive (the day AFTER the event). Show the
    // user an inclusive end date while editing an existing event.
    let endVal = toLocalInput(event.end, event.allDay);
    if (event.allDay && event.id) {
      const inclusive = shiftDate(endVal, -1);
      endVal = inclusive < event.start.slice(0, 10) ? endVal : inclusive;
    }
    setForm({
      ...event,
      start: toLocalInput(event.start, event.allDay),
      end: endVal,
    });
    setMode(event.id ? "view" : "edit");
    setProposing(false);
    setAttendees([]);
    setTargetGroupId(event.groupId ?? defaultGroupId ?? null);
    if (event.id) {
      fetch(`/api/events/${event.id}`)
        .then((r) => r.json())
        .then((d) => {
          setActivities(d.event?.activities || []);
          setAttendees(d.event?.attendees || []);
          if (d.event?.groupId) setTargetGroupId(d.event.groupId);
        })
        .catch(() => {});
    } else {
      setActivities([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);

  // Members of the chosen calendar — offered as a quick "add guest" dropdown.
  useEffect(() => {
    if (!targetGroupId) {
      setMembers([]);
      return;
    }
    fetch(`/api/groups/${targetGroupId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setMembers(
          (d.members || []).map((m: any) => ({
            id: m.id,
            name: m.name,
            email: m.email,
            image: m.image,
          }))
        );
      })
      .catch(() => {});
  }, [targetGroupId]);

  const isEdit = Boolean(form.id);
  const myAttendee = attendees.find((a) => a.id && a.id === myId);
  const amOrganizer = (form.createdBy as any)?.id === myId;

  function update<K extends keyof EditableEvent>(
    key: K,
    val: EditableEvent[K]
  ) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function addGuest(e: React.FormEvent) {
    e.preventDefault();
    const email = guestEmail.trim().toLowerCase();
    if (!email) return;
    if (attendees.some((a) => a.email === email)) {
      setGuestEmail("");
      return;
    }
    try {
      const res = await fetch(
        `/api/users/resolve?email=${encodeURIComponent(email)}`
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not find that person.");
      setAttendees((arr) => [...arr, { ...d.user, status: "INVITED" }]);
      setGuestEmail("");
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  function removeGuest(email: string) {
    setAttendees((arr) => arr.filter((a) => a.email !== email));
  }

  function handleSave() {
    if (!form.title.trim()) {
      toast.error("Please enter a title.");
      return;
    }
    let start: string;
    let end: string;
    if (form.allDay) {
      const startDate = form.start.slice(0, 10);
      let endInclusive = form.end.slice(0, 10);
      if (endInclusive < startDate) endInclusive = startDate;
      start = startDate;
      // Store an exclusive end (day after) so a multi-day span renders fully.
      end = shiftDate(endInclusive, 1);
    } else {
      start = new Date(form.start).toISOString();
      end = new Date(form.end).toISOString();
    }
    onSave({
      ...form,
      groupId: targetGroupId,
      attendees: attendees.map((a) => a.email),
      start,
      end,
    });
  }

  async function submitRsvp(status: "ACCEPTED" | "DECLINED" | "PROPOSED") {
    if (!form.id) return;
    setRsvpLoading(true);
    try {
      const extra =
        status === "PROPOSED"
          ? {
              proposedStart: new Date(proposeStart).toISOString(),
              proposedEnd: new Date(proposeEnd).toISOString(),
            }
          : {};
      const res = await fetch(`/api/events/${form.id}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...extra }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Could not respond");
      }
      toast.success(
        status === "ACCEPTED"
          ? "You're going"
          : status === "DECLINED"
            ? "Declined"
            : "Proposed a new time"
      );
      const d = await (await fetch(`/api/events/${form.id}`)).json();
      setAttendees(d.event?.attendees || []);
      setProposing(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setRsvpLoading(false);
    }
  }

  function startPropose() {
    setProposeStart(form.start);
    setProposeEnd(form.end);
    setProposing(true);
  }

  const dotColor = colorForKey(targetGroupId || form.groupId);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 max-sm:!left-0 max-sm:!top-0 max-sm:!h-[100dvh] max-sm:!max-h-[100dvh] max-sm:!w-full max-sm:!max-w-none max-sm:!translate-x-0 max-sm:!translate-y-0 max-sm:!rounded-none max-sm:!border-0"
        onInteractOutside={(e) => {
          const t = (e.detail as any)?.originalEvent?.target as
            | HTMLElement
            | undefined;
          if (t?.closest?.("[data-dt-popover]")) e.preventDefault();
        }}
      >
        <DialogDescription className="sr-only">
          Event details and actions
        </DialogDescription>
        {mode === "view" ? (
          <>
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
                  <div className="whitespace-pre-wrap">{form.description}</div>
                )}
              </div>

              {attendees.length > 0 && (
                <div className="mt-4 pl-[26px]">
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                    Guests
                  </div>
                  <div className="flex flex-col gap-1">
                    {attendees.map((a) => (
                      <div
                        key={a.email}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span className="truncate">{a.name || a.email}</span>
                        <span
                          className={`ml-auto rounded-full px-2 py-0.5 text-[11px] ${STATUS_STYLE[a.status || "INVITED"]}`}
                        >
                          {STATUS_LABEL[a.status || "INVITED"]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* RSVP — shown to an invited guest (not the organizer) */}
              {myAttendee && !amOrganizer && (
                <div className="mt-4 rounded-xl border border-slate-200 p-3 pl-[26px] dark:border-slate-800">
                  <div className="mb-2 text-sm font-medium">Your response</div>
                  {!proposing ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => submitRsvp("ACCEPTED")}
                        disabled={rsvpLoading}
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => submitRsvp("DECLINED")}
                        disabled={rsvpLoading}
                      >
                        Decline
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={startPropose}
                        disabled={rsvpLoading}
                      >
                        Propose new time
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <DateTimeField
                          value={proposeStart}
                          allDay={form.allDay}
                          onChange={setProposeStart}
                        />
                        <DateTimeField
                          value={proposeEnd}
                          allDay={form.allDay}
                          onChange={setProposeEnd}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => submitRsvp("PROPOSED")}
                          disabled={rsvpLoading}
                        >
                          Send proposal
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setProposing(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-4 flex flex-col gap-1.5 border-t border-slate-200 pl-[26px] pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <div className="flex items-center gap-1.5">
                  <Avatar
                    src={form.createdBy?.image}
                    name={form.createdBy?.name}
                    email={form.createdBy?.email}
                    className="h-5 w-5"
                  />
                  Created by {who(form.createdBy)}
                </div>
                {form.updatedBy && (
                  <div className="flex items-center gap-1.5">
                    <Avatar
                      src={form.updatedBy?.image}
                      name={form.updatedBy?.name}
                      email={form.updatedBy?.email}
                      className="h-5 w-5"
                    />
                    Last edited by {who(form.updatedBy)}
                  </div>
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
              {groups.length > 0 && (
                <div>
                  <label className={label}>Calendar</label>
                  <select
                    className={`${input} pr-9`}
                    value={targetGroupId || ""}
                    onChange={(e) => setTargetGroupId(e.target.value)}
                  >
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.isPersonal ? "🔒 Personal (only me)" : g.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

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

              <div className="flex flex-col gap-2.5 sm:flex-row">
                <div className="flex-1">
                  <label className={label}>Start</label>
                  <DateTimeField
                    value={form.start}
                    allDay={form.allDay}
                    onChange={(v) => update("start", v)}
                    rangeStart={form.start}
                    rangeEnd={form.end}
                  />
                </div>
                <div className="flex-1">
                  <label className={label}>End</label>
                  <DateTimeField
                    value={form.end}
                    allDay={form.allDay}
                    onChange={(v) => update("end", v)}
                    rangeStart={form.start}
                    rangeEnd={form.end}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!form.allDay}
                  onChange={(e) => update("allDay", e.target.checked)}
                />
                All day
              </label>

              {/* Guests / attendees */}
              <div>
                <label className={label}>Guests</label>
                {members.filter((m) => m.id !== myId).length > 0 && (
                  <div className="relative mb-2">
                    <button
                      type="button"
                      onClick={() => setGuestPickerOpen((o) => !o)}
                      className={`${input} flex items-center justify-between`}
                    >
                      <span className="text-slate-500 dark:text-slate-400">
                        Add calendar members…
                      </span>
                      <span className="text-slate-400">▾</span>
                    </button>
                    {guestPickerOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setGuestPickerOpen(false)}
                        />
                        <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                          {members
                            .filter((m) => m.id !== myId)
                            .map((m) => {
                              const checked = attendees.some(
                                (a) => a.email === m.email
                              );
                              return (
                                <label
                                  key={m.id || m.email}
                                  className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                      setAttendees((arr) =>
                                        checked
                                          ? arr.filter(
                                              (a) => a.email !== m.email
                                            )
                                          : [
                                              ...arr,
                                              { ...m, status: "INVITED" },
                                            ]
                                      )
                                    }
                                  />
                                  <span className="truncate">
                                    {m.name || m.email}
                                  </span>
                                </label>
                              );
                            })}
                        </div>
                      </>
                    )}
                  </div>
                )}
                <form className="flex gap-2" onSubmit={addGuest}>
                  <input
                    className={input}
                    type="email"
                    placeholder="Or add guest by email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                  />
                  <Button type="submit" variant="outline">
                    Add
                  </Button>
                </form>
                {attendees.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {attendees.map((a) => (
                      <div
                        key={a.email}
                        className="inline-flex w-fit max-w-full items-center gap-1.5 rounded-full bg-slate-100 py-1 pl-2 pr-1 text-sm dark:bg-slate-800"
                      >
                        <Avatar
                          src={a.image}
                          name={a.name}
                          email={a.email}
                          className="h-5 w-5"
                        />
                        <span className="truncate">{a.name || a.email}</span>
                        {a.status && a.status !== "INVITED" && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS_STYLE[a.status]}`}
                          >
                            {STATUS_LABEL[a.status]}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => removeGuest(a.email)}
                          aria-label={`Remove ${a.email}`}
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs text-slate-400 transition hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-950/40"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
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

            <DialogFooter className="flex-row items-center justify-between gap-2 border-t border-slate-200 px-6 py-4 dark:border-slate-800 max-sm:pb-[calc(1rem+env(safe-area-inset-bottom))] sm:justify-between">
              {isEdit && canDelete && onDelete ? (
                <Button
                  variant="destructive"
                  className="border border-red-700"
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
