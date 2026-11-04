import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import NavBar from "../components/NavBar";
import GoogleLoginForm from "../login/GoogleLoginForm";
import SignUpForm from "./SignUpForm";

export const metadata: Metadata = {
  title: "Sign Up | Humor Project",
};

export default async function SignUpPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect("/");
  }

  return (
    <>
      <NavBar />
      <main className="flex min-h-[calc(100svh-85px)] items-center justify-center bg-[var(--background)] px-5 py-12 text-[var(--foreground)] sm:min-h-[calc(100svh-104px)] sm:py-16">
        <section aria-labelledby="signup-title" className="w-full max-w-[460px] rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_16px_50px_rgba(37,41,35,0.07)] sm:p-10">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent-strong)]">
            <span aria-hidden="true" className="text-lg">✳</span> Seriously unserious
          </p>
          <h1 id="signup-title" className="mt-3 text-3xl font-extrabold tracking-tight text-[var(--foreground)] sm:text-4xl">Create your account</h1>
          <p className="mt-3 text-base leading-relaxed text-[var(--muted)]">Join the conversation.</p>
          <GoogleLoginForm label="Sign up with Google" />
          <div className="my-6 flex items-center gap-4 text-xs font-medium uppercase tracking-[0.15em] text-[var(--muted)]">
            <span className="h-px flex-1 bg-[var(--border)]" />
            or sign up with email
            <span className="h-px flex-1 bg-[var(--border)]" />
          </div>
          <SignUpForm />
        </section>
      </main>
    </>
  );
}
