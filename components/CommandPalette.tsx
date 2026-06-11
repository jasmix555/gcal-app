"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface Command {
  id: string;
  label: string;
  hint?: string;
  icon?: string;
  keywords?: string;
  run: () => void;
}

interface SearchEvent {
  id: string;
  title: string;
  start: string;
  allDay: boolean;
}
interface SearchMemo {
  id: string;
  title: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  commands: Command[];
  onOpenEvent: (id: string) => void;
  onOpenMemo: (id: string) => void;
}

type Row =
  | { kind: "cmd"; cmd: Command }
  | { kind: "event"; ev: SearchEvent }
  | { kind: "memo"; memo: SearchMemo };

export default function CommandPalette({
  open,
  onClose,
  commands,
  onOpenEvent,
  onOpenMemo,
}: Props) {
  const [query, setQuery] = useState("");
  const [events, setEvents] = useState<SearchEvent[]>([]);
  const [memos, setMemos] = useState<SearchMemo[]>([]);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setEvents([]);
      setMemos([]);
      setActive(0);
    }
  }, [open]);

  // Live search of events/notes (debounced).
  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setEvents([]);
      setMemos([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query.trim())}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d) return;
          setEvents(d.events || []);
          setMemos(d.memos || []);
        })
        .catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [query, open]);

  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) =>
      `${c.label} ${c.hint || ""} ${c.keywords || ""}`.toLowerCase().includes(q)
    );
  }, [commands, query]);

  const rows: Row[] = useMemo(
    () => [
      ...filteredCommands.map((cmd) => ({ kind: "cmd" as const, cmd })),
      ...events.map((ev) => ({ kind: "event" as const, ev })),
      ...memos.map((memo) => ({ kind: "memo" as const, memo })),
    ],
    [filteredCommands, events, memos]
  );

  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  function runRow(row: Row) {
    if (row.kind === "cmd") row.cmd.run();
    else if (row.kind === "event") onOpenEvent(row.ev.id);
    else onOpenMemo(row.memo.id);
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (rows[active]) runRow(rows[active]);
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  // Keep the active row in view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-idx="${active}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const fmtEvent = (ev: SearchEvent) =>
    new Date(ev.start).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      ...(ev.allDay ? {} : { hour: "numeric", minute: "2-digit" }),
    });

  let idx = -1;
  const rowClass = (i: number) =>
    `flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm ${
      i === active
        ? "bg-blue-50 text-blue-900 dark:bg-blue-950/50 dark:text-blue-100"
        : "text-slate-700 dark:text-slate-200"
    }`;

  return createPortal(
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="animate-fade-in fixed inset-0 z-[70] flex justify-center bg-black/30 px-4 pt-16 backdrop-blur-sm"
    >
      <div className="animate-rise-in h-fit w-[36rem] max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a command or search…"
          className="w-full border-b border-slate-100 bg-transparent px-4 py-3 text-sm outline-none dark:border-slate-800"
        />
        <div ref={listRef} className="max-h-[55vh] overflow-y-auto py-1">
          {rows.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-400">
              No matches.
            </div>
          ) : (
            <>
              {filteredCommands.length > 0 && (
                <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Actions
                </div>
              )}
              {filteredCommands.map((cmd) => {
                idx++;
                const i = idx;
                return (
                  <button
                    key={cmd.id}
                    data-idx={i}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => runRow({ kind: "cmd", cmd })}
                    className={rowClass(i)}
                  >
                    <span className="w-5 text-center">{cmd.icon || "›"}</span>
                    <span className="flex-1">{cmd.label}</span>
                    {cmd.hint && (
                      <span className="text-xs text-slate-400">{cmd.hint}</span>
                    )}
                  </button>
                );
              })}

              {events.length > 0 && (
                <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Events
                </div>
              )}
              {events.map((ev) => {
                idx++;
                const i = idx;
                return (
                  <button
                    key={ev.id}
                    data-idx={i}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => runRow({ kind: "event", ev })}
                    className={rowClass(i)}
                  >
                    <span className="w-5 text-center">📅</span>
                    <span className="flex-1 truncate">{ev.title}</span>
                    <span className="text-xs text-slate-400">
                      {fmtEvent(ev)}
                    </span>
                  </button>
                );
              })}

              {memos.length > 0 && (
                <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Notes
                </div>
              )}
              {memos.map((memo) => {
                idx++;
                const i = idx;
                return (
                  <button
                    key={memo.id}
                    data-idx={i}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => runRow({ kind: "memo", memo })}
                    className={rowClass(i)}
                  >
                    <span className="w-5 text-center">📝</span>
                    <span className="flex-1 truncate">{memo.title}</span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
