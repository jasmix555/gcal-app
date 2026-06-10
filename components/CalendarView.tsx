"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import { colorForKey } from "@/lib/colors";

export interface CalendarHandle {
  refetch: () => void;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  allDay: boolean;
  createdBy?: { name?: string | null; email?: string | null };
  updatedBy?: { name?: string | null; email?: string | null } | null;
}

interface Props {
  groupId: string | null;
  onEventClick: (e: CalendarEvent) => void;
  onSelectRange: (range: { start: string; end: string; allDay: boolean }) => void;
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
  // Keep latest groupId available to the (stable) events fetcher.
  const groupIdRef = useRef<string | null>(groupId);

  useEffect(() => {
    groupIdRef.current = groupId;
    calRef.current?.getApi().refetchEvents();
  }, [groupId]);

  useImperativeHandle(ref, () => ({
    refetch: () => calRef.current?.getApi().refetchEvents(),
  }));

  async function fetchEvents(info: any, success: any, failure: any) {
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
          const color = colorForKey(
            (e.createdBy as any)?.id || e.createdBy?.email
          );
          return {
            id: e.id,
            title: e.title,
            start: e.start,
            end: e.end,
            allDay: e.allDay,
            backgroundColor: color,
            borderColor: color,
            textColor: "#ffffff",
            extendedProps: {
              description: e.description,
              location: e.location,
              createdBy: e.createdBy,
              updatedBy: e.updatedBy,
            },
          };
        })
      );
    } catch (err) {
      failure(err);
    }
  }

  return (
    <FullCalendar
      ref={calRef}
      plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
      initialView="timeGridWeek"
      headerToolbar={{
        left: "prev,next today",
        center: "title",
        right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
      }}
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
  );
});

export default CalendarView;
