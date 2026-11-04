"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { uploadUniqueImage } from "@/lib/storage/image-deduplication";
import SavedImagePicker from "@/app/components/SavedImagePicker";
import { getSavedImage, type SavedImage } from "@/lib/storage/saved-images";

type ProfilePhotoFormProps = {
  currentPhoto: string | null;
  displayName: string;
};

export default function ProfilePhotoForm({ currentPhoto, displayName }: ProfilePhotoFormProps) {
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [selectedImage, setSelectedImage] = useState<SavedImage | null>(null), [showSaved, setShowSaved] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    const formData = new FormData(event.currentTarget);
    const photo = formData.get("photo");
    const hasUpload = photo instanceof File && photo.size > 0;
    if (!hasUpload && !selectedImage) {
      setErrorMessage("Choose an image to upload.");
      return;
    }

    const extensions: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
    };
    const extension = hasUpload ? extensions[photo.type] : null;
    if (hasUpload && !extension) {
      setErrorMessage("Choose a JPEG, PNG, WebP, or GIF image.");
      return;
    }
    if (hasUpload && photo.size > 5 * 1024 * 1024) {
      setErrorMessage("The image must be 5 MB or smaller.");
      return;
    }

    setPending(true);
    const supabase = createClient();
    let objectPath: string | null = null;

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        setErrorMessage("Please sign in again before uploading a photo.");
        return;
      }

      let uploaded: { path: string; reused: boolean };
      if (selectedImage) {
        const saved = await getSavedImage(supabase, selectedImage.id);
        if (saved.bucket !== 'profile-photos') throw new Error('Choose a saved profile photo.');
        uploaded = { path: saved.name, reused: true };
      } else if (hasUpload) uploaded = await uploadUniqueImage(supabase, { bucket: "profile-photos", userId: user.id, bytes: new Uint8Array(await photo.arrayBuffer()), contentType: photo.type });
      else throw new Error('Choose a photo first.');
      objectPath = uploaded.path;

      const { data: publicUrl } = supabase.storage
        .from("profile-photos")
        .getPublicUrl(objectPath);

      const { data: savedProfile, error: profileError } = await supabase
        .from("profiles")
        .update({
          profile_image: publicUrl.publicUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id)
        .select("user_id")
        .maybeSingle();

      if (profileError || !savedProfile) {
        console.error("Profile photo URL save failed:", profileError?.message ?? "Profile row not found");
        // Keep the file: another profile save may already be reusing it.
        objectPath = null;
        setErrorMessage(
          profileError
            ? `The image uploaded but the profile could not be updated: ${profileError.message}`
            : "No profile row was found for your account. Sign out and back in, then try again.",
        );
        return;
      }

      setSuccessMessage(uploaded.reused ? "Profile photo updated using your existing saved image." : "Profile photo updated.");
      router.refresh();
    } catch (uploadError) {
      console.error("Profile photo upload failed:", uploadError);
      setErrorMessage("The photo could not be uploaded. Please check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleUpload} className="mt-8 flex flex-col gap-5 border-b border-[var(--border)] pb-8 sm:flex-row sm:items-center">
      <div className="flex items-center gap-4">
        {currentPhoto ? (
          // Profile images are stored in a public Supabase Storage bucket.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={currentPhoto} alt={`${displayName}'s profile`} className="h-24 w-24 rounded-full border border-[var(--border)] object-cover" />
        ) : (
          <span aria-hidden="true" className="flex h-24 w-24 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--accent)] text-3xl font-semibold text-[var(--foreground)]">
            {Array.from(displayName.trim())[0]?.toUpperCase() || "?"}
          </span>
        )}
        <div>
          <p className="text-lg font-semibold">Profile photo</p>
          <p className="mt-1 text-sm text-[var(--muted)]">JPEG, PNG, WebP, or GIF. Maximum 5 MB.</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 sm:items-end">
        <label htmlFor="profile-photo" className="sr-only">Choose profile photo</label>
        <input
          ref={input}
          id="profile-photo"
          name="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          required={!selectedImage}
          disabled={pending}
          onChange={() => setSelectedImage(null)}
          className="block w-full text-sm text-[var(--muted)] file:mr-4 file:rounded-[7px] file:border file:border-[var(--border)] file:bg-[var(--surface)] file:px-4 file:py-3 file:font-semibold file:text-[var(--foreground)] hover:file:bg-[var(--menu-hover)] sm:max-w-md"
        />
        <button type="button" disabled={pending} aria-expanded={showSaved} onClick={() => setShowSaved(value => !value)} className="min-h-11 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold">{showSaved ? 'Hide saved images' : 'Use an existing image'}</button>
        {showSaved && <SavedImagePicker bucket="profile-photos" selectedId={selectedImage?.id} disabled={pending} onSelect={image => { setSelectedImage(image); setShowSaved(false); if (input.current) input.current.value = ''; }} />}
        {selectedImage && <div><p className="text-sm text-[var(--muted)]">Saved photo selected. Save to use it as your profile photo.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={selectedImage.previewUrl} alt="Selected saved profile photo" className="h-24 w-24 rounded-lg object-contain" /></div>}
        <button
          type="submit"
          disabled={pending}
          className="flex min-h-12 items-center justify-center rounded-[9px] bg-[var(--accent)] px-6 font-semibold text-[var(--foreground)] transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-strong)] disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? "Uploading..." : "Upload photo"}
        </button>
      </div>

      {errorMessage && <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200 sm:basis-full">{errorMessage}</p>}
      {successMessage && <p role="status" className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200 sm:basis-full">{successMessage}</p>}
    </form>
  );
}
