"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { colorForKey } from "@/lib/colors";
import InviteModal from "@/components/InviteModal";
import ProfileMenu from "@/components/ProfileMenu";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface GroupSummary {
  id: string;
  name: string;
  color?: string | null;
  role: string;
  memberCount: number;
  isPersonal?: boolean;
}

// Calendar color choices (vivid, readable on white/dark event blocks).
const CALENDAR_COLORS = [
  "#2563eb",
  "#059669",
  "#7c3aed",
  "#d97706",
  "#e11d48",
  "#0891b2",
  "#4f46e5",
  "#0d9488",
  "#ea580c",
  "#db2777",
  "#475569",
  "#16a34a",
];

interface Props {
  user?: { name?: string | null; email?: string | null; image?: string | null };
  groups: GroupSummary[];
  groupsLoading?: boolean;
  visibleIds: string[];
  onToggleVisible: (id: string) => void;
  onGroupsChanged: () => void;
  onNewEvent: () => void;
}

const btnPrimary =
  "rounded-lg border border-accent bg-accent px-3 py-2 text-sm text-white transition hover:bg-accent-dark disabled:opacity-50";
const input =
  "w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500";
const label = "mb-1 text-xs font-medium uppercase tracking-wide text-slate-400";
const menuItem =
  "block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700";

