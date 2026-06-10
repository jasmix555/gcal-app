"use client";

import { useEffect, useState } from "react";
import { signIn, getProviders } from "next-auth/react";
import Link from "next/link";

const input =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent";
const label = "mb-1 block text-xs font-medium text-slate-500";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const isRegister = mode === "register";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [callbackUrl, setCallbackUrl] = useState("/");

  useEffect(() => {
    getProviders().then((p) =>
      setGoogleEnabled(Boolean(p && (p as any).google))
    );
    const params = new URLSearchParams(window.location.search);
    setCallbackUrl(params.get("callbackUrl") || "/");
  }, []);

  async function handleDemo() {
    setError(null);
    setLoading(true);
    const result = await signIn("credentials", {
      email: "demo@demo.com",
      password: "demodemo",
      redirect: false,
    });
    if (result?.error) {
      setError("Demo account isn't seeded yet. Run: npx prisma db seed");
      setLoading(false);
      return;
    }
    window.location.href = "/";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (isRegister) {
        const res = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || "Could not create account.");
        }
      }
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (result?.error) throw new Error("Invalid email or password.");
      window.location.href = callbackUrl;
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="animate-scale-in flex w-[380px] max-w-full flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-7 shadow-[0_10px_30px_rgba(0,0,0,0.06)]">
        <h1 className="text-xl font-semibold">
          📅 {isRegister ? "Create your account" : "Sign in"}
        </h1>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-[13px] text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {isRegister && (
            <div>
              <label className={label}>Name</label>
              <input
                className={input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            </div>
          )}
          <div>
            <label className={label}>Email</label>
            <input
              className={input}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </div>
          <div>
            <label className={label}>Password</label>
            <input
              className={input}
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={
                isRegister ? "At least 8 characters" : "Your password"
              }
            />
          </div>
          <button
            className="w-full rounded-lg border border-accent bg-accent px-3 py-2 text-sm text-white transition hover:bg-accent-dark disabled:opacity-50"
            type="submit"
            disabled={loading}
          >
            {loading
              ? "Please wait…"
              : isRegister
                ? "Create account"
                : "Sign in"}
          </button>
        </form>

        {googleEnabled && (
          <button
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition hover:bg-slate-50"
            onClick={() => signIn("google", { callbackUrl })}
          >
            Continue with Google
          </button>
        )}

        {!isRegister && (
          <>
            <div className="flex items-center gap-2.5 text-xs text-slate-400 before:h-px before:flex-1 before:bg-slate-200 after:h-px after:flex-1 after:bg-slate-200">
              just exploring?
            </div>
            <button
              className="w-full rounded-lg border border-dashed border-accent bg-accent-soft px-3 py-2 text-sm font-medium text-blue-900 transition hover:bg-blue-100 disabled:opacity-50"
              onClick={handleDemo}
              disabled={loading}
            >
              Try the demo (no signup)
            </button>
          </>
        )}

        <div className="text-center text-[13px] text-slate-400">
          {isRegister ? (
            <>
              Already have an account?{" "}
              <Link href="/login" className="text-accent hover:underline">
                Sign in
              </Link>
            </>
          ) : (
            <>
              New here?{" "}
              <Link href="/register" className="text-accent hover:underline">
                Create an account
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
