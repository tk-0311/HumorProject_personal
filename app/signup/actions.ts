"use server";

import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signupEmailError } from '@/lib/auth/signup-policy';

export type SignUpState = {
  error: string;
  success: string;
};

export async function signUp(
  _previousState: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  void _previousState;

  const name = formData.get("name");
  const username = formData.get("username");
  const email = formData.get("email");
  const password = formData.get("password");

  if (
    typeof name !== "string" || !name.trim() ||
    typeof email !== "string" || !email.trim() ||
    typeof password !== "string" || password.length < 8
  ) {
    return { error: "Enter your name, a valid email, and a password with at least 8 characters.", success: "" };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const emailError = await signupEmailError(supabase, email.trim());
  if (emailError) return { error: emailError, success: '' };
  const siteUrl = process.env.NODE_ENV === "development"
    ? "http://localhost:3000"
    : process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: {
        full_name: name.trim(),
        username: typeof username === "string" && username.trim() ? username.trim() : null,
      },
      emailRedirectTo: new URL("/auth/callback", siteUrl).toString(),
    },
  });

  if (error) {
    return { error: "We couldn't create your account. Check your details and try again.", success: "" };
  }

  if (data.session) {
    redirect("/");
  }

  return {
    error: "",
    success: "Check your email for a confirmation link to finish creating your account.",
  };
}