export default function Sidebar({
  user,
  groups,
  groupsLoading,
  visibleIds,
  onToggleVisible,
  onGroupsChanged,
  onNewEvent,
}: Props) {
  const { data: session } = useSession();
  const myId = (session?.user as any)?.id as string | undefined;

  const [newGroup, setNewGroup] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [addMenu, setAddMenu] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [manage, setManage] = useState<{
    id: string;
    name: string;
    role: string;
    tab: "members" | "share";
  } | null>(null);
  const [rename, setRename] = useState<{ id: string; name: string } | null>(
    null
  );
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [confirmLeave, setConfirmLeave] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [colorFor, setColorFor] = useState<{
    id: string;
    name: string;
    color?: string | null;
  } | null>(null);
  const [customColor, setCustomColor] = useState("#2563eb");
  useEffect(() => {
    if (colorFor) setCustomColor(colorFor.color || "#2563eb");
  }, [colorFor]);

  // Local drag-reorder order (ids); synced from props, reordered live on drag.
  const [order, setOrder] = useState<string[]>([]);
  const dragId = useRef<string | null>(null);
  useEffect(() => {
    setOrder(groups.map((g) => g.id));
  }, [groups]);

  function onDragEnterRow(id: string) {
    const from = dragId.current;
    if (!from || from === id) return;
    setOrder((prev) => {
      const a = prev.indexOf(from);
      const b = prev.indexOf(id);
      if (a < 0 || b < 0) return prev;
      const next = [...prev];
      next.splice(b, 0, next.splice(a, 1)[0]);
      return next;
    });
  }

  async function persistOrder() {
    const ids = order;
    dragId.current = null;
    try {
      await fetch("/api/groups/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: ids }),
      });
      onGroupsChanged();
    } catch {
      /* ignore */
    }
  }

  async function setCalendarColor(id: string, color: string | null) {
    setColorFor(null);
    try {
      const res = await fetch(`/api/groups/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color }),
      });
      if (!res.ok) throw new Error("Could not update color");
      onGroupsChanged();
    } catch (err: any) {
      toast.error(err.message || "Could not update color");
    }
  }

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    const name = newGroup.trim();
    if (!name) return;
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not create group");
      setNewGroup("");
      setShowCreate(false);
      toast.success(`Calendar “${name}” created`);
      onGroupsChanged();
      if (d.group?.id) onToggleVisible(d.group.id);
    } catch (err: any) {
      toast.error(err.message || "Could not create group");
    }
  }

  async function joinByCode(e: React.FormEvent) {
    e.preventDefault();
    const code = joinCode.trim();
    if (!code) return;
    setJoining(true);
    try {
      const res = await fetch("/api/groups/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not join with that code");
      setJoinCode("");
      setShowJoin(false);
      toast.success(`Joined “${d.groupName}”`);
      onGroupsChanged();
      if (d.groupId) onToggleVisible(d.groupId);
    } catch (err: any) {
      toast.error(err.message || "Could not join");
    } finally {
      setJoining(false);
    }
  }

  async function doRename() {
    if (!rename) return;
    const name = renameValue.trim();
    if (!name) return;
    try {
      const res = await fetch(`/api/groups/${rename.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not rename");
      toast.success("Calendar renamed");
      setRename(null);
      onGroupsChanged();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function doDelete() {
    if (!confirmDelete) return;
    try {
      const res = await fetch(`/api/groups/${confirmDelete.id}`, {
        method: "DELETE",
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not delete");
      toast.success("Calendar deleted");
      setConfirmDelete(null);
      onGroupsChanged();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function doLeave() {
    if (!confirmLeave || !myId) return;
    try {
      const res = await fetch(
        `/api/groups/${confirmLeave.id}/members/${myId}`,
        {
          method: "DELETE",
        }
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not leave");
      toast.success("Left the calendar");
      setConfirmLeave(null);
      onGroupsChanged();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  // Disambiguate duplicate (non-personal) names with a member count.
  const nameCounts = groups.reduce<Record<string, number>>((acc, g) => {
    if (!g.isPersonal) acc[g.name] = (acc[g.name] || 0) + 1;
    return acc;
  }, {});

  // Render in the user's drag order (falls back to server order before sync).
  const orderedGroups: GroupSummary[] = order.length
    ? (order
        .map((id) => groups.find((g) => g.id === id))
        .filter(Boolean) as GroupSummary[])
    : groups;

  return (
    <aside className="animate-fade-in flex h-full w-[300px] max-w-[85vw] shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
      <h1 className="text-lg font-semibold">📅 Team Calendar</h1>

      {user && <ProfileMenu user={user} onResetDone={onGroupsChanged} />}

      <button
        className={`${btnPrimary} w-full shadow-sm hover:-translate-y-px hover:shadow-md active:translate-y-0`}
        onClick={onNewEvent}
        disabled={groups.length === 0}
      >
        + New event
      </button>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <p className={`${label} mb-0`}>My calendars</p>
          <div className="relative">
            <button
              onClick={() => setAddMenu((o) => !o)}
              aria-label="Add calendar"
              title="Add calendar"
              className="flex h-6 w-6 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
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
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            {addMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setAddMenu(false)}
                />
                <div className="absolute right-0 z-50 mt-1 w-48 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                  <button
                    className={menuItem}
                    onClick={() => {
                      setAddMenu(false);
                      setNewGroup("");
                      setShowCreate(true);
                    }}
                  >
                    ➕ Create calendar
                  </button>
                  <button
                    className={menuItem}
                    onClick={() => {
                      setAddMenu(false);
                      setJoinCode("");
                      setShowJoin(true);
                    }}
                  >
                    🔗 Join with code
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-0.5">
          {groupsLoading &&
            groups.length === 0 &&
            Array.from({ length: 4 }).map((_, i) => (
              <div
                key={`gs${i}`}
                className="flex items-center gap-2 px-1.5 py-1.5"
              >
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-3.5 w-32" />
              </div>
            ))}
          {orderedGroups.map((g) => {
            const visible = visibleIds.includes(g.id);
            const color = g.color || colorForKey(g.id);
            const canManage =
              !g.isPersonal && (g.role === "OWNER" || g.role === "ADMIN");
            const canDelete = !g.isPersonal && g.role === "OWNER";
            const canLeave = !g.isPersonal && g.role !== "OWNER";
            const canColor = g.role === "OWNER" || g.role === "ADMIN";
            const hasMenu = true;
            return (
              <div
                key={g.id}
                draggable
                onDragStart={() => (dragId.current = g.id)}
                onDragEnter={() => onDragEnterRow(g.id)}
                onDragOver={(e) => e.preventDefault()}
                onDragEnd={persistOrder}
                className="group relative flex items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-sm transition hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <span
                  className="shrink-0 cursor-grab text-slate-300 opacity-0 transition group-hover:opacity-100 active:cursor-grabbing dark:text-slate-600"
                  title="Drag to reorder"
                  aria-hidden
                >
                  ⠿
                </span>
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={() => onToggleVisible(g.id)}
                  style={{ accentColor: color }}
                  className="h-4 w-4 shrink-0 cursor-pointer"
                  aria-label={`Toggle ${g.name}`}
                />
                <span className="truncate">
                  {g.isPersonal ? "🔒 Personal" : g.name}
                  {!g.isPersonal && nameCounts[g.name] > 1
                    ? ` (${g.memberCount})`
                    : ""}
                </span>

                {hasMenu && (
                  <button
                    onClick={() => setMenuId(menuId === g.id ? null : g.id)}
                    aria-label="Calendar options"
                    className="ml-auto rounded px-1.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                  >
                    ⋯
                  </button>
                )}

                {menuId === g.id && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setMenuId(null)}
                    />
                    <div className="absolute right-1 top-9 z-50 w-48 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                      {!g.isPersonal && (
                        <button
                          className={menuItem}
                          onClick={() => {
                            setManage({
                              id: g.id,
                              name: g.name,
                              role: g.role,
                              tab: "members",
                            });
                            setMenuId(null);
                          }}
                        >
                          Members
                        </button>
                      )}
                      {canColor && (
                        <button
                          className={menuItem}
                          onClick={() => {
                            setColorFor({
                              id: g.id,
                              name: g.name,
                              color: g.color,
                            });
                            setMenuId(null);
                          }}
                        >
                          Change color
                        </button>
                      )}
                      {canManage && (
                        <button
                          className={menuItem}
                          onClick={() => {
                            setManage({
                              id: g.id,
                              name: g.name,
                              role: g.role,
                              tab: "share",
                            });
                            setMenuId(null);
                          }}
                        >
                          Share
                        </button>
                      )}
                      {canManage && (
                        <button
                          className={menuItem}
                          onClick={() => {
                            setRename({ id: g.id, name: g.name });
                            setRenameValue(g.name);
                            setMenuId(null);
                          }}
                        >
                          Rename
                        </button>
                      )}
                      {canLeave && (
                        <button
                          className={menuItem}
                          onClick={() => {
                            setConfirmLeave({ id: g.id, name: g.name });
                            setMenuId(null);
                          }}
                        >
                          Leave calendar
                        </button>
                      )}
                      {canDelete && (
                        <button
                          className={`${menuItem} text-red-600 dark:text-red-400`}
                          onClick={() => {
                            setConfirmDelete({ id: g.id, name: g.name });
                            setMenuId(null);
                          }}
                        >
                          Delete calendar
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {manage && (
        <InviteModal
          groupId={manage.id}
          groupName={manage.name}
          initialTab={manage.tab}
          initialRole={manage.role}
          onClose={() => setManage(null)}
          onChanged={onGroupsChanged}
        />
      )}

      {/* Create calendar dialog */}
      <Dialog
        open={showCreate}
        onOpenChange={(o) => !o && setShowCreate(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New calendar</DialogTitle>
            <DialogDescription className="sr-only">
              Create a new calendar
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={createGroup} className="flex flex-col gap-3">
            <input
              autoFocus
              className={input}
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
              placeholder="Calendar name"
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!newGroup.trim()}>
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Join with code dialog */}
      <Dialog open={showJoin} onOpenChange={(o) => !o && setShowJoin(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Join a calendar</DialogTitle>
            <DialogDescription className="sr-only">
              Join a calendar with an invite code
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={joinByCode} className="flex flex-col gap-3">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Enter the invite code someone shared with you.
            </p>
            <input
              autoFocus
              className={`${input} text-center font-mono tracking-wider`}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Invite code"
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowJoin(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!joinCode.trim() || joining}>
                {joining ? "Joining…" : "Join"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={!!rename} onOpenChange={(o) => !o && setRename(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename calendar</DialogTitle>
            <DialogDescription className="sr-only">
              Rename this calendar
            </DialogDescription>
          </DialogHeader>
          <input
            autoFocus
            className={input}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doRename()}
            placeholder="Calendar name"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRename(null)}>
              Cancel
            </Button>
            <Button onClick={doRename} disabled={!renameValue.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Calendar color dialog */}
      <Dialog open={!!colorFor} onOpenChange={(o) => !o && setColorFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {colorFor ? `Color for “${colorFor.name}”` : "Calendar color"}
            </DialogTitle>
            <DialogDescription>
              Sets the color of every event on this calendar.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-6 gap-3 py-1">
            {CALENDAR_COLORS.map((c) => {
              const sel = (colorFor?.color || "").toLowerCase() === c;
              return (
                <button
                  key={c}
                  onClick={() => colorFor && setCalendarColor(colorFor.id, c)}
                  aria-label={c}
                  className={`flex h-9 w-9 items-center justify-center rounded-full transition hover:scale-110 ${
                    sel
                      ? "ring-2 ring-offset-2 ring-slate-400 dark:ring-offset-slate-900"
                      : ""
                  }`}
                  style={{ backgroundColor: c }}
                >
                  {sel && (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>

          {/* Custom color wheel */}
          <div className="mt-2 flex items-center gap-3 border-t border-slate-200 pt-3 dark:border-slate-800">
            <input
              type="color"
              value={customColor}
              onChange={(e) => setCustomColor(e.target.value)}
              aria-label="Custom color"
              className="h-9 w-12 cursor-pointer rounded border border-slate-200 bg-transparent p-0.5 dark:border-slate-700"
            />
            <span className="font-mono text-sm text-slate-500 dark:text-slate-400">
              {customColor.toUpperCase()}
            </span>
            <Button
              className="ml-auto"
              onClick={() =>
                colorFor && setCalendarColor(colorFor.id, customColor)
              }
            >
              Use color
            </Button>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => colorFor && setCalendarColor(colorFor.id, null)}
            >
              Reset to default
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title={`Delete “${confirmDelete?.name ?? ""}”?`}
        description="This permanently removes the calendar and all of its events for everyone. This can't be undone."
        confirmLabel="Delete calendar"
        onConfirm={doDelete}
      />

      <ConfirmDialog
        open={!!confirmLeave}
        onOpenChange={(o) => !o && setConfirmLeave(null)}
        title={`Leave “${confirmLeave?.name ?? ""}”?`}
        description="You'll lose access to this calendar. You can be invited back later."
        confirmLabel="Leave calendar"
        onConfirm={doLeave}
      />
    </aside>
  );
}
