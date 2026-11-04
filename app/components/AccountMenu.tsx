"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { signOut } from "./account-actions";

type Theme = "light" | "dark" | "system";

type AccountMenuProps = {
  name: string;
  email: string;
  isAdmin: boolean;
  adminUrl?: string;
};

const themeOptions: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

function getThemeSnapshot(): Theme {
  const storedTheme = window.localStorage.getItem("humor-project-theme");
  return storedTheme === "light" || storedTheme === "dark" || storedTheme === "system"
    ? storedTheme
    : "system";
}

function subscribeToTheme(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("humor-project-theme-change", listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener("humor-project-theme-change", listener);
  };
}

function PersonIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-9 w-9" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">
      <circle cx="12" cy="7.5" r="4" />
      <path d="M4.5 21v-2.2a5.3 5.3 0 0 1 5.3-5.3h4.4a5.3 5.3 0 0 1 5.3 5.3V21" />
    </svg>
  );
}

export default function AccountMenu({ name, email, isAdmin, adminUrl }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, () => "system");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        setOpen(false);
        setThemeMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setThemeMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function toggleMenu() {
    setOpen((isOpen) => !isOpen);
    setThemeMenuOpen(false);
  }

  function selectTheme(nextTheme: Theme) {
    window.localStorage.setItem("humor-project-theme", nextTheme);
    window.dispatchEvent(new Event("humor-project-theme-change"));
  }

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        aria-label="Account menu"
        aria-expanded={open}
        aria-controls="account-menu-panel"
        onClick={toggleMenu}
        className={`flex h-14 w-14 items-center justify-center transition-colors hover:bg-[var(--menu-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] ${open ? "bg-[var(--menu-hover)]" : ""}`}
      >
        <PersonIcon />
      </button>

      {open && (
        <section id="account-menu-panel" aria-label="Account options" className="absolute right-0 top-full z-50 mt-4 w-[min(360px,calc(100vw-2rem))] border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] shadow-2xl">
          <div className="border-b border-[var(--border)] px-5 py-4">
            <p className="truncate text-lg font-semibold leading-snug">{name}</p>
            <p className="truncate text-base text-[var(--muted)]">{email}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[var(--accent-strong)]">
              {isAdmin ? "Admin" : "Normal user"}
            </p>
          </div>

          <div className="p-2">
            {adminUrl && (
              <a
                href={adminUrl}
                onClick={() => setOpen(false)}
                className="flex min-h-14 items-center px-3 text-lg font-semibold transition-colors hover:bg-[var(--menu-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-strong)]"
              >
                Admin dashboard
              </a>
            )}
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              className="flex min-h-14 items-center px-3 text-lg transition-colors hover:bg-[var(--menu-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-strong)]"
            >
              Profile
            </Link>
            <Link
              href="/favorite"
              onClick={() => setOpen(false)}
              className="flex min-h-14 items-center px-3 text-lg transition-colors hover:bg-[var(--menu-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-strong)]"
            >
              Liked memes
            </Link>

            <button
              type="button"
              aria-expanded={themeMenuOpen}
              aria-controls="theme-options"
              onClick={() => setThemeMenuOpen((isOpen) => !isOpen)}
              className="flex min-h-14 w-full items-center justify-between px-3 text-left text-lg transition-colors hover:bg-[var(--menu-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-strong)]"
            >
              Theme
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={`h-6 w-6 transition-transform ${themeMenuOpen ? "rotate-90" : ""}`} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>

            {themeMenuOpen && (
              <div id="theme-options" aria-label="Choose theme" className="ml-3 border-l border-[var(--border)] pl-2">
                {themeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={theme === option.value}
                    onClick={() => selectTheme(option.value)}
                    className="flex min-h-11 w-full items-center justify-between px-3 text-base text-[var(--muted)] transition-colors hover:bg-[var(--menu-hover)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-strong)]"
                  >
                    {option.label}
                    {theme === option.value && <span aria-hidden="true" className="text-[var(--accent-strong)]">Selected</span>}
                  </button>
                ))}
              </div>
            )}

            <form action={signOut}>
              <button type="submit" className="flex min-h-14 w-full items-center px-3 text-left text-lg transition-colors hover:bg-[var(--menu-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-strong)]">
                Sign out
              </button>
            </form>
          </div>
        </section>
      )}
    </div>
  );
}
