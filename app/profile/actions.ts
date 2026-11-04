"use server";

import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

export type ProfileState = {
  error: string;
  success: string;
};

export async function saveProfile(
  _previousState: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  void _previousState;

  const firstName = formData.get("first_name");
  const lastName = formData.get("last_name");
  const address = formData.get("address");
  const email = formData.get("email");

  if (
    typeof firstName !== "string" || !firstName.trim() ||
    typeof lastName !== "string" || !lastName.trim() ||
    typeof address !== "string" ||
    typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
  ) {
    return { error: "Enter your first and last name and a valid email address.", success: "" };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Please sign in again before saving your profile.", success: "" };
  }

  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        user_id: user.id,
        f_name: firstName.trim(),
        l_name: lastName.trim(),
        address: address.trim() || null,
        email: email.trim(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (error) {
    console.error("Profile save failed:", error.message);
    return { error: "Your profile could not be saved. Please try again.", success: "" };
  }

  return { error: "", success: "Profile saved." };
}
