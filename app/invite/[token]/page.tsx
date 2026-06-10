"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

export default function InvitePage({ params }: { params: { token: string } }) {
  const { status } = useSession();
  const [message, setMessage] = useState("Checking your invitation…");

  useEffect(() => {
    if (status === "loading") return;

    if (status === "unauthenticated") {
      const cb = encodeURIComponent(`/invite/${params.token}`);
      window.location.href = `/login?callbackUrl=${cb}`;
      return;
    }

    fetch("/api/invitations/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: params.token }),
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not accept invitation.");
        setMessage("Invitation accepted! Taking you to the calendar…");
        setTimeout(() => (window.location.href = "/"), 1200);
      })
      .catch((err) => setMessage(err.message));
  }, [status, params.token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="animate-scale-in flex w-[380px] max-w-full flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-7 shadow-[0_10px_30px_rgba(0,0,0,0.06)]">
        <h1 className="text-xl font-semibold">📅 Team Calendar</h1>
        <p className="text-sm text-slate-500">{message}</p>
      </div>
    </div>
  );
}
