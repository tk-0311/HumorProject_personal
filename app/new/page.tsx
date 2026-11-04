import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import NavBar from '@/app/components/NavBar';
import GenerationForm from './GenerationForm';
export default async function NewCaptionPage() {
  const supabase = createClient(await cookies());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return <><NavBar/><main className="mx-auto w-full max-w-2xl px-5 py-10"><p className="text-sm font-bold uppercase tracking-widest text-[var(--accent-strong)]">Campus chaos meets AI</p><h1 className="my-3 text-4xl font-extrabold tracking-tight">Make the moment funny.</h1><p className="mb-7 text-[var(--muted)]">Upload a photo. Let AI write three captions. Pick your favorite and share it for the community to rate.</p><GenerationForm/></main></>;
}
