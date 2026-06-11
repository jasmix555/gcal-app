"use client";

import { useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import ConfirmDialog from "@/components/ConfirmDialog";

interface UserLite {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

interface Profile {
  name: string | null;
  email: string | null;
  image: string | null;
  createdAt: string;
  hasPassword: boolean;
  providers: string[];
}

interface Props {
  user?: UserLite;
  /** Called after a destructive "reset" so the rest of the app can refresh. */
  onResetDone?: () => void;
}

const input =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500";
const menuItem =
  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700";

function initials(name?: string | null, email?: string | null) {
  return (name || email || "?").slice(0, 2).toUpperCase();
}

export default function ProfileMenu({ user, onResetDone }: Props) {
  const { update } = useSession();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);

  // Dialogs
  const [showName, setShowName] = useState(false);
  const [showPhoto, setShowPhoto] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Form state
  const [name, setName] = useState(user?.name || "");
  const [photo, setPhoto] = useState<string | null>(user?.image || null);
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function loadProfile() {
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setProfile(d))
      .catch(() => {});
  }

  // Load profile (incl. the DB-stored avatar) on mount; avatars are kept out
  // of the session cookie to avoid bloating it with data URLs.
  useEffect(() => {
    loadProfile();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const avatar = profile?.image ?? user?.image;
  const displayName = profile?.name ?? user?.name;
  const email = profile?.email ?? user?.email;

  async function saveName() {
    const value = name.trim();
    if (!value) return;
    setBusy(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: value }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not update name");
      await update({ name: value });
      setProfile((p) => (p ? { ...p, name: value } : p));
      toast.success("Name updated");
      setShowName(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Resize a chosen image to a small square data URL (no external storage).
  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 160;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const min = Math.min(img.width, img.height);
        ctx.drawImage(
          img,
          (img.width - min) / 2,
          (img.height - min) / 2,
          min,
          min,
          0,
          0,
          size,
          size
        );
        setPhoto(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  async function savePhoto(value: string | null) {
    setBusy(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: value }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not update photo");
      // Keep the (possibly large) data URL out of the session cookie; the
      // sidebar avatar reads from local profile state instead.
      setProfile((p) => (p ? { ...p, image: value } : p));
      toast.success("Photo updated");
      setShowPhoto(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function changePassword() {
    setBusy(true);
    try {
      const res = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: curPw, newPassword: newPw }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not change password");
      toast.success("Password changed");
      setCurPw("");
      setNewPw("");
      setShowPassword(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function doReset() {
    setConfirmReset(false);
    try {
      const res = await fetch("/api/profile/reset", { method: "POST" });
      if (!res.ok) throw new Error("Could not reset account");
      toast.success("Account reset");
      onResetDone?.();
      setTimeout(() => window.location.reload(), 400);
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function doDelete() {
    setConfirmDelete(false);
    try {
      const res = await fetch("/api/profile", { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete account");
      toast.success("Account deleted");
      signOut({ callbackUrl: "/login" });
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  function exportData() {
    setOpen(false);
    window.open("/api/profile/export", "_blank");
  }

  const providerLabel =
    profile && profile.providers.includes("google")
      ? "Google"
      : "Email & password";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1 text-left text-sm transition hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatar}
            alt=""
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-blue-900">
            {initials(displayName, email)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate">{displayName || email}</div>
          <div className="truncate text-xs text-slate-400">{email}</div>
        </div>
        <span className="text-slate-400">⋯</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-800">
            {/* Account info */}
            <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">
              <div className="truncate text-sm font-medium">
                {displayName || "—"}
              </div>
              <div className="truncate text-xs text-slate-400">{email}</div>
              <div className="mt-1 text-[11px] text-slate-400">
                {providerLabel}
                {profile?.createdAt
                  ? ` · joined ${new Date(profile.createdAt).toLocaleDateString()}`
                  : ""}
              </div>
            </div>

            <button
              className={menuItem}
              onClick={() => {
                setName(displayName || "");
                setShowName(true);
                setOpen(false);
              }}
            >
              ✏️ Edit name
            </button>
            <button
              className={menuItem}
              onClick={() => {
                setPhoto(avatar || null);
                setShowPhoto(true);
                setOpen(false);
              }}
            >
              🖼️ Change photo
            </button>
            {profile?.hasPassword && (
              <button
                className={menuItem}
                onClick={() => {
                  setShowPassword(true);
                  setOpen(false);
                }}
              >
                🔑 Change password
              </button>
            )}
            <button className={menuItem} onClick={exportData}>
              ⬇️ Export my data
            </button>

            <div className="my-1 border-t border-slate-100 dark:border-slate-700" />

            <button
              className={menuItem}
              onClick={() => {
                signOut({ callbackUrl: "/login" });
              }}
            >
              🚪 Sign out
            </button>
            <button
              className={`${menuItem} text-amber-600 dark:text-amber-400`}
              onClick={() => {
                setConfirmReset(true);
                setOpen(false);
              }}
            >
              ♻️ Reset account
            </button>
            <button
              className={`${menuItem} text-red-600 dark:text-red-400`}
              onClick={() => {
                setConfirmDelete(true);
                setOpen(false);
              }}
            >
              🗑️ Delete account
            </button>
          </div>
        </>
      )}

      {/* Edit name */}
      <Dialog open={showName} onOpenChange={(o) => !o && setShowName(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit name</DialogTitle>
          </DialogHeader>
          <input
            autoFocus
            className={input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveName()}
            placeholder="Your name"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowName(false)}>
              Cancel
            </Button>
            <Button onClick={saveName} disabled={busy || !name.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change photo */}
      <Dialog open={showPhoto} onOpenChange={(o) => !o && setShowPhoto(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change photo</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo}
                alt=""
                className="h-24 w-24 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-24 w-24 items-center justify-center rounded-full bg-accent-soft text-2xl font-semibold text-blue-900">
                {initials(displayName, email)}
              </span>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onPickFile}
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => fileRef.current?.click()}
              >
                Choose image
              </Button>
              {photo && (
                <Button variant="outline" onClick={() => setPhoto(null)}>
                  Remove
                </Button>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPhoto(false)}>
              Cancel
            </Button>
            <Button onClick={() => savePhoto(photo)} disabled={busy}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change password */}
      <Dialog
        open={showPassword}
        onOpenChange={(o) => !o && setShowPassword(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <input
              className={input}
              type="password"
              placeholder="Current password"
              value={curPw}
              onChange={(e) => setCurPw(e.target.value)}
            />
            <input
              className={input}
              type="password"
              placeholder="New password (min 6 chars)"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPassword(false)}>
              Cancel
            </Button>
            <Button
              onClick={changePassword}
              disabled={busy || newPw.length < 6 || !curPw}
            >
              Change password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={(o) => !o && setConfirmReset(false)}
        title="Reset account?"
        description="This permanently deletes your notes, your events, and the calendars you own, and removes you from shared calendars. Your login stays. This can't be undone."
        confirmLabel="Reset everything"
        onConfirm={doReset}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(false)}
        title="Delete account?"
        description="This permanently deletes your account and all of its data. This can't be undone."
        confirmLabel="Delete account"
        onConfirm={doDelete}
      />
    </div>
  );
}
