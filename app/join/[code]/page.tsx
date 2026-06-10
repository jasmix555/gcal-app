"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

export default function JoinPage({ params }: { params: { code: string } }) {
  const { status } = useSession();
  const [message, setMessage] = useState("Joining the group…");

  useEffect(() => {
    if (status === "loading") return;

    if (status === "unauthenticated") {
      // Sign in / register first, then come back here to join.
      const cb = encodeURIComponent(`/join/${params.code}`);
      window.location.href = `/login?callbackUrl=${cb}`;
      return;
    }

    fetch("/api/groups/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: params.code }),
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not join the group.");
        setMessage(`Joined ${d.groupName || "the group"}! Taking you in…`);
        setTimeout(() => (window.location.href = "/"), 1200);
      })
      .catch((err) => setMessage(err.message));
  }, [status, params.code]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
      <div className="animate-scale-in flex w-[380px] max-w-full flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-7 shadow-[0_10px_30px_rgba(0,0,0,0.06)] dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-xl font-semibold">📅 Team Calendar</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{message}</p>
      </div>
    </div>
  );
}
