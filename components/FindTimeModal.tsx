"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Avatar from "@/components/Avatar";

interface GroupSummary {
  id: string;
  name: string;
  isPersonal?: boolean;
}
interface Member {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}
export interface PickedGuest {
  email: string;
  name?: string | null;
  image?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  groups: GroupSummary[];
  defaultGroupId?: string | null;
  onPick: (
    slot: { start: string; end: string },
    guests: PickedGuest[],
    groupId: string
  ) => void;
}

const input =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";
const label =
  "mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400";

const pad = (n: number) => String(n).padStart(2, "0");
const dateStr = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default function FindTimeModal({
  open,
  onClose,
  groups,
  defaultGroupId,
  onPick,
}: Props) {
  // Personal "only me" calendars are pointless for scheduling with others.
  const teamGroups = groups.filter((g) => !g.isPersonal);
  const firstTeam = teamGroups[0]?.id || "";
  const [groupId, setGroupId] = useState(
    defaultGroupId && teamGroups.some((g) => g.id === defaultGroupId)
      ? defaultGroupId
      : firstTeam
  );
  const [members, setMembers] = useState<Member[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [from, setFrom] = useState(dateStr(new Date()));
  const [to, setTo] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return dateStr(d);
  });
  const [duration, setDuration] = useState(60);
  const [dayStart, setDayStart] = useState(9);
  const [dayEnd, setDayEnd] = useState(18);
  const [slots, setSlots] = useState<{ start: string; end: string }[]>([]);
  const [days, setDays] = useState<string[]>([]);
  const [heat, setHeat] = useState<Record<string, number[]>>({});
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Load members of the chosen calendar; select everyone by default.
  const loadMembers = useCallback((gid: string) => {
    if (!gid) return;
    fetch(`/api/groups/${gid}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        const ms: Member[] = d.members || [];
        setMembers(ms);
        setSelected(new Set(ms.map((m) => m.id)));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (open && groupId) loadMembers(groupId);
  }, [open, groupId, loadMembers]);

  useEffect(() => {
    if (open) {
      setGroupId(
        defaultGroupId && teamGroups.some((g) => g.id === defaultGroupId)
          ? defaultGroupId
          : firstTeam
      );
      setSlots([]);
      setDays([]);
      setHeat({});
      setSearched(false);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function search() {
    setLoading(true);
    setSearched(true);
    try {
      const params = new URLSearchParams({
        userIds: Array.from(selected).join(","),
        from,
        to,
        duration: String(duration),
        dayStart: String(dayStart),
        dayEnd: String(dayEnd),
        tz: String(new Date().getTimezoneOffset()),
      });
      const res = await fetch(`/api/availability?${params.toString()}`);
      const d = await res.json();
      setSlots(d.slots || []);
      setDays(d.days || []);
      setHeat(d.heat || {});
    } catch {
      setSlots([]);
      setDays([]);
      setHeat({});
    } finally {
      setLoading(false);
    }
  }

  function pick(slot: { start: string; end: string }) {
    const guests: PickedGuest[] = members
      .filter((m) => selected.has(m.id) && m.email)
      .map((m) => ({ email: m.email!, name: m.name, image: m.image }));
    onPick(slot, guests, groupId);
  }

  // Group slots by local day for display.
  const byDay = slots.reduce<Record<string, { start: string; end: string }[]>>(
    (acc, s) => {
      const key = new Date(s.start).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      (acc[key] = acc[key] || []).push(s);
      return acc;
    },
    {}
  );

  if (!open) return null;

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });

  const heatColor = (f: number) => {
    if (f <= 0) return "bg-emerald-100 dark:bg-emerald-900/40";
    if (f < 0.34) return "bg-lime-300 dark:bg-lime-700/60";
    if (f < 0.67) return "bg-amber-300 dark:bg-amber-600/70";
    return "bg-red-400 dark:bg-red-600/80";
  };

  const chosenMembers = members.filter((m) => selected.has(m.id));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 max-sm:!left-0 max-sm:!top-0 max-sm:!h-[100dvh] max-sm:!max-h-[100dvh] max-sm:!w-full max-sm:!max-w-none max-sm:!translate-x-0 max-sm:!translate-y-0 max-sm:!rounded-none max-sm:!border-0">
        <DialogHeader className="px-6 pb-2 pt-6">
          <DialogTitle>Find a time</DialogTitle>
          <DialogDescription>
            Pick who needs to attend and we&apos;ll show slots where everyone is
            free.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-6 py-2">
          <div>
            <label className={label}>Calendar</label>
            {teamGroups.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 dark:border-slate-600">
                Create or join a shared calendar to find a time with others.
              </p>
            ) : (
              <select
                className={`${input} pr-9`}
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
              >
                {teamGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className={label}>Who needs to attend</label>
            {members.length === 0 ? (
              <div className="flex flex-col gap-1.5">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-7 w-40" />
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {members.map((m) => {
                  const on = selected.has(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggle(m.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-sm transition ${
                        on
                          ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                          : "border-slate-200 text-slate-500 dark:border-slate-700"
                      }`}
                    >
                      <Avatar
                        src={m.image}
                        name={m.name}
                        email={m.email}
                        colorKey={m.id}
                        className="h-5 w-5"
                      />
                      {m.name || m.email}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>From</label>
              <input
                type="date"
                className={input}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <label className={label}>To</label>
              <input
                type="date"
                className={input}
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={label}>Duration</label>
              <select
                className={`${input} pr-8`}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              >
                <option value={30}>30 min</option>
                <option value={60}>1 hour</option>
                <option value={90}>1.5 hours</option>
                <option value={120}>2 hours</option>
              </select>
            </div>
            <div>
              <label className={label}>Day from</label>
              <select
                className={`${input} pr-8`}
                value={dayStart}
                onChange={(e) => setDayStart(Number(e.target.value))}
              >
                {Array.from({ length: 24 }).map((_, h) => (
                  <option key={h} value={h}>
                    {pad(h)}:00
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Day to</label>
              <select
                className={`${input} pr-8`}
                value={dayEnd}
                onChange={(e) => setDayEnd(Number(e.target.value))}
              >
                {Array.from({ length: 24 }).map((_, h) => (
                  <option key={h + 1} value={h + 1}>
                    {pad(h + 1)}:00
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Per-member availability heat strip */}
          {searched && !loading && days.length > 0 && (
            <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
              <div className="mb-1 flex items-center justify-between">
                <span className={label}>Availability</span>
                <span className="flex items-center gap-1 text-[10px] text-slate-400">
                  free
                  <span className="h-2.5 w-2.5 rounded-sm bg-emerald-100 dark:bg-emerald-900/40" />
                  <span className="h-2.5 w-2.5 rounded-sm bg-amber-300 dark:bg-amber-600/70" />
                  <span className="h-2.5 w-2.5 rounded-sm bg-red-400 dark:bg-red-600/80" />
                  busy
                </span>
              </div>
              <div className="overflow-x-auto">
                <div className="flex items-center gap-1 pl-7">
                  {days.map((d) => (
                    <div
                      key={d}
                      className="w-5 shrink-0 text-center text-[10px] text-slate-400"
                    >
                      {Number(d.split("-")[2])}
                    </div>
                  ))}
                </div>
                {chosenMembers.map((m) => (
                  <div key={m.id} className="mt-1 flex items-center gap-1">
                    <div className="w-6 shrink-0">
                      <Avatar
                        src={m.image}
                        name={m.name}
                        email={m.email}
                        colorKey={m.id}
                        className="h-5 w-5"
                      />
                    </div>
                    {(heat[m.id] || []).map((f, i) => (
                      <div
                        key={i}
                        title={`${m.name || m.email}: ${Math.round(
                          f * 100
                        )}% booked`}
                        className={`h-5 w-5 shrink-0 rounded-sm ${heatColor(f)}`}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Results */}
          {searched && (
            <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
              {loading ? (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : slots.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">
                  No common free slots in that window. Try a wider range or
                  shorter meeting.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {Object.entries(byDay).map(([day, daySlots]) => (
                    <div key={day}>
                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                        {day}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {daySlots.map((s) => (
                          <button
                            key={s.start}
                            onClick={() => pick(s)}
                            className="rounded-lg border border-slate-200 px-2.5 py-1 text-sm transition hover:border-blue-500 hover:bg-blue-50 dark:border-slate-700 dark:hover:bg-blue-950/40"
                          >
                            {fmtTime(s.start)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4 dark:border-slate-800 max-sm:pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={search} disabled={loading || !groupId}>
            {loading ? "Searching…" : "Find times"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
