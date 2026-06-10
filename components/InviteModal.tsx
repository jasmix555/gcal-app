"use client";

import { useEffect, useState } from "react";

interface Props {
  groupId: string;
  groupName: string;
  onClose: () => void;
}

const input =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent";

export default function InviteModal({ groupId, groupName, onClose }: Props) {
  const [link, setLink] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Email invite (uses the existing per-email endpoint)
  const [email, setEmail] = useState("");
  const [emailMsg, setEmailMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/groups/${groupId}/invite-link`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not load invite link.");
        setLink(d.url);
        setCode(d.code);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [groupId]);

  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  // Native share sheet on mobile; falls back to copy on desktop browsers
  // that don't support the Web Share API.
  async function share() {
    const data = {
      title: `Join "${groupName}"`,
      text: `Join my calendar group "${groupName}". Open this link to join:`,
      url: link,
    };
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share(data);
      } catch {
        /* user dismissed the share sheet */
      }
    } else {
      copy();
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

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="animate-scale-in flex w-[420px] max-w-full flex-col gap-4 rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-lg font-semibold">Invite people</h3>
          <p className="text-sm text-slate-500">
            Anyone with this link can join <strong>{groupName}</strong>.
          </p>
        </div>

        {loading && <p className="text-sm text-slate-500">Loading link…</p>}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Group code */}
            <div className="rounded-xl bg-slate-50 p-3 text-center">
              <div className="text-xs uppercase tracking-wide text-slate-400">
                Group code
              </div>
              <div className="select-all font-mono text-lg font-semibold tracking-wider text-slate-800">
                {code}
              </div>
            </div>

            {/* Link + copy */}
            <div className="flex gap-2">
              <input className={input} readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
              <button
                onClick={copy}
                className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition hover:bg-slate-50"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>

            {/* Native share */}
            <button
              onClick={share}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-accent bg-accent px-3 py-2.5 text-sm font-medium text-white transition hover:bg-accent-dark"
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
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
                <line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
              </svg>
              Share
            </button>

            {/* Email invite */}
            <div className="border-t border-slate-200 pt-3">
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
                <button
                  type="submit"
                  className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition hover:bg-slate-50"
                >
                  Invite
                </button>
              </form>
              {emailMsg && (
                <p className="mt-1.5 text-xs text-slate-500">{emailMsg}</p>
              )}
            </div>
          </>
        )}

        <button
          onClick={onClose}
          className="mt-1 self-end rounded-lg px-3 py-2 text-sm text-slate-500 transition hover:bg-slate-100"
        >
          Done
        </button>
      </div>
    </div>
  );
}
