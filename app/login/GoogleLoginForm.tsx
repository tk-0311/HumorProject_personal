"use client";

import { useActionState } from "react";
import { signInWithGoogle, type LoginState } from "./actions";

const initialState: LoginState = { error: "" };

export default function GoogleLoginForm({ label = "Continue with Google" }: { label?: string }) {
  const [state, formAction, pending] = useActionState(signInWithGoogle, initialState);

  return (
    <form action={formAction} className="mt-8">
      {state.error && (
        <p role="alert" className="mb-4 rounded-md border-l-2 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="flex h-14 w-full items-center justify-center gap-3 rounded-[9px] border border-[var(--border)] bg-white px-5 text-base font-semibold text-[#252923] transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:cursor-wait disabled:opacity-60"
      >
        <svg aria-hidden="true" viewBox="0 0 48 48" className="h-5 w-5">
          <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.7c3.9-3.6 6-8.8 6-15Z" />
          <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.7-5.1c-1.8 1.2-4 2-6.8 2-5.2 0-9.6-3.5-11.2-8.2H5.9v5.2A20 20 0 0 0 24 44Z" />
          <path fill="#FBBC05" d="M12.8 27.9a12 12 0 0 1 0-7.8v-5.2H5.9a20 20 0 0 0 0 18.2l6.9-5.2Z" />
          <path fill="#EA4335" d="M24 11.9c3 0 5.7 1 7.8 3.1l5.8-5.8C34.1 5.9 29.5 4 24 4A20 20 0 0 0 5.9 14.9l6.9 5.2c1.6-4.7 6-8.2 11.2-8.2Z" />
        </svg>
        {pending ? "Connecting to Google..." : label}
      </button>
    </form>
  );
}
