"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import CalendarView, {
  CalendarHandle,
  CalendarEvent,
} from "@/components/CalendarView";
import Sidebar from "@/components/Sidebar";
import EventModal, { EditableEvent } from "@/components/EventModal";
import ThemeToggle from "@/components/ThemeToggle";
import NotificationBell from "@/components/NotificationBell";
import NotesPanel from "@/components/NotesPanel";
import { toast } from "sonner";

interface GroupSummary {
  id: string;
  name: string;
  role: string;
  memberCount: number;
  isPersonal: boolean;
}

// Safely read an error message even if the response body is empty/non-JSON.
async function errorMessage(res: Response, fallback: string) {
  const data = await res.json().catch(() => null);
  return data?.error || fallback;
}

export default function Home() {
  const { data: session, status } = useSession();
  const calRef = useRef<CalendarHandle>(null);

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
  const [focusMemo, setFocusMemo] = useState<string | null>(null);

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
    const start = new Date();
    start.setSeconds(0, 0); // current time, 1-hour timed event (not all-day)
    setModalEvent({
      title: "",
      start: start.toISOString(),
      end: new Date(start.getTime() + 3600000).toISOString(),
      allDay: false,
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

  const handleSelectRange = useCallback(
    (range: { start: string; end: string; allDay: boolean }) => {
      let { start, end, allDay } = range;
      // A single day clicked in month view comes back as an all-day, day-long
      // range. Default that to a 1-hour timed event at the current time instead.
      const span = new Date(end).getTime() - new Date(start).getTime();
      if (allDay && span <= 24 * 3600 * 1000) {
        const now = new Date();
        const s = new Date(start);
        s.setHours(now.getHours(), now.getMinutes(), 0, 0);
        start = s.toISOString();
        end = new Date(s.getTime() + 3600 * 1000).toISOString();
        allDay = false;
      }
      setModalEvent({ title: "", start, end, allDay });
      setCanDelete(false);
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
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
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
              onClick={() => {
                setFocusMemo(null);
                setNotesOpen(true);
              }}
              aria-label="Notes"
              title="Notes"
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
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
              onOpenEvent={openEventById}
              onInvitationAccepted={(groupId) => {
                loadGroups();
                setVisibleIds((prev) =>
                  prev.includes(groupId) ? prev : [...prev, groupId]
                );
              }}
            />
            <ThemeToggle />
          </div>
        </div>

        <div className="flex-1 overflow-hidden p-3 pt-2 md:px-5 md:pb-5">
          <div className="animate-fade-in h-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:p-4">
            {mounted && (
              <CalendarView
                ref={calRef}
                groupIds={visibleIds}
                onEventClick={openExisting}
                onSelectRange={handleSelectRange}
                onReschedule={handleReschedule}
                onMemoClick={(id) => {
                  setFocusMemo(id);
                  setNotesOpen(true);
                }}
              />
            )}
          </div>
        </div>
      </main>

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

      <NotesPanel
        open={notesOpen}
        onClose={() => {
          setNotesOpen(false);
          setFocusMemo(null);
        }}
        groups={groups}
        defaultGroupId={defaultGroupId}
        focusMemoId={focusMemo}
        onChanged={() => calRef.current?.refetch()}
      />
    </div>
  );
}
