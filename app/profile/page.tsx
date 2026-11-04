import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import NavBar from "../components/NavBar";
import ProfileForm from "./ProfileForm";
import ProfilePhotoForm from "./ProfilePhotoForm";

export const metadata: Metadata = {
  title: "Your Profile | Humor Project",
};

export default async function ProfilePage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  const { data: profileData, error: profileError } = await supabase.rpc("get_my_profile_details");

  if (profileError) {
    console.error("Profile load failed:", profileError.message);
  }

  const { data: photoProfile, error: photoError } = await supabase
    .from("profiles")
    .select("profile_image")
    .eq("user_id", user.id)
    .maybeSingle();

  if (photoError) {
    console.error("Profile photo load failed:", photoError.message);
  }

  const profile = profileData as {
    f_name?: string | null;
    l_name?: string | null;
    address?: string | null;
    email?: string | null;
  } | null;

  const metadata = user.user_metadata ?? {};
  const fullName = typeof metadata.full_name === "string"
    ? metadata.full_name
    : typeof metadata.name === "string"
      ? metadata.name
      : "";
  const nameParts = fullName.trim().split(/\s+/).filter(Boolean);

  return (
    <>
      <NavBar />
      <main className="min-h-[calc(100svh-85px)] bg-[var(--background)] px-5 py-10 text-[var(--foreground)] sm:min-h-[calc(100svh-104px)] sm:px-8 sm:py-12">
        <section aria-labelledby="profile-heading" className="mx-auto w-full max-w-[860px] rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_16px_50px_rgba(37,41,35,0.07)] sm:p-10">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent-strong)]">
            <span aria-hidden="true" className="text-lg">✳</span> Your corner of the internet
          </p>
          <h1 id="profile-heading" className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Your Profile</h1>
          <ProfilePhotoForm
            currentPhoto={photoProfile?.profile_image ?? null}
            displayName={`${profile?.f_name ?? ""} ${profile?.l_name ?? ""}`.trim() || nameParts.join(" ") || "Your profile"}
          />
          <ProfileForm
            firstName={profile?.f_name ?? nameParts[0] ?? ""}
            lastName={profile?.l_name ?? nameParts.slice(1).join(" ")}
            email={profile?.email ?? user.email ?? ""}
            address={profile?.address ?? ""}
          />
        </section>
      </main>
    </>
  );
}
