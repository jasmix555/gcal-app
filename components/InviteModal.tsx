"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import ConfirmDialog from "@/components/ConfirmDialog";
import Avatar from "@/components/Avatar";

interface Member {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role: string;
}

interface Props {
  groupId: string;
  groupName: string;
  onClose: () => void;
  onChanged?: () => void;
  initialTab?: "members" | "share";
  /** Role known by the opener, so the Share tab can show before the fetch lands. */
  initialRole?: string;
}

const input =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500";

const ROLE_BADGE: Record<string, string> = {
  OWNER: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  ADMIN: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  MEMBER: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300",
};

function CopyIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export default function InviteModal({
  groupId,
  groupName,
  onClose,
  onChanged,
  initialTab = "members",
  initialRole,
}: Props) {
  const { data: session } = useSession();
  const myId = (session?.user as any)?.id as string | undefined;

  const [tab, setTab] = useState<"members" | "share">(initialTab);
  const [members, setMembers] = useState<Member[]>([]);
  const [myRole, setMyRole] = useState(initialRole || "MEMBER");
  const [membersLoading, setMembersLoading] = useState(true);
  const [linkLoading, setLinkLoading] = useState(true);

  const [link, setLink] = useState("");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [emailMsg, setEmailMsg] = useState<string | null>(null);

  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [menuCoords, setMenuCoords] = useState({ top: 0, left: 0 });
  const [confirmTransfer, setConfirmTransfer] = useState<Member | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Member | null>(null);

  const canManage = myRole === "OWNER" || myRole === "ADMIN";
  const isOwner = myRole === "OWNER";

  const loadMembers = useCallback(() => {
    setMembersLoading(true);
    fetch(`/api/groups/${groupId}`)
      .then((r) => r.json())
      .then((d) => {
        setMembers(d.members || []);
        setMyRole(d.myRole || "MEMBER");
      })
      .catch(() => {})
      .finally(() => setMembersLoading(false));
  }, [groupId]);

  useEffect(() => {
    loadMembers();
    setLinkLoading(true);
    fetch(`/api/groups/${groupId}/invite-link`)
      .then(async (r) => {
        if (!r.ok) return;
        const d = await r.json();
        setLink(d.url);
        setCode(d.code);
      })
      .catch(() => {})
      .finally(() => setLinkLoading(false));
  }, [groupId, loadMembers]);

  // Members can't open the Share tab.
  useEffect(() => {
    if (!canManage && tab === "share") setTab("members");
  }, [canManage, tab]);

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      /* ignore */
    }
  }

  async function share() {
    const data = {
      title: `Join "${groupName}"`,
      text: `Join my calendar "${groupName}". Open this link to join:`,
      url: link,
    };
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share(data);
      } catch {
        /* dismissed */
      }
    } else {
      copyText(link, "Link");
    }
  }

  async function sendEmailInvite(e: React.FormEvent) {
    e.preventDefault();
    setEmailMsg(null);
    const value = email.trim();
    if (!value) return;
    const res = await fetch(`/api/groups/${groupId}/invitations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: value }),
    });
    const d = await res.json();
    if (!res.ok) {
      setEmailMsg(d.error || "Could not create invitation.");
      return;
    }
    setEmail("");
    setEmailMsg(`Invitation created for ${value}.`);
  }

  async function changeRole(m: Member, role: string) {
    setMenuFor(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/members/${m.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not update role");
      toast.success(
        role === "OWNER"
          ? `${m.name || m.email} is now the owner`
          : `${m.name || m.email} is now ${role.toLowerCase()}`
      );
      loadMembers();
      onChanged?.();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function removeMember(m: Member) {
    setConfirmRemove(null);
    setMenuFor(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/members/${m.id}`, {
        method: "DELETE",
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not remove member");
      toast.success(`Removed ${m.name || m.email}`);
      loadMembers();
      onChanged?.();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  function openMemberMenu(id: string, e: React.MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const width = 180;
    setMenuCoords({
      top: r.bottom + 4,
      left: Math.max(
        8,
        Math.min(r.right - width, window.innerWidth - width - 8)
      ),
    });
    setMenuFor((cur) => (cur === id ? null : id));
  }

  const menuMember = members.find((m) => m.id === menuFor) || null;

  const tabBtn = (active: boolean) =>
    `flex-1 rounded-md py-1.5 text-sm font-medium transition ${
      active
        ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
        : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
    }`;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        onInteractOutside={(e) => {
          const t = (e.detail as any)?.originalEvent?.target as
            | HTMLElement
            | undefined;
          if (
            t?.closest?.("[data-portal-menu]") ||
            t?.closest?.("[role='alertdialog']")
          )
            e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{groupName}</DialogTitle>
          <DialogDescription>Members &amp; sharing</DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          <button
            className={tabBtn(tab === "members")}
            onClick={() => setTab("members")}
          >
            Members
          </button>
          {canManage && (
            <button
              className={tabBtn(tab === "share")}
              onClick={() => setTab("share")}
            >
              Share
            </button>
          )}
        </div>

        {/* ---- Members tab ---- */}
        {tab === "members" && (
          <div className="flex flex-col gap-1">
            {membersLoading &&
              members.length === 0 &&
              Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={`s${i}`}
                  className="flex items-center gap-2 rounded-lg px-1 py-1.5"
                >
                  <Skeleton className="h-2.5 w-2.5 rounded-full" />
                  <div className="flex flex-col gap-1">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                  <Skeleton className="ml-auto h-5 w-14 rounded-full" />
                </div>
              ))}
            {members.map((m) => {
              const isSelf = m.id === myId;
              const ownerControls = isOwner && !isSelf;
              const adminRemove =
                myRole === "ADMIN" && m.role === "MEMBER" && !isSelf;
              return (
                <div
                  key={m.id}
                  className="group relative flex items-center gap-2 rounded-lg px-1 py-1.5"
                >
                  <Avatar
                    src={m.image}
                    name={m.name}
                    email={m.email}
                    colorKey={m.id || m.email}
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm">
                      {m.name || m.email}
                      {isSelf && <span className="text-slate-400"> (you)</span>}
                    </div>
                    {m.email && (
                      <div className="flex items-center gap-1 text-xs text-slate-400">
                        <span className="truncate">{m.email}</span>
                        <button
                          onClick={() => copyText(m.email!, "Email")}
                          aria-label="Copy email"
                          className="rounded p-0.5 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          <CopyIcon />
                        </button>
                      </div>
                    )}
                  </div>

                  <span
                    className={`ml-auto rounded-full px-2 py-0.5 text-[11px] uppercase ${ROLE_BADGE[m.role]}`}
                  >
                    {m.role}
                  </span>

                  {ownerControls && (
                    <button
                      onClick={(e) => openMemberMenu(m.id, e)}
                      aria-label="Member options"
                      className="rounded px-1.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                    >
                      ⋯
                    </button>
                  )}
                  {adminRemove && (
                    <button
                      onClick={() => setConfirmRemove(m)}
                      aria-label="Remove member"
                      className="rounded p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ---- Share tab ---- */}
        {tab === "share" && canManage && (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl bg-slate-50 p-3 text-center dark:bg-slate-800">
              <div className="text-xs uppercase tracking-wide text-slate-400">
                Calendar code
              </div>
              {linkLoading ? (
                <Skeleton className="mx-auto mt-1 h-6 w-28" />
              ) : (
                <div className="select-all font-mono text-lg font-semibold tracking-wider text-slate-800 dark:text-slate-100">
                  {code || "—"}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              {linkLoading ? (
                <Skeleton className="h-10 flex-1" />
              ) : (
                <input
                  className={input}
                  readOnly
                  value={link}
                  onFocus={(e) => e.currentTarget.select()}
                />
              )}
              <Button
                variant="outline"
                disabled={linkLoading}
                onClick={() => copyText(link, "Link")}
              >
                Copy
              </Button>
            </div>

            <Button onClick={share} disabled={linkLoading} className="w-full">
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
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
                <line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
              </svg>
              Share
            </Button>

            <div className="border-t border-slate-200 pt-3 dark:border-slate-800">
              <div className="mb-1 text-xs uppercase tracking-wide text-slate-400">
                Or invite by email
              </div>
              <form className="flex gap-2" onSubmit={sendEmailInvite}>
                <input
                  className={input}
                  type="email"
                  placeholder="person@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Button type="submit" variant="outline">
                  Invite
                </Button>
              </form>
              {emailMsg && (
                <p className="mt-1.5 text-xs text-slate-500">{emailMsg}</p>
              )}
            </div>
          </div>
        )}
      </DialogContent>

      {/* Member action menu — portaled out so it isn't clipped by the dialog. */}
      {menuFor &&
        menuMember &&
        createPortal(
          <>
            <div
              data-portal-menu
              className="pointer-events-auto fixed inset-0 z-[60]"
              onClick={() => setMenuFor(null)}
            />
            <div
              data-portal-menu
              style={{
                position: "fixed",
                top: menuCoords.top,
                left: menuCoords.left,
              }}
              className="pointer-events-auto z-[61] w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-800"
            >
              {menuMember.role === "MEMBER" ? (
                <button
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                  onClick={() => changeRole(menuMember, "ADMIN")}
                >
                  Make admin
                </button>
              ) : (
                <button
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                  onClick={() => changeRole(menuMember, "MEMBER")}
                >
                  Make member
                </button>
              )}
              <button
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                onClick={() => {
                  setConfirmTransfer(menuMember);
                  setMenuFor(null);
                }}
              >
                Transfer ownership
              </button>
              <button
                className="block w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-slate-100 dark:text-red-400 dark:hover:bg-slate-700"
                onClick={() => {
                  setConfirmRemove(menuMember);
                  setMenuFor(null);
                }}
              >
                Remove from calendar
              </button>
            </div>
          </>,
          document.body
        )}

      <ConfirmDialog
        open={!!confirmTransfer}
        onOpenChange={(o) => !o && setConfirmTransfer(null)}
        title="Transfer ownership?"
        description={
          confirmTransfer
            ? `${confirmTransfer.name || confirmTransfer.email} will become the owner and you'll become an admin.`
            : ""
        }
        confirmLabel="Transfer"
        onConfirm={() => {
          const m = confirmTransfer;
          setConfirmTransfer(null);
          if (m) changeRole(m, "OWNER");
        }}
      />

      <ConfirmDialog
        open={!!confirmRemove}
        onOpenChange={(o) => !o && setConfirmRemove(null)}
        title="Remove member?"
        description={
          confirmRemove
            ? `Remove ${confirmRemove.name || confirmRemove.email} from this calendar?`
            : ""
        }
        confirmLabel="Remove"
        onConfirm={() => {
          const m = confirmRemove;
          if (m) removeMember(m);
        }}
      />
    </Dialog>
  );
}
