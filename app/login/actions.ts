"use server";

import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type LoginState = {
  error: string;
};

export async function signInWithGoogle(
  _previousState: LoginState,
  _formData: FormData,
): Promise<LoginState> {
  void _previousState;
  void _formData;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const siteUrl =
    process.env.NODE_ENV === "development"
      ? "http://localhost:3000"
      : process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: new URL("/auth/callback", siteUrl).toString(),
    },
  });

  if (error || !data.url) {
    return { error: "Google sign-in is unavailable right now. Please try email instead." };
  }

  redirect(data.url);
}

export async function signIn(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
    return { error: "Enter your email and password." };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    return { error: "That email and password combination was not recognized." };
  }

  redirect("/");
}
