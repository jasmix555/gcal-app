"use client";

import { useCallback, useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import { colorForKey } from "@/lib/colors";
import InviteModal from "@/components/InviteModal";
import ConfirmDialog from "@/components/ConfirmDialog";

interface GroupSummary {
  id: string;
  name: string;
  role: string;
  memberCount: number;
}

interface Member {
  id: string;
  name?: string | null;
  email?: string | null;
  role: string;
}

interface PendingInvite {
  id: string;
  token: string;
  role: string;
  group: { id: string; name: string };
}

interface Props {
  user?: { name?: string | null; email?: string | null; image?: string | null };
  groups: GroupSummary[];
  currentGroupId: string | null;
  onSelectGroup: (id: string) => void;
  onGroupsChanged: () => void;
  onNewEvent: () => void;
}

const btn =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700";
const btnPrimary =
  "rounded-lg border border-accent bg-accent px-3 py-2 text-sm text-white transition hover:bg-accent-dark disabled:opacity-50";
const input =
  "w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none focus:border-accent dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500";
const label = "mb-1 text-xs font-medium uppercase tracking-wide text-slate-400";

function initials(name?: string | null, email?: string | null) {
  return (name || email || "?").slice(0, 2).toUpperCase();
}

function Avatar({
  name,
  email,
}: {
  name?: string | null;
  email?: string | null;
}) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-blue-900">
      {initials(name, email)}
    </span>
  );
}

