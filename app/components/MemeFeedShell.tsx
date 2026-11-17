import type { ReactNode } from 'react';

export default function MemeFeedShell({ children }: { children: ReactNode }) {
  return <main className="mx-auto w-full max-w-7xl px-5 pt-10 pb-28 text-[var(--foreground)] sm:px-8 sm:pt-12">{children}</main>;
}
