"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import CalendarView, {
  CalendarHandle,
  CalendarEvent,
} from "@/components/CalendarView";
import Sidebar from "@/components/Sidebar";
import EventModal, { EditableEvent } from "@/components/EventModal";
import ThemeToggle from "@/components/ThemeToggle";
import NotificationBell from "@/components/NotificationBell";
import NotesPanel from "@/components/NotesPanel";
import FindTimeModal from "@/components/FindTimeModal";
import CommandPalette, { Command } from "@/components/CommandPalette";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface GroupSummary {
  id: string;
  name: string;
  color?: string | null;
  role: string;
  memberCount: number;
  isPersonal: boolean;
}

const dpad = (n: number) => String(n).padStart(2, "0");
const dateStr = (d: Date) =>
  `${d.getFullYear()}-${dpad(d.getMonth() + 1)}-${dpad(d.getDate())}`;

/** Shift a "YYYY-MM-DD" string by whole days (timezone-safe). */
function shiftDateStr(s: string, days: number) {
  const [y, m, d] = s.split("T")[0].split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + days);
  return dateStr(dt);
}

// Safely read an error message even if the response body is empty/non-JSON.
async function errorMessage(res: Response, fallback: string) {
  const data = await res.json().catch(() => null);
  return data?.error || fallback;
}