export default function Sidebar({
  user,
  groups,
  currentGroupId,
  onSelectGroup,
  onGroupsChanged,
  onNewEvent,
}: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [myRole, setMyRole] = useState<string>("MEMBER");
  const [newGroup, setNewGroup] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [pending, setPending] = useState<PendingInvite[]>([]);
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null);

  const loadMembers = useCallback(() => {
    if (!currentGroupId) {
      setMembers([]);
      return;
    }
    fetch(`/api/groups/${currentGroupId}`)
      .then((r) => r.json())
      .then((d) => {
        setMembers(d.members || []);
        setMyRole(d.myRole || "MEMBER");
      })
      .catch(() => setMembers([]));
  }, [currentGroupId]);

  useEffect(loadMembers, [loadMembers]);

  function loadPending() {
    fetch("/api/invitations")
      .then((r) => r.json())
      .then((d) => setPending(d.invitations || []))
      .catch(() => setPending([]));
  }
  useEffect(loadPending, []);

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
      toast.success(`Group “${name}” created`);
      onGroupsChanged();
      if (d.group?.id) onSelectGroup(d.group.id);
    } catch (err: any) {
      toast.error(err.message || "Could not create group");
    }
  }

  async function accept(token: string) {
    try {
      const res = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not accept invite");
      toast.success("Invitation accepted");
      loadPending();
      onGroupsChanged();
      if (d.groupId) onSelectGroup(d.groupId);
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function doRemoveMember(member: Member) {
    if (!currentGroupId) return;
    try {
      const res = await fetch(
        `/api/groups/${currentGroupId}/members/${member.id}`,
        { method: "DELETE" }
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not remove member");
      toast.success(`Removed ${member.name || member.email}`);
      loadMembers();
      onGroupsChanged();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function doDeleteGroup() {
    if (!currentGroupId) return;
    try {
      const res = await fetch(`/api/groups/${currentGroupId}`, {
        method: "DELETE",
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not delete group");
      toast.success("Group deleted");
      onSelectGroup("");
      onGroupsChanged();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  const canInvite = myRole === "OWNER" || myRole === "ADMIN";
  const isOwner = myRole === "OWNER";
  const currentGroupName =
    groups.find((g) => g.id === currentGroupId)?.name || "this group";

  return (
    <aside className="animate-fade-in flex h-full w-[300px] max-w-[85vw] shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
      <h1 className="text-lg font-semibold">📅 Team Calendar</h1>

      {user && (
        <div className="flex items-center gap-2.5 text-sm">
          {user.image ? (
            <img src={user.image} alt="" className="h-8 w-8 rounded-full" />
          ) : (
            <Avatar name={user.name} email={user.email} />
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
        disabled={!currentGroupId}
      >
        + New event
      </button>

      <div>
        <p className={label}>Group</p>
        <select
          className={input}
          value={currentGroupId || ""}
          onChange={(e) => onSelectGroup(e.target.value)}
        >
          {groups.length === 0 && <option value="">No groups yet</option>}
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} ({g.memberCount})
            </option>
          ))}
        </select>
        <form className="mt-2 flex gap-1.5" onSubmit={createGroup}>
          <input
            className={input}
            value={newGroup}
            onChange={(e) => setNewGroup(e.target.value)}
            placeholder="New group name"
          />
          <button
            className={`${btn} disabled:cursor-not-allowed`}
            type="submit"
            disabled={!newGroup.trim()}
          >
            Create
          </button>
        </form>
      </div>

      {currentGroupId && (
        <div>
          <p className={label}>Members</p>
          <div className="flex flex-col gap-0.5">
            {members.map((m) => (
              <div
                key={m.id}
                className="group flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-[13px] transition hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: colorForKey(m.id || m.email) }}
                />
                <span className="truncate">{m.name || m.email}</span>
                <span className="ml-auto text-[11px] uppercase text-slate-400">
                  {m.role}
                </span>
                {canInvite && m.role !== "OWNER" && (
                  <button
                    onClick={() => setMemberToRemove(m)}
                    title="Remove from group"
                    aria-label={`Remove ${m.name || m.email}`}
                    className="ml-1 hidden h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 transition hover:bg-red-50 hover:text-red-600 group-hover:flex"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {currentGroupId && canInvite && (
        <button className={`${btn} w-full`} onClick={() => setShowInvite(true)}>
          Invite people
        </button>
      )}

      {currentGroupId && isOwner && (
        <button
          className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-600 transition hover:bg-red-50 dark:border-red-900/60 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950/40"
          onClick={() => setConfirmDeleteGroup(true)}
        >
          Delete group
        </button>
      )}

      {pending.length > 0 && (
        <div>
          <p className={label}>Invitations for you</p>
          <div className="flex flex-col gap-2">
            {pending.map((p) => (
              <div
                key={p.id}
                className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-white p-2 text-[13px] dark:border-slate-700 dark:bg-slate-800"
              >
                <div>
                  <strong>{p.group.name}</strong> · {p.role}
                </div>
                <button
                  className={`${btnPrimary} px-2.5 py-1 text-xs`}
                  onClick={() => accept(p.token)}
                >
                  Accept
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-auto">
        <button
          className={`${btn} w-full`}
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          Sign out
        </button>
      </div>

      {showInvite && currentGroupId && (
        <InviteModal
          groupId={currentGroupId}
          groupName={currentGroupName}
          onClose={() => setShowInvite(false)}
        />
      )}

      <ConfirmDialog
        open={confirmDeleteGroup}
        onOpenChange={setConfirmDeleteGroup}
        title={`Delete “${currentGroupName}”?`}
        description="This permanently removes the group and all of its events for everyone. This can't be undone."
        confirmLabel="Delete group"
        onConfirm={() => {
          setConfirmDeleteGroup(false);
          doDeleteGroup();
        }}
      />

      <ConfirmDialog
        open={!!memberToRemove}
        onOpenChange={(o) => !o && setMemberToRemove(null)}
        title="Remove member?"
        description={
          memberToRemove
            ? `Remove ${memberToRemove.name || memberToRemove.email} from this group?`
            : ""
        }
        confirmLabel="Remove"
        onConfirm={() => {
          const m = memberToRemove;
          setMemberToRemove(null);
          if (m) doRemoveMember(m);
        }}
      />
    </aside>
  );
}
