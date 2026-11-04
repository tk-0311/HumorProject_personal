"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signIn, type LoginState } from "./actions";

const initialState: LoginState = { error: "" };

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="mt-10 space-y-8">
      <div className="space-y-3">
        <label htmlFor="email" className="block text-base font-semibold text-[var(--foreground)]">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="h-14 w-full rounded-[8px] border border-[var(--border)] bg-[var(--background)] px-4 text-base text-[var(--foreground)] outline-none transition-colors placeholder:text-[var(--muted)] focus:border-[var(--accent-strong)] focus:ring-1 focus:ring-[var(--accent-strong)]"
          placeholder="you@example.com"
        />
      </div>

      <div className="space-y-3">
        <label htmlFor="password" className="block text-base font-semibold text-[var(--foreground)]">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            className="h-14 w-full rounded-[8px] border border-[var(--border)] bg-[var(--background)] px-4 pr-14 text-base text-[var(--foreground)] outline-none transition-colors placeholder:text-[var(--muted)] focus:border-[var(--accent-strong)] focus:ring-1 focus:ring-[var(--accent-strong)]"
            placeholder="Your password"
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-3 flex w-10 items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">
              {showPassword ? (
                <>
                  <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                  <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5 0 8.3 4.2 9 7-.3 1.2-1.2 2.6-2.5 3.8M6.2 6.2C3.8 7.7 2.4 9.9 2 12c.7 2.8 4 7 10 7 1 0 1.9-.1 2.8-.4" />
                </>
              ) : (
                <>
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </>
              )}
            </svg>
          </button>
        </div>
        <Link href="/forgot-password" className="inline-flex text-sm font-semibold text-[var(--accent-strong)] underline underline-offset-4 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]">
          Forgot Password?
        </Link>
      </div>

      {state.error && (
        <p role="alert" className="rounded-md border-l-2 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="flex h-14 w-full items-center justify-center rounded-[9px] bg-[var(--accent)] px-5 text-base font-bold text-[var(--foreground)] transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "Signing in..." : "Login"}
      </button>

      <p className="pt-3 text-center text-sm text-[var(--muted)]">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-semibold text-[var(--accent-strong)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)]">
          Sign up
        </Link>
      </p>
    </form>
  );
}
