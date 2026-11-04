"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp, type SignUpState } from "./actions";

const initialState: SignUpState = { error: "", success: "" };

export default function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUp, initialState);

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <div className="space-y-2">
        <label htmlFor="name" className="block text-sm font-semibold text-[var(--foreground)]">Name</label>
        <input id="name" name="name" type="text" autoComplete="name" required maxLength={100}
          className="h-14 w-full rounded-[8px] border border-[var(--border)] bg-[var(--background)] px-4 text-base text-[var(--foreground)] outline-none transition-colors placeholder:text-[var(--muted)] focus:border-[var(--accent-strong)] focus:ring-1 focus:ring-[var(--accent-strong)]"
          placeholder="Your name" />
      </div>

      <div className="space-y-2">
        <label htmlFor="username" className="block text-sm font-semibold text-[var(--foreground)]">Username <span className="font-normal text-[var(--muted)]">(optional)</span></label>
        <input id="username" name="username" type="text" autoComplete="username" maxLength={30}
          className="h-14 w-full rounded-[8px] border border-[var(--border)] bg-[var(--background)] px-4 text-base text-[var(--foreground)] outline-none transition-colors placeholder:text-[var(--muted)] focus:border-[var(--accent-strong)] focus:ring-1 focus:ring-[var(--accent-strong)]"
          placeholder="Choose a username" />
      </div>

      <div className="space-y-2">
        <label htmlFor="email" className="block text-sm font-semibold text-[var(--foreground)]">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required maxLength={254}
          className="h-14 w-full rounded-[8px] border border-[var(--border)] bg-[var(--background)] px-4 text-base text-[var(--foreground)] outline-none transition-colors placeholder:text-[var(--muted)] focus:border-[var(--accent-strong)] focus:ring-1 focus:ring-[var(--accent-strong)]"
          placeholder="you@example.com" />
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="block text-sm font-semibold text-[var(--foreground)]">Password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8}
          className="h-14 w-full rounded-[8px] border border-[var(--border)] bg-[var(--background)] px-4 text-base text-[var(--foreground)] outline-none transition-colors placeholder:text-[var(--muted)] focus:border-[var(--accent-strong)] focus:ring-1 focus:ring-[var(--accent-strong)]"
          placeholder="At least 8 characters" />
      </div>

      {state.error && <p role="alert" className="rounded-md border-l-2 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200">{state.error}</p>}
      {state.success && <p role="status" className="rounded-md border-l-2 border-emerald-600 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">{state.success}</p>}

      <button type="submit" disabled={pending}
        className="flex h-14 w-full items-center justify-center rounded-[9px] bg-[var(--accent)] px-5 text-lg font-bold text-[var(--foreground)] transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:cursor-wait disabled:opacity-60">
        {pending ? "Creating account..." : "Create account"}
      </button>

      <p className="pt-2 text-center text-sm text-[var(--muted)]">
        Already have an account?{" "}
        <Link href="/login-with-email" className="font-semibold text-[var(--accent-strong)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]">Log in</Link>
      </p>
    </form>
  );
}
