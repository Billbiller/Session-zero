"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignInPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const endpoint = mode === "signin" ? "/api/auth/signin" : "/api/auth/signup";
    const body =
      mode === "signin" ? { email, password } : { displayName, email, password };
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.push("/campaigns");
    router.refresh();
  }

  return (
    <div className="max-w-sm">
      <div className="mb-4 flex gap-4 border-b border-black/10 dark:border-white/10">
        <button
          onClick={() => {
            setMode("signin");
            setError(null);
          }}
          className={`pb-2 text-sm font-medium ${
            mode === "signin"
              ? "border-b-2 border-black dark:border-white"
              : "text-black/50 dark:text-white/50"
          }`}
        >
          Sign in
        </button>
        <button
          onClick={() => {
            setMode("signup");
            setError(null);
          }}
          className={`pb-2 text-sm font-medium ${
            mode === "signup"
              ? "border-b-2 border-black dark:border-white"
              : "text-black/50 dark:text-white/50"
          }`}
        >
          Create account
        </button>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {mode === "signup" && (
          <label className="flex flex-col gap-1 text-sm">
            Display name
            <input
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="rounded border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-transparent"
            />
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-transparent"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            required
            type="password"
            minLength={mode === "signup" ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded border border-black/20 px-3 py-2 dark:border-white/20 dark:bg-transparent"
          />
          {mode === "signup" && (
            <span className="text-xs text-black/50 dark:text-white/50">
              At least 8 characters.
            </span>
          )}
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {submitting
            ? mode === "signin"
              ? "Signing in..."
              : "Creating account..."
            : mode === "signin"
              ? "Sign in"
              : "Create account"}
        </button>
      </form>
    </div>
  );
}
