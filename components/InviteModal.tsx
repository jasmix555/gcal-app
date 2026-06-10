"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  groupId: string;
  groupName: string;
  onClose: () => void;
}

const input =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500";

export default function InviteModal({ groupId, groupName, onClose }: Props) {
  const [link, setLink] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
        /* dismissed */
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
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite people</DialogTitle>
          <DialogDescription>
            Anyone with this link can join <strong>{groupName}</strong>.
          </DialogDescription>
        </DialogHeader>

        {loading && <p className="text-sm text-slate-500">Loading link…</p>}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl bg-slate-50 p-3 text-center">
              <div className="text-xs uppercase tracking-wide text-slate-400">
                Group code
              </div>
              <div className="select-all font-mono text-lg font-semibold tracking-wider text-slate-800">
                {code}
              </div>
            </div>

            <div className="flex gap-2">
              <input
                className={input}
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button variant="outline" onClick={copy}>
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>

            <Button onClick={share} className="w-full">
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
    </Dialog>
  );
}
