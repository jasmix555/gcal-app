"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import Avatar from "@/components/Avatar";

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
  providers: string[];
}

interface Props {
  user?: UserLite;
  /** Open the menu upward (e.g. when pinned to the bottom of the sidebar). */
  dropUp?: boolean;
  /** Kept for API compatibility (reset now lives on the settings page). */
  onResetDone?: () => void;
}

const menuItem =
  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700";

export default function ProfileMenu({ user, dropUp }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);

  // Load the DB-stored avatar/name (kept out of the session cookie).
  useEffect(() => {
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setProfile(d))
      .catch(() => {});
  }, []);

  const avatar = profile?.image ?? user?.image;
  const displayName = profile?.name ?? user?.name;
  const email = profile?.email ?? user?.email;
  const providerLabel = profile?.providers.includes("google")
    ? "Google"
    : "Email & password";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1 text-left text-sm transition hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <Avatar
          src={avatar}
          name={displayName}
          email={email}
          className="h-8 w-8"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate">{displayName || email}</div>
          <div className="truncate text-xs text-slate-400">{email}</div>
        </div>
        <span className="text-slate-400">⋯</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={`absolute left-0 right-0 z-50 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-800 ${
              dropUp ? "bottom-full mb-1" : "top-full mt-1"
            }`}
          >
            <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">
              <div className="truncate text-sm font-medium">
                {displayName || "—"}
              </div>
              <div className="truncate text-xs text-slate-400">{email}</div>
              <div className="mt-1 text-[11px] text-slate-400">
                {providerLabel}
              </div>
            </div>

            <button
              className={menuItem}
              onClick={() => {
                setOpen(false);
                router.push("/settings");
              }}
            >
              ⚙️ Settings
            </button>
            <button
              className={menuItem}
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              🚪 Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
