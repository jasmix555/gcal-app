"use client";

import { useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { toast } from "sonner";
import { colorForKey } from "@/lib/colors";
import InviteModal from "@/components/InviteModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface GroupSummary {
  id: string;
  name: string;
  role: string;
  memberCount: number;
  isPersonal?: boolean;
}

interface Props {
  user?: { name?: string | null; email?: string | null; image?: string | null };
  groups: GroupSummary[];
  visibleIds: string[];
  onToggleVisible: (id: string) => void;
  onGroupsChanged: () => void;
  onNewEvent: () => void;
}

const btn =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700";
const btnPrimary =
  "rounded-lg border border-accent bg-accent px-3 py-2 text-sm text-white transition hover:bg-accent-dark disabled:opacity-50";
const input =
  "w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500";
const label = "mb-1 text-xs font-medium uppercase tracking-wide text-slate-400";
const menuItem =
  "block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700";

function initials(name?: string | null, email?: string | null) {
  return (name || email || "?").slice(0, 2).toUpperCase();
}

export default function Sidebar({
  user,
  groups,
  visibleIds,
  onToggleVisible,
  onGroupsChanged,
  onNewEvent,
}: Props) {
  const { data: session } = useSession();
  const myId = (session?.user as any)?.id as string | undefined;

  const [newGroup, setNewGroup] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [manage, setManage] = useState<{
    id: string;
    name: string;
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

  return (
    <aside className="animate-fade-in flex h-full w-[300px] max-w-[85vw] shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
      <h1 className="text-lg font-semibold">📅 Team Calendar</h1>

      {user && (
        <div className="flex items-center gap-2.5 text-sm">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.image} alt="" className="h-8 w-8 rounded-full" />
          ) : (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-blue-900">
              {initials(user.name, user.email)}
            </span>
          )}
          <div className="min-w-0">
            <div className="truncate">{user.name || user.email}</div>
            <div className="truncate text-xs text-slate-400">{user.email}</div>
          </div>
        </div>
      )}

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
          <button
            onClick={() => {
              setNewGroup("");
              setShowCreate(true);
            }}
            aria-label="New calendar"
            title="New calendar"
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
        </div>
        <div className="flex flex-col gap-0.5">
          {groups.map((g) => {
            const visible = visibleIds.includes(g.id);
            const color = colorForKey(g.id);
            const canManage =
              !g.isPersonal && (g.role === "OWNER" || g.role === "ADMIN");
            const canDelete = !g.isPersonal && g.role === "OWNER";
            const canLeave = !g.isPersonal && g.role !== "OWNER";
            const hasMenu = !g.isPersonal;
            return (
              <div
                key={g.id}
                className="group relative flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-sm transition hover:bg-slate-100 dark:hover:bg-slate-800"
              >
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
                      <button
                        className={menuItem}
                        onClick={() => {
                          setManage({ id: g.id, name: g.name, tab: "members" });
                          setMenuId(null);
                        }}
                      >
                        Members
                      </button>
                      {canManage && (
                        <button
                          className={menuItem}
                          onClick={() => {
                            setManage({ id: g.id, name: g.name, tab: "share" });
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

      <div className="mt-auto">
        <button
          className={`${btn} w-full`}
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          Sign out
        </button>
      </div>

      {manage && (
        <InviteModal
          groupId={manage.id}
          groupName={manage.name}
          initialTab={manage.tab}
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

      {/* Rename dialog */}
      <Dialog open={!!rename} onOpenChange={(o) => !o && setRename(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename calendar</DialogTitle>
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
