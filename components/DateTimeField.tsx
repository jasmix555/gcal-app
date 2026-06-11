"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  value: string; // "YYYY-MM-DDTHH:mm" (timed) or "YYYY-MM-DD" (all day)
  allDay?: boolean;
  onChange: (v: string) => void;
  // When provided, the calendar paints a Trip.com-style band between the
  // start and end dates with solid endpoints (pass to both start & end fields).
  rangeStart?: string;
  rangeEnd?: string;
}

/** Parse a value to a date-only timestamp (midnight local), or null. */
function dateOnly(value?: string): number | null {
  if (!value) return null;
  const [y, m, d] = value.split("T")[0].split("-").map(Number);
  if (!y) return null;
  return new Date(y, (m || 1) - 1, d || 1).getTime();
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const pad = (n: number) => String(n).padStart(2, "0");

function parse(value: string, allDay?: boolean): Date {
  const now = new Date();
  if (!value) return now;
  const [datePart, timePart = ""] = value.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const date = new Date(y || now.getFullYear(), (m || 1) - 1, d || 1);
  if (!allDay && timePart) {
    const [hh, mm] = timePart.split(":").map(Number);
    date.setHours(hh || 0, mm || 0, 0, 0);
  }
  return date;
}

function toValue(date: Date, allDay?: boolean): string {
  const base = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return allDay
    ? base
    : `${base}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const trigger =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-900 outline-none transition hover:border-slate-300 focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-600";

export default function DateTimeField({
  value,
  allDay,
  onChange,
  rangeStart,
  rangeEnd,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const timeListRef = useRef<HTMLDivElement>(null);
  // Drag-to-scroll state for the time list (touch + mouse), so it slides like
  // a phone even when the modal's scroll-lock blocks native wheel/touch.
  const drag = useRef({ active: false, moved: false, startY: 0, startTop: 0 });
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false); // month/year selector
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const selected = parse(value, allDay);
  const [view, setView] = useState(
    () => new Date(selected.getFullYear(), selected.getMonth(), 1)
  );

  const popWidth = allDay ? 252 : 344;

  function updateCoords() {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.max(
      8,
      Math.min(r.left, window.innerWidth - popWidth - 8)
    );
    setCoords({ top: r.bottom + 4, left });
  }

  useEffect(() => {
    if (!open) return;
    updateCoords();
    setView(new Date(selected.getFullYear(), selected.getMonth(), 1));
    const reposition = () => updateCoords();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      document.removeEventListener("mousedown", onDoc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) setPicking(false);
  }, [open]);

  const times = useMemo(() => {
    const list: { h: number; m: number }[] = [];
    for (let h = 0; h < 24; h++)
      for (const m of [0, 15, 30, 45]) list.push({ h, m });
    return list;
  }, []);

  // The popover is portaled outside the modal, so Radix's scroll-lock blocks
  // wheel events on it. Scroll the time list manually so it works regardless.
  // Also scroll the selected time into view ONCE on open (not every render —
  // doing it per render would keep snapping the list back to the selection).
  useEffect(() => {
    if (!open || allDay) return;
    const el = timeListRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      el.scrollTop += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });

    const raf = requestAnimationFrame(() => {
      const activeEl = el.querySelector<HTMLElement>('[data-active="true"]');
      if (activeEl) {
        el.scrollTop =
          activeEl.offsetTop - el.clientHeight / 2 + activeEl.clientHeight / 2;
      }
    });

    return () => {
      el.removeEventListener("wheel", onWheel);
      cancelAnimationFrame(raf);
    };
  }, [open, allDay]);

  const year = view.getFullYear();
  const month = view.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  // Range band (start → end). Only when both ends exist and span > 0.
  const rStart = dateOnly(rangeStart);
  const rEnd = dateOnly(rangeEnd);
  const hasRange = rStart !== null && rEnd !== null && rEnd > rStart;

  function pickDay(day: number) {
    const next = new Date(selected);
    next.setFullYear(year, month, day);
    onChange(toValue(next, allDay));
    if (allDay) setOpen(false);
  }
  function pickTime(h: number, m: number) {
    const next = new Date(selected);
    next.setHours(h, m, 0, 0);
    onChange(toValue(next, false));
  }

  const today = new Date();
  const dateLabel = selected.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const display = allDay
    ? dateLabel
    : `${dateLabel} · ${pad(selected.getHours())}:${pad(selected.getMinutes())}`;

  return (
    <div ref={wrapRef}>
      <button
        type="button"
        className={trigger}
        onClick={() => setOpen((o) => !o)}
      >
        {display}
      </button>

      {open &&
        createPortal(
          <div
            ref={popRef}
            data-dt-popover
            style={{ position: "fixed", top: coords.top, left: coords.left }}
            className="animate-rise-in pointer-events-auto z-[60] flex gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-800"
          >
            {/* Calendar */}
            <div className="w-56">
              <div className="mb-2 flex items-center justify-between">
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                  onClick={() =>
                    setView(
                      new Date(
                        year - (picking ? 1 : 0),
                        month - (picking ? 0 : 1),
                        1
                      )
                    )
                  }
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => setPicking((p) => !p)}
                  className="rounded-md px-2 py-1 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  {picking ? year : `${MONTHS[month]} ${year}`}
                </button>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                  onClick={() =>
                    setView(
                      new Date(
                        year + (picking ? 1 : 0),
                        month + (picking ? 0 : 1),
                        1
                      )
                    )
                  }
                >
                  ›
                </button>
              </div>

              {picking ? (
                <div className="grid grid-cols-3 gap-1">
                  {MONTHS.map((mn, idx) => (
                    <button
                      key={mn}
                      type="button"
                      onClick={() => {
                        setView(new Date(year, idx, 1));
                        setPicking(false);
                      }}
                      className={`rounded-md px-2 py-2 text-sm transition ${
                        idx === month
                          ? "bg-blue-600 text-white"
                          : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                      }`}
                    >
                      {mn.slice(0, 3)}
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-7 text-center text-[11px] text-slate-400">
                    {WEEKDAYS.map((d) => (
                      <div key={d} className="py-1">
                        {d}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-y-0.5">
                    {cells.map((day, i) => {
                      if (day === null) return <div key={i} />;
                      const t = new Date(year, month, day).getTime();
                      const isSelected =
                        selected.getFullYear() === year &&
                        selected.getMonth() === month &&
                        selected.getDate() === day;
                      const isToday =
                        today.getFullYear() === year &&
                        today.getMonth() === month &&
                        today.getDate() === day;

                      // Range band membership.
                      const isStart = hasRange && t === rStart;
                      const isEnd = hasRange && t === rEnd;
                      const between = hasRange && t > rStart! && t < rEnd!;
                      const inBand = isStart || isEnd || between;
                      const endpoint = hasRange ? isStart || isEnd : isSelected;

                      // Connecting band background (square-tiled; rounded at ends).
                      let band = "";
                      if (inBand) {
                        band =
                          "bg-blue-100 dark:bg-blue-900/40" +
                          (isStart ? " rounded-l-full" : "") +
                          (isEnd ? " rounded-r-full" : "");
                      }

                      return (
                        <div
                          key={i}
                          className={`flex h-9 items-center justify-center ${band}`}
                        >
                          <button
                            type="button"
                            onClick={() => pickDay(day)}
                            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm transition ${
                              endpoint
                                ? "bg-blue-600 font-semibold text-white"
                                : between
                                  ? "text-blue-700 dark:text-blue-200"
                                  : isToday
                                    ? "font-semibold text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                                    : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                            }`}
                          >
                            {day}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Time scroll list */}
            {!allDay && (
              <div
                ref={timeListRef}
                style={{ touchAction: "none" }}
                onPointerDown={(e) => {
                  const el = timeListRef.current;
                  if (!el) return;
                  drag.current = {
                    active: true,
                    moved: false,
                    startY: e.clientY,
                    startTop: el.scrollTop,
                  };
                }}
                onPointerMove={(e) => {
                  const el = timeListRef.current;
                  if (!el || !drag.current.active) return;
                  const dy = e.clientY - drag.current.startY;
                  if (Math.abs(dy) > 3) drag.current.moved = true;
                  el.scrollTop = drag.current.startTop - dy;
                }}
                onPointerUp={() => {
                  drag.current.active = false;
                }}
                onPointerLeave={() => {
                  drag.current.active = false;
                }}
                className="relative max-h-[244px] w-20 cursor-grab touch-none overflow-y-auto border-l border-slate-200 pl-2 active:cursor-grabbing dark:border-slate-700"
              >
                {times.map(({ h, m }) => {
                  const active =
                    selected.getHours() === h && selected.getMinutes() === m;
                  return (
                    <button
                      key={`${h}:${m}`}
                      type="button"
                      data-active={active ? "true" : undefined}
                      onClick={() => {
                        if (drag.current.moved) {
                          drag.current.moved = false;
                          return;
                        }
                        pickTime(h, m);
                      }}
                      className={`block w-full rounded-md px-2 py-1 text-center text-sm transition ${
                        active
                          ? "bg-blue-600 text-white"
                          : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                      }`}
                    >
                      {pad(h)}:{pad(m)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
