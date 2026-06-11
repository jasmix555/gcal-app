"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface Notification {
  id: string;
  type: string;
  message: string;
  read: boolean;
  createdAt: string;
  eventId: string | null;
}

interface PendingInvite {
  id: string;
  token: string;
  role: string;
  group: { id: string; name: string };
}

interface Props {
  onOpenEvent: (eventId: string) => void;
  onInvitationAccepted: (groupId: string) => void;
  /** Bumped by the app's change poll to trigger a refetch in near-real-time. */
  refreshSignal?: number;
}

function tabCls(active: boolean) {
  return `flex flex-1 items-center justify-center rounded-md py-1.5 text-sm font-medium transition ${
    active
      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
      : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
  }`;
}

function ago(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function NotificationBell({
  onOpenEvent,
  onInvitationAccepted,
  refreshSignal,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<"notifs" | "invites">("notifs");

  const load = useCallback(() => {
    Promise.all([
      fetch("/api/notifications")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d) return;
          setItems(d.notifications || []);
          setUnread(d.unread || 0);
        })
        .catch(() => {}),
      fetch("/api/invitations")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setInvites(d.invitations || []))
        .catch(() => {}),
    ]).finally(() => setLoaded(true));
  }, []);

  // Initial load + a slow safety refresh; the app's change poll drives the
  // near-real-time updates via refreshSignal.
  useEffect(() => {
    load();
    const t = setInterval(load, 120000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (refreshSignal) load();
  }, [refreshSignal, load]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const badge = unread + invites.length;

  // Just open/close — notifications stay unread until the user acts on them.
  function toggle() {
    setOpen((o) => !o);
  }

  // Mark a single notification read (when its action is taken).
  function markRead(id: string) {
    setItems((arr) =>
      arr.map((n) => (n.id === id && !n.read ? { ...n, read: true } : n))
    );
    setUnread((u) => Math.max(0, u - 1));
    fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }

  function markAll() {
    setItems((arr) => arr.map((n) => ({ ...n, read: true })));
    setUnread(0);
    fetch("/api/notifications/read", { method: "POST" }).catch(() => {});
  }

  async function accept(invite: PendingInvite) {
    try {
      const res = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: invite.token }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not accept invitation");
      toast.success(`Joined ${invite.group.name}`);
      setInvites((arr) => arr.filter((i) => i.id !== invite.id));
      onInvitationAccepted(d.groupId || invite.group.id);
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function decline(invite: PendingInvite) {
    try {
      const res = await fetch("/api/invitations/decline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: invite.token }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not decline invitation");
      toast.success(`Declined ${invite.group.name}`);
      setInvites((arr) => arr.filter((i) => i.id !== invite.id));
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        aria-label="Notifications"
        title="Notifications"
        className="relative rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
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
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {badge > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </button>

      {open && (
        <div className="animate-rise-in absolute right-0 z-50 mt-2 flex max-h-[70vh] w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-slate-100 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-800">
            <button
              className={tabCls(tab === "notifs")}
              onClick={() => setTab("notifs")}
            >
              Notifications
              {unread > 0 && (
                <span className="ml-1.5 rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white">
                  {unread}
                </span>
              )}
            </button>
            <button
              className={tabCls(tab === "invites")}
              onClick={() => setTab("invites")}
            >
              Invites
              {invites.length > 0 && (
                <span className="ml-1.5 rounded-full bg-blue-500 px-1.5 text-[10px] font-semibold text-white">
                  {invites.length}
                </span>
              )}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {tab === "notifs" ? (
              <>
                {unread > 0 && (
                  <div className="flex justify-end px-4 pt-2">
                    <button
                      onClick={markAll}
                      className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                    >
                      Mark all read
                    </button>
                  </div>
                )}
                {!loaded && items.length === 0 ? (
                  <div className="flex flex-col gap-3 px-4 py-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <Skeleton className="mt-1 h-2 w-2 rounded-full" />
                        <div className="flex flex-1 flex-col gap-1.5">
                          <Skeleton className="h-3.5 w-full" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : items.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-slate-400">
                    You&apos;re all caught up.
                  </div>
                ) : (
                  items.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => {
                        if (!n.read) markRead(n.id);
                        if (n.eventId) {
                          onOpenEvent(n.eventId);
                          setOpen(false);
                        }
                      }}
                      className={`flex w-full items-start gap-2 border-b border-slate-100 px-4 py-2.5 text-left text-sm transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800 ${
                        !n.read ? "bg-blue-50/40 dark:bg-blue-950/20" : ""
                      }`}
                    >
                      {!n.read ? (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500" />
                      ) : (
                        <span className="mt-1.5 h-2 w-2 shrink-0" />
                      )}
                      <span
                        className={
                          n.read
                            ? "text-slate-400 dark:text-slate-500"
                            : "font-medium text-slate-900 dark:text-slate-100"
                        }
                      >
                        {n.message}
                        <span className="ml-1 text-xs font-normal text-slate-400">
                          · {ago(n.createdAt)}
                        </span>
                      </span>
                    </button>
                  ))
                )}
              </>
            ) : invites.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-400">
                No pending invites.
              </div>
            ) : (
              invites.map((i) => (
                <div
                  key={i.id}
                  className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 text-sm dark:border-slate-800"
                >
                  <div>
                    You&apos;ve been invited to <strong>{i.group.name}</strong>{" "}
                    · {i.role}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => accept(i)}>
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => decline(i)}
                    >
                      Decline
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
