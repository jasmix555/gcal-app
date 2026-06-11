"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import Avatar from "@/components/Avatar";
import ConfirmDialog from "@/components/ConfirmDialog";

interface Profile {
  name: string | null;
  email: string | null;
  image: string | null;
  createdAt: string;
  hasPassword: boolean;
  providers: string[];
}

const input =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500";
const card =
  "rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900";
const sectionTitle = "mb-1 text-sm font-semibold";
const sectionHint = "mb-4 text-xs text-slate-500 dark:text-slate-400";

export default function SettingsPage() {
  const router = useRouter();
  const { status, update } = useSession();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setProfile(d);
        setName(d.name || "");
        setPhoto(d.image || null);
      })
      .catch(() => {});
  }, []);

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
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

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
        savePhoto(canvas.toDataURL("image/jpeg", 0.85));
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
      setPhoto(value);
      setProfile((p) => (p ? { ...p, image: value } : p));
      toast.success("Photo updated");
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
      router.push("/");
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function doDelete() {
    try {
      const res = await fetch("/api/profile", { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete account");
      toast.success("Account deleted");
      signOut({ callbackUrl: "/login" });
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  const providerLabel = profile?.providers.includes("google")
    ? "Google"
    : "Email & password";

  return (
    <div className="min-h-[100dvh] bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={() => router.push("/")}
            aria-label="Back to calendar"
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            ←
          </button>
          <h1 className="text-xl font-semibold">Settings</h1>
        </div>

        <div className="flex flex-col gap-4">
          {/* Profile */}
          <div className={card}>
            <div className={sectionTitle}>Profile</div>
            <div className={sectionHint}>
              Your name and photo across the app.
            </div>
            <div className="flex items-center gap-4">
              <Avatar
                src={photo}
                name={name}
                email={profile?.email}
                className="h-16 w-16"
              />
              <div className="flex flex-col gap-2">
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
                    disabled={busy}
                  >
                    Change photo
                  </Button>
                  {photo && (
                    <Button
                      variant="outline"
                      onClick={() => savePhoto(null)}
                      disabled={busy}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Display name
              </label>
              <div className="flex gap-2">
                <input
                  className={input}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                />
                <Button onClick={saveName} disabled={busy || !name.trim()}>
                  Save
                </Button>
              </div>
            </div>
          </div>

          {/* Security */}
          {profile?.hasPassword && (
            <div className={card}>
              <div className={sectionTitle}>Security</div>
              <div className={sectionHint}>Change your password.</div>
              <div className="flex flex-col gap-2 sm:flex-row">
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
                  placeholder="New password (min 6)"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                />
                <Button
                  onClick={changePassword}
                  disabled={busy || newPw.length < 6 || !curPw}
                >
                  Update
                </Button>
              </div>
            </div>
          )}

          {/* Account */}
          <div className={card}>
            <div className={sectionTitle}>Account</div>
            <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-6 gap-y-1.5 text-sm">
              <dt className="text-slate-400">Email</dt>
              <dd className="truncate">{profile?.email || "—"}</dd>
              <dt className="text-slate-400">Sign-in</dt>
              <dd>{providerLabel}</dd>
              <dt className="text-slate-400">Member since</dt>
              <dd>
                {profile?.createdAt
                  ? new Date(profile.createdAt).toLocaleDateString()
                  : "—"}
              </dd>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => window.open("/api/profile/export", "_blank")}
              >
                Export my data
              </Button>
              <Button
                variant="outline"
                onClick={() => signOut({ callbackUrl: "/login" })}
              >
                Sign out
              </Button>
            </div>
          </div>

          {/* Danger zone */}
          <div className="rounded-2xl border border-red-200 bg-red-50/40 p-5 dark:border-red-900/50 dark:bg-red-950/20">
            <div className={`${sectionTitle} text-red-600 dark:text-red-400`}>
              Danger zone
            </div>
            <div className={sectionHint}>
              These actions are permanent and can&apos;t be undone.
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <div className="font-medium">Reset account</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Delete your notes, events, and owned calendars; keep your
                    login.
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/30"
                  onClick={() => setConfirmReset(true)}
                >
                  Reset
                </Button>
              </div>

              <div className="border-t border-red-200 pt-4 dark:border-red-900/40">
                <div className="text-sm font-medium">Delete account</div>
                <div className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                  Permanently deletes your account and all its data. Type{" "}
                  <span className="font-mono font-semibold">DELETE</span> to
                  confirm.
                </div>
                <div className="flex gap-2">
                  <input
                    className={input}
                    value={deleteText}
                    onChange={(e) => setDeleteText(e.target.value)}
                    placeholder="DELETE"
                  />
                  <Button
                    variant="destructive"
                    disabled={deleteText !== "DELETE"}
                    onClick={doDelete}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={(o) => !o && setConfirmReset(false)}
        title="Reset account?"
        description="This permanently deletes your notes, your events, and the calendars you own, and removes you from shared calendars. Your login stays."
        confirmLabel="Reset everything"
        onConfirm={doReset}
      />
    </div>
  );
}
