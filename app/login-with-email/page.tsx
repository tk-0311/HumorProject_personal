import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import NavBar from "../components/NavBar";
import LoginForm from "../login/LoginForm";

export const metadata: Metadata = {
  title: "Login with Email | Humor Project",
};

export default async function LoginWithEmailPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect("/");
  }

  return (
    <>
      <NavBar />
      <main className="flex min-h-[calc(100svh-85px)] items-center justify-center bg-[var(--background)] px-4 py-8 text-[var(--foreground)] sm:min-h-[calc(100svh-104px)] sm:px-8 sm:py-12">
        <section aria-labelledby="email-login-title" className="w-full max-w-[560px] rounded-[18px] border border-[var(--border)] bg-[var(--surface)] px-6 py-8 shadow-[0_16px_50px_rgba(37,41,35,0.07)] sm:px-10 sm:py-10">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent-strong)]">
            <span aria-hidden="true" className="text-lg">✳</span> Seriously unserious
          </p>
          <h1 id="email-login-title" className="mt-3 text-3xl font-extrabold tracking-tight leading-tight sm:text-4xl">
            Login with Email
          </h1>
          <LoginForm />
        </section>
      </main>
    </>
  );
}
