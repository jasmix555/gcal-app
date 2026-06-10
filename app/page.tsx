"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import CalendarView, {
  CalendarHandle,
  CalendarEvent,
} from "@/components/CalendarView";
import Sidebar from "@/components/Sidebar";
import EventModal, { EditableEvent } from "@/components/EventModal";

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

  useEffect(() => setMounted(true), []);

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

  function openExisting(ev: CalendarEvent) {
    setModalEvent(ev);
    const privileged = currentRole === "OWNER" || currentRole === "ADMIN";
    const isCreator = (ev.createdBy as any)?.id === myId;
    setCanDelete(privileged || isCreator);
  }

  async function handleSave(e: EditableEvent) {
    if (!currentGroupId) return;
    setSaving(true);
    try {
      if (e.id) {
        const res = await fetch(`/api/events/${e.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(e),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Update failed");
      } else {
        const res = await fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...e, groupId: currentGroupId }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Create failed");
      }
      setModalEvent(null);
      refetch();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this event?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/events/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Delete failed");
      setModalEvent(null);
      refetch();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleReschedule(e: {
    id: string;
    start: string;
    end: string;
    allDay: boolean;
  }) {
    try {
      const res = await fetch(`/api/events/${e.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: e.start, end: e.end, allDay: e.allDay }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Update failed");
      refetch();
    } catch (err: any) {
      alert(err.message);
      refetch();
    }
  }

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

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar
        user={session?.user}
        groups={groups}
        currentGroupId={currentGroupId}
        onSelectGroup={(id) => setCurrentGroupId(id)}
        onGroupsChanged={loadGroups}
        onNewEvent={openNewEvent}
      />

      <main className="flex-1 overflow-hidden p-3 md:p-5">
        <div className="animate-fade-in h-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:p-4">
          {mounted && (
            <CalendarView
              ref={calRef}
              groupId={currentGroupId}
              onEventClick={openExisting}
              onSelectRange={(range) => {
                setModalEvent({
                  title: "",
                  start: range.start,
                  end: range.end,
                  allDay: range.allDay,
                });
                setCanDelete(false);
              }}
              onReschedule={handleReschedule}
            />
          )}
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
