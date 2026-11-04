"use client";

import { useActionState } from "react";
import { saveProfile, type ProfileState } from "./actions";

const initialState: ProfileState = { error: "", success: "" };

type ProfileFormProps = {
  firstName: string;
  lastName: string;
  email: string;
  address: string;
};

const inputClassName = "h-14 w-full rounded-[8px] border border-[var(--border)] bg-[var(--background)] px-4 text-base text-[var(--foreground)] outline-none transition-colors focus:border-[var(--accent-strong)] focus:ring-1 focus:ring-[var(--accent-strong)]";
const labelClassName = "mb-2 block text-sm font-semibold text-[var(--foreground)]";

export default function ProfileForm({ firstName, lastName, email, address }: ProfileFormProps) {
  const [state, formAction, pending] = useActionState(saveProfile, initialState);

  return (
    <form action={formAction} className="mt-10 space-y-8">
      <div className="grid gap-8 sm:grid-cols-2">
        <div>
          <label htmlFor="first_name" className={labelClassName}>First Name</label>
          <input id="first_name" name="first_name" type="text" autoComplete="given-name" required maxLength={100}
            defaultValue={firstName} className={inputClassName} />
        </div>
        <div>
          <label htmlFor="last_name" className={labelClassName}>Last Name</label>
          <input id="last_name" name="last_name" type="text" autoComplete="family-name" required maxLength={100}
            defaultValue={lastName} className={inputClassName} />
        </div>
      </div>

      <div>
        <label htmlFor="email" className={labelClassName}>Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required maxLength={254}
          defaultValue={email} aria-describedby="email-help"
          className={inputClassName} />
        <p id="email-help" className="mt-2 text-sm text-[var(--muted)]">
          This updates your profile contact email, not your sign-in email.
        </p>
      </div>

      <div>
        <label htmlFor="address" className={labelClassName}>Address</label>
        <input id="address" name="address" type="text" autoComplete="street-address" maxLength={250}
          defaultValue={address} className={inputClassName} placeholder="Enter your address" />
      </div>

      {state.error &&       <p role="alert" className="rounded-md border-l-2 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200">{state.error}</p>}
      {state.success &&       <p role="status" className="rounded-md border-l-2 border-emerald-600 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">{state.success}</p>}

      <button type="submit" disabled={pending}
        className="flex h-14 w-full items-center justify-center rounded-[9px] bg-[var(--accent)] px-5 text-base font-bold text-[var(--foreground)] transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:cursor-wait disabled:opacity-60">
        {pending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
