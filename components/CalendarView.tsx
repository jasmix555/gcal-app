"use client";

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import { colorForKey, readableText } from "@/lib/colors";

export interface CalendarHandle {
  refetch: () => void;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  location?: string;
  color?: string | null;
  start: string;
  end: string;
  allDay: boolean;
  createdBy?: { name?: string | null; email?: string | null };
  updatedBy?: { name?: string | null; email?: string | null } | null;
}

interface Props {
  groupId: string | null;
  onEventClick: (e: CalendarEvent) => void;
  onSelectRange: (range: {
    start: string;
    end: string;
    allDay: boolean;
  }) => void;
  onReschedule: (e: {
    id: string;
    start: string;
    end: string;
    allDay: boolean;
  }) => void;
}

const CalendarView = forwardRef<CalendarHandle, Props>(function CalendarView(
  { groupId, onEventClick, onSelectRange, onReschedule },
  ref
) {
  const calRef = useRef<FullCalendar>(null);
  const groupIdRef = useRef<string | null>(groupId);
  const [loading, setLoading] = useState(false);

  // Phone-width detection (initialised before first paint to pick the view).
  const [isMobile, setIsMobile] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 767px)").matches
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setIsMobile(mq.matches);
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Single-day view on phones, month view on larger screens.
  useEffect(() => {
    calRef.current
      ?.getApi()
      .changeView(isMobile ? "timeGridDay" : "dayGridMonth");
  }, [isMobile]);

  useEffect(() => {
    groupIdRef.current = groupId;
    calRef.current?.getApi().refetchEvents();
  }, [groupId]);

  useImperativeHandle(ref, () => ({
    refetch: () => calRef.current?.getApi().refetchEvents(),
  }));

  // Stable reference so re-renders don't make FullCalendar refetch everything.
  const fetchEvents = useCallback(
    async (info: any, success: any, failure: any) => {
      const gid = groupIdRef.current;
      if (!gid) {
        success([]);
        return;
      }
      try {
        const res = await fetch(
          `/api/events?groupId=${encodeURIComponent(gid)}&timeMin=${encodeURIComponent(
            info.startStr
          )}&timeMax=${encodeURIComponent(info.endStr)}`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load events");
        success(
          data.events.map((e: CalendarEvent) => {
            // Use the event's chosen color, else fall back to the creator color.
            const color =
              e.color ||
              colorForKey((e.createdBy as any)?.id || e.createdBy?.email);
            return {
              id: e.id,
              title: e.title,
              start: e.start,
              end: e.end,
              allDay: e.allDay,
              backgroundColor: color,
              borderColor: color,
              textColor: readableText(color),
              extendedProps: {
                description: e.description,
                location: e.location,
                color: e.color || null,
                createdBy: e.createdBy,
                updatedBy: e.updatedBy,
              },
            };
          })
        );
      } catch (err) {
        failure(err);
      }
    },
    []
  );

  return (
    <div className="relative h-full">
      {loading && (
        <div className="pointer-events-none absolute right-2 top-2 z-10 flex items-center gap-1.5 rounded-full bg-slate-900/80 px-3 py-1 text-xs text-white shadow">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          Loading…
        </div>
      )}

      <FullCalendar
        ref={calRef}
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
        loading={(isLoading) => setLoading(isLoading)}
        initialView={isMobile ? "timeGridDay" : "dayGridMonth"}
        headerToolbar={
          isMobile
            ? {
                left: "prev,next",
                center: "title",
                right: "dayGridMonth,timeGridDay,listWeek",
              }
            : {
                left: "prev,next today",
                center: "title",
                right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
              }
        }
        nowIndicator
        editable
        selectable
        selectMirror
        dayMaxEvents
        height="100%"
        events={fetchEvents}
        eventClick={(info) => {
          const ep = info.event.extendedProps as any;
          onEventClick({
            id: info.event.id,
            title: info.event.title,
            description: ep.description,
            location: ep.location,
            color: ep.color,
            start: info.event.startStr,
            end: info.event.endStr || info.event.startStr,
            allDay: info.event.allDay,
            createdBy: ep.createdBy,
            updatedBy: ep.updatedBy,
          });
        }}
        select={(info) => {
          onSelectRange({
            start: info.startStr,
            end: info.endStr,
            allDay: info.allDay,
          });
        }}
        eventDrop={(info) => {
          onReschedule({
            id: info.event.id,
            start: info.event.startStr,
            end: info.event.endStr || info.event.startStr,
            allDay: info.event.allDay,
          });
        }}
        eventResize={(info) => {
          onReschedule({
            id: info.event.id,
            start: info.event.startStr,
            end: info.event.endStr || info.event.startStr,
            allDay: info.event.allDay,
          });
        }}
      />
    </div>
  );
});

export default memo(CalendarView);