export default function Home() {
  const { data: session, status } = useSession();
  const { theme, setTheme } = useTheme();
  const calRef = useRef<CalendarHandle>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const [mounted, setMounted] = useState(false);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const [modalEvent, setModalEvent] = useState<EditableEvent | null>(null);
  const [canDelete, setCanDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesCompose, setNotesCompose] = useState<{
    remind?: string;
    groupId?: string | null;
  } | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [focusMemo, setFocusMemo] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // When a calendar date is clicked/dragged, ask whether to add an event or a
  // note (instead of jumping straight into the event composer).
  const [addChoice, setAddChoice] = useState<{
    start: string;
    end?: string;
    allDay: boolean;
  } | null>(null);
  // Bumped by the change poll to tell the bell / notes panel to refetch.
  const [notifTick, setNotifTick] = useState(0);
  const [notesTick, setNotesTick] = useState(0);

  useEffect(() => {
    setMounted(true);
    // Track phone-width screens; collapse the sidebar by default there.
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => {
      setIsMobile(mq.matches);
      setSidebarOpen(!mq.matches);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // FullCalendar sizes to its container; nudge it to refit after the sidebar
  // shows/hides (the main area width changes).
  function toggleSidebar() {
    setSidebarOpen((v) => !v);
    setTimeout(() => window.dispatchEvent(new Event("resize")), 60);
  }

  const loadGroups = useCallback(async () => {
    const res = await fetch("/api/groups").catch(() => null);
    setGroupsLoading(false);
    if (!res || !res.ok) return;
    const d = await res.json();
    const gs: GroupSummary[] = d.groups || [];
    setGroups(gs);
    setVisibleIds((prev) => {
      const valid = gs.map((g) => g.id);
      if (prev.length) return prev.filter((id) => valid.includes(id));
      try {
        const saved = JSON.parse(
          localStorage.getItem("visibleCalendars") || "[]"
        ) as string[];
        const restored = saved.filter((id) => valid.includes(id));
        return restored.length ? restored : valid;
      } catch {
        return valid;
      }
    });
  }, []);

  useEffect(() => {
    if (status === "authenticated") loadGroups();
  }, [status, loadGroups]);

  useEffect(() => {
    try {
      localStorage.setItem("visibleCalendars", JSON.stringify(visibleIds));
    } catch {
      /* ignore */
    }
  }, [visibleIds]);

  // Near-real-time sync: poll a cheap change-signature for the visible
  // calendars and refetch only when it moves. Light on the DB (each poll
  // releases its connection immediately) and pauses while the tab is hidden.
  const visibleKey = visibleIds.join(",");
  useEffect(() => {
    if (status !== "authenticated" || !visibleKey) {
      setLive(false);
      return;
    }
    let last: { events: string; memos: string; notif: string } | null = null;
    let stopped = false;

    async function poll() {
      try {
        const res = await fetch(
          `/api/changes?groupIds=${encodeURIComponent(visibleKey)}`
        );
        if (!res.ok) throw new Error("poll failed");
        const d = await res.json();
        if (stopped) return;
        setLive(true);
        if (last) {
          // Calendar reacts to events + memo reminders.
          if (d.events !== last.events || d.memos !== last.memos)
            calRef.current?.refetch();
          // Notes list reacts to memo changes.
          if (d.memos !== last.memos) setNotesTick((n) => n + 1);
          // Bell reacts to notifications + invitations.
          if (d.notif !== last.notif) setNotifTick((n) => n + 1);
        }
        last = { events: d.events, memos: d.memos, notif: d.notif };
      } catch {
        if (!stopped) setLive(false);
      }
    }

    poll();
    const t = setInterval(() => {
      if (!document.hidden) poll();
    }, 5000);
    return () => {
      stopped = true;
      clearInterval(t);
      setLive(false);
    };
  }, [status, visibleKey]);

  // ⌘K / Ctrl+K toggles the command palette.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const myId = (session?.user as any)?.id as string | undefined;
  const defaultGroupId =
    groups.find((g) => g.isPersonal)?.id || groups[0]?.id || null;
  const roleFor = (gid?: string | null) =>
    groups.find((g) => g.id === gid)?.role || "MEMBER";

  const toggleVisible = useCallback(
    (id: string) =>
      setVisibleIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      ),
    []
  );

  function refetch() {
    calRef.current?.refetch();
  }

  function openNewEvent() {
    if (!defaultGroupId) {
      toast("No calendar available yet.");
      return;
    }
    // Default to an all-day event for today (inclusive single day).
    const today = dateStr(new Date());
    setModalEvent({
      title: "",
      start: today,
      end: today,
      allDay: true,
    });
    setCanDelete(false);
  }

  async function openEventById(id: string) {
    try {
      const res = await fetch(`/api/events/${id}`);
      if (!res.ok) return;
      const { event: ev } = await res.json();
      setModalEvent({
        id: ev.id,
        title: ev.title,
        description: ev.description,
        location: ev.location,
        color: ev.color,
        start: ev.start,
        end: ev.end,
        allDay: ev.allDay,
        groupId: ev.groupId,
        createdBy: ev.createdBy,
        updatedBy: ev.updatedBy,
      });
      const role = roleFor(ev.groupId);
      setCanDelete(
        role === "OWNER" || role === "ADMIN" || ev.createdBy?.id === myId
      );
    } catch {
      /* ignore */
    }
  }

  const openExisting = useCallback(
    (ev: CalendarEvent) => {
      setModalEvent(ev);
      const role = roleFor(ev.groupId);
      const isCreator = (ev.createdBy as any)?.id === myId;
      setCanDelete(role === "OWNER" || role === "ADMIN" || isCreator);
    },
    [groups, myId]
  );

  // Dragging a range also opens the Event/Note chooser (carrying the span).
  const handleSelectRange = useCallback(
    (range: { start: string; end: string; allDay: boolean }) => {
      setAddChoice({
        start: range.start,
        end: range.end,
        allDay: range.allDay,
      });
    },
    []
  );

  async function handleSave(e: EditableEvent) {
    setSaving(true);
    try {
      if (e.id) {
        const res = await fetch(`/api/events/${e.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(e),
        });
        if (!res.ok) throw new Error(await errorMessage(res, "Update failed"));
      } else {
        const res = await fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...e, groupId: e.groupId || defaultGroupId }),
        });
        if (!res.ok) throw new Error(await errorMessage(res, "Create failed"));
      }
      setModalEvent(null);
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/events/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await errorMessage(res, "Delete failed"));
      setModalEvent(null);
      refetch();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  const handleReschedule = useCallback(
    async (e: { id: string; start: string; end: string; allDay: boolean }) => {
      try {
        const res = await fetch(`/api/events/${e.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            start: e.start,
            end: e.end,
            allDay: e.allDay,
          }),
        });
        if (!res.ok) throw new Error(await errorMessage(res, "Update failed"));
        calRef.current?.refetch();
      } catch (err: any) {
        toast.error(err.message);
        calRef.current?.refetch();
      }
    },
    []
  );

  // No full-page loader: render the app shell straight away and let the
  // per-section skeletons (sidebar, calendar, notifications) cover loading.
  if (status === "unauthenticated") {
    if (typeof window !== "undefined") window.location.href = "/login";
    return null;
  }

  function openNewNote() {
    setFocusMemo(null);
    setNotesCompose({});
    setNotesOpen(true);
  }

  const paletteCommands: Command[] = [
    {
      id: "new-event",
      label: "New event",
      icon: "📅",
      hint: "create",
      keywords: "add create event",
      run: openNewEvent,
    },
    {
      id: "new-note",
      label: "New note",
      icon: "📝",
      hint: "create",
      keywords: "memo todo deadline",
      run: openNewNote,
    },
    {
      id: "find-time",
      label: "Find a time",
      icon: "🕐",
      keywords: "schedule meeting availability free",
      run: () => setFindOpen(true),
    },
    {
      id: "open-notes",
      label: "Open notes",
      icon: "🗒️",
      keywords: "memos",
      run: () => {
        setFocusMemo(null);
        setNotesCompose(null);
        setNotesOpen(true);
      },
    },
    {
      id: "today",
      label: "Go to today",
      icon: "📆",
      keywords: "now jump",
      run: () => calRef.current?.today(),
    },
    {
      id: "view-month",
      label: "Month view",
      icon: "▦",
      keywords: "calendar view",
      run: () => calRef.current?.view("dayGridMonth"),
    },
    {
      id: "view-week",
      label: "Week view",
      icon: "▤",
      keywords: "calendar view",
      run: () => calRef.current?.view("timeGridWeek"),
    },
    {
      id: "view-day",
      label: "Day view",
      icon: "▥",
      keywords: "calendar view",
      run: () => calRef.current?.view("timeGridDay"),
    },
    {
      id: "view-list",
      label: "List view",
      icon: "☰",
      keywords: "agenda calendar view",
      run: () => calRef.current?.view("listMonth"),
    },
    {
      id: "theme",
      label:
        theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
      icon: theme === "dark" ? "☀️" : "🌙",
      keywords: "dark light mode appearance",
      run: () => setTheme(theme === "dark" ? "light" : "dark"),
    },
    // Toggle each calendar's visibility.
    ...groups.map((g) => ({
      id: `toggle-${g.id}`,
      label: `${visibleIds.includes(g.id) ? "Hide" : "Show"} ${
        g.isPersonal ? "Personal" : g.name
      }`,
      icon: "◑",
      keywords: "calendar toggle visibility show hide",
      run: () => toggleVisible(g.id),
    })),
    {
      id: "signout",
      label: "Sign out",
      icon: "🚪",
      keywords: "logout leave",
      run: () => signOut({ callbackUrl: "/login" }),
    },
  ];

  const sidebarEl = (
    <Sidebar
      user={session?.user}
      groups={groups}
      groupsLoading={groupsLoading}
      visibleIds={visibleIds}
      onToggleVisible={toggleVisible}
      onGroupsChanged={loadGroups}
      onNewEvent={() => {
        openNewEvent();
        if (isMobile) setSidebarOpen(false);
      }}
    />
  );

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Desktop: sidebar pushes content. Mobile: slide-in drawer over content. */}
      {!isMobile && sidebarOpen && sidebarEl}
      {isMobile && sidebarOpen && (
        <>
          <div
            className="animate-fade-in fixed inset-0 z-30 bg-black/40 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="animate-slide-in-left fixed inset-y-0 left-0 z-40 shadow-2xl">
            {sidebarEl}
          </div>
        </>
      )}

      <main className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-3 pt-3 md:px-5">
          <button
            onClick={toggleSidebar}
            aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <line x1="9" y1="4" x2="9" y2="20" />
            </svg>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setPaletteOpen(true)}
              aria-label="Command palette"
              title="Command palette (Ctrl/⌘ K)"
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
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
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <kbd className="hidden rounded border border-slate-200 px-1 text-[10px] dark:border-slate-600 sm:inline">
                ⌘K
              </kbd>
            </button>
            <span
              title={live ? "Live — updates in real time" : "Reconnecting…"}
              className="hidden items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400 sm:flex"
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  live
                    ? "animate-pulse bg-emerald-500"
                    : "bg-slate-300 dark:bg-slate-600"
                }`}
              />
              {live ? "Live" : "Offline"}
            </span>
            <button
              onClick={() => setFindOpen(true)}
              aria-label="Find a time"
              title="Find a time"
              className="hidden items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 sm:flex"
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
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              <span className="hidden sm:inline">Find a time</span>
            </button>
            <button
              onClick={() => {
                setFocusMemo(null);
                setNotesCompose(null);
                setNotesOpen(true);
              }}
              aria-label="Notes"
              title="Notes"
              className="hidden items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 sm:flex"
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
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <line x1="8" y1="13" x2="16" y2="13" />
                <line x1="8" y1="17" x2="13" y2="17" />
              </svg>
              <span className="hidden sm:inline">Notes</span>
            </button>
            <NotificationBell
              refreshSignal={notifTick}
              onOpenEvent={openEventById}
              onInvitationAccepted={(groupId) => {
                loadGroups();
                setVisibleIds((prev) =>
                  prev.includes(groupId) ? prev : [...prev, groupId]
                );
              }}
            />
            <span className="hidden sm:block">
              <ThemeToggle />
            </span>

            {/* Mobile overflow menu */}
            <div className="relative sm:hidden">
              <button
                onClick={() => setMoreOpen((o) => !o)}
                aria-label="More"
                title="More"
                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
              {moreOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setMoreOpen(false)}
                  />
                  <div className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          live
                            ? "animate-pulse bg-emerald-500"
                            : "bg-slate-300 dark:bg-slate-600"
                        }`}
                      />
                      {live ? "Live — real-time updates" : "Reconnecting…"}
                    </div>
                    <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                    <button
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                      onClick={() => {
                        setMoreOpen(false);
                        setFindOpen(true);
                      }}
                    >
                      🕐 Find a time
                    </button>
                    <button
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                      onClick={() => {
                        setMoreOpen(false);
                        setFocusMemo(null);
                        setNotesCompose(null);
                        setNotesOpen(true);
                      }}
                    >
                      🗒️ Notes
                    </button>
                    <button
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                      onClick={() => {
                        setMoreOpen(false);
                        setTheme(theme === "dark" ? "light" : "dark");
                      }}
                    >
                      {theme === "dark" ? "☀️ Light theme" : "🌙 Dark theme"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-hidden p-3 pt-2 md:px-5 md:pb-5">
          <div className="animate-fade-in h-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-4">
            {mounted && (
              <CalendarView
                ref={calRef}
                groupIds={visibleIds}
                groupColors={Object.fromEntries(
                  groups.map((g) => [g.id, g.color || null])
                )}
                onEventClick={openExisting}
                onSelectRange={handleSelectRange}
                onReschedule={handleReschedule}
                onMemoClick={(id) => {
                  setFocusMemo(id);
                  setNotesOpen(true);
                }}
                onDateClick={({ dateStr, allDay }) =>
                  setAddChoice({ start: dateStr, allDay })
                }
              />
            )}
          </div>
        </div>
      </main>

      {/* Mobile-only floating "new event" button (sidebar is hidden in a drawer). */}
      <button
        onClick={openNewEvent}
        aria-label="New event"
        title="New event"
        className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-lg transition hover:bg-accent-dark active:scale-95 sm:hidden"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {modalEvent && (
        <EventModal
          event={modalEvent}
          canDelete={canDelete}
          saving={saving}
          groups={groups}
          defaultGroupId={defaultGroupId}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setModalEvent(null)}
        />
      )}

      {/* Choose what to add when a calendar date is clicked */}
      <Dialog open={!!addChoice} onOpenChange={(o) => !o && setAddChoice(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to calendar</DialogTitle>
            <DialogDescription>
              Create an event or a note for this date.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => {
                const c = addChoice!;
                if (c.allDay) {
                  const start = c.start.slice(0, 10);
                  // Drag gives an exclusive end; make it inclusive (else single day).
                  const inclusive = c.end ? shiftDateStr(c.end, -1) : start;
                  const end = inclusive < start ? start : inclusive;
                  setModalEvent({ title: "", start, end, allDay: true });
                } else {
                  const s = new Date(c.start);
                  const end = c.end
                    ? new Date(c.end).toISOString()
                    : new Date(s.getTime() + 3600000).toISOString();
                  setModalEvent({
                    title: "",
                    start: s.toISOString(),
                    end,
                    allDay: false,
                  });
                }
                setCanDelete(false);
                setAddChoice(null);
              }}
              className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 p-5 text-sm font-medium transition hover:border-blue-500 hover:bg-blue-50 dark:border-slate-700 dark:hover:bg-blue-950/30"
            >
              <span className="text-2xl">📅</span>
              Event
            </button>
            <button
              onClick={() => {
                const c = addChoice!;
                let remind: string;
                if (c.allDay) {
                  remind = `${c.start.slice(0, 10)}T09:00`;
                } else {
                  const d = new Date(c.start);
                  const p = (n: number) => String(n).padStart(2, "0");
                  remind = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(
                    d.getDate()
                  )}T${p(d.getHours())}:${p(d.getMinutes())}`;
                }
                setNotesCompose({ remind, groupId: defaultGroupId });
                setFocusMemo(null);
                setNotesOpen(true);
                setAddChoice(null);
              }}
              className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 p-5 text-sm font-medium transition hover:border-blue-500 hover:bg-blue-50 dark:border-slate-700 dark:hover:bg-blue-950/30"
            >
              <span className="text-2xl">📝</span>
              Note
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <FindTimeModal
        open={findOpen}
        onClose={() => setFindOpen(false)}
        groups={groups}
        defaultGroupId={defaultGroupId}
        onPick={(slot, guests, gid) => {
          setFindOpen(false);
          setModalEvent({
            title: "",
            start: slot.start,
            end: slot.end,
            allDay: false,
            groupId: gid,
            prefillAttendees: guests,
          });
          setCanDelete(false);
        }}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={paletteCommands}
        onOpenEvent={openEventById}
        onOpenMemo={(id) => {
          setFocusMemo(id);
          setNotesOpen(true);
        }}
      />

      <NotesPanel
        open={notesOpen}
        onClose={() => {
          setNotesOpen(false);
          setFocusMemo(null);
        }}
        groups={groups}
        defaultGroupId={defaultGroupId}
        focusMemoId={focusMemo}
        compose={notesCompose}
        refreshSignal={notesTick}
        onChanged={() => calRef.current?.refetch()}
      />
    </div>
  );
}
