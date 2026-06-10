"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import CalendarView, {
  CalendarHandle,
  CalendarEvent,
} from "@/components/CalendarView";
import Sidebar from "@/components/Sidebar";
import EventModal, { EditableEvent } from "@/components/EventModal";
import { toast } from "sonner";

interface GroupSummary {
  id: string;
  name: string;
  role: string;
  memberCount: number;
}

export default function Home() {
  const { data: session, status } = useSession();
  const calRef = useRef<CalendarHandle>(null);

  const [mounted, setMounted] = useState(false);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [currentGroupId, setCurrentGroupId] = useState<string | null>(null);
  const [modalEvent, setModalEvent] = useState<EditableEvent | null>(null);
  const [canDelete, setCanDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

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
    const res = await fetch("/api/groups");
    if (!res.ok) return;
    const d = await res.json();
    const gs: GroupSummary[] = d.groups || [];
    setGroups(gs);
    setCurrentGroupId((prev) => prev || (gs[0]?.id ?? null));
  }, []);

  useEffect(() => {
    if (status === "authenticated") loadGroups();
  }, [status, loadGroups]);

  const currentRole =
    groups.find((g) => g.id === currentGroupId)?.role || "MEMBER";
  const myId = (session?.user as any)?.id as string | undefined;

  function refetch() {
    calRef.current?.refetch();
  }

  function openNewEvent() {
    if (!currentGroupId) {
      toast("Create or pick a group first (left sidebar) to add events.");
      return;
    }
    const start = new Date();
    start.setMinutes(0, 0, 0);
    setModalEvent({
      title: "",
      start: start.toISOString(),
      end: new Date(start.getTime() + 3600000).toISOString(),
      allDay: false,
    });
    setCanDelete(false);
  }

  const openExisting = useCallback(
    (ev: CalendarEvent) => {
      setModalEvent(ev);
      const privileged = currentRole === "OWNER" || currentRole === "ADMIN";
      const isCreator = (ev.createdBy as any)?.id === myId;
      setCanDelete(privileged || isCreator);
    },
    [currentRole, myId]
  );

  const handleSelectRange = useCallback(
    (range: { start: string; end: string; allDay: boolean }) => {
      if (!currentGroupId) {
        toast("Create or pick a group first (left sidebar) to add events.");
        return;
      }
      setModalEvent({
        title: "",
        start: range.start,
        end: range.end,
        allDay: range.allDay,
      });
      setCanDelete(false);
    },
    [currentGroupId]
  );

  async function handleSave(e: EditableEvent) {
    if (!currentGroupId) {
      toast("Create or pick a group first (left sidebar) to add events.");
      return;
    }
    setSaving(true);
    try {
      if (e.id) {
        const res = await fetch(`/api/events/${e.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(e),
        });
        if (!res.ok)
          throw new Error((await res.json()).error || "Update failed");
      } else {
        const res = await fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...e, groupId: currentGroupId }),
        });
        if (!res.ok)
          throw new Error((await res.json()).error || "Create failed");
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
      if (!res.ok) throw new Error((await res.json()).error || "Delete failed");
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
        if (!res.ok)
          throw new Error((await res.json()).error || "Update failed");
        calRef.current?.refetch();
      } catch (err: any) {
        toast.error(err.message);
        calRef.current?.refetch();
      }
    },
    []
  );

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Loading…
      </div>
    );
  }
  if (status === "unauthenticated") {
    if (typeof window !== "undefined") window.location.href = "/login";
    return null;
  }

  const sidebarEl = (
    <Sidebar
      user={session?.user}
      groups={groups}
      currentGroupId={currentGroupId}
      onSelectGroup={(id) => {
        setCurrentGroupId(id);
        if (isMobile) setSidebarOpen(false);
      }}
      onGroupsChanged={loadGroups}
      onNewEvent={() => {
        openNewEvent();
        if (isMobile) setSidebarOpen(false);
      }}
    />
  );

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
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
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-100"
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
        </div>

        <div className="flex-1 overflow-hidden p-3 pt-2 md:px-5 md:pb-5">
          <div className="animate-fade-in h-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:p-4">
            {mounted && (
              <CalendarView
                ref={calRef}
                groupId={currentGroupId}
                onEventClick={openExisting}
                onSelectRange={handleSelectRange}
                onReschedule={handleReschedule}
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
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setModalEvent(null)}
        />
      )}
    </div>
  );
}
