begin;
create table public.caption_drafts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 image_path text not null check(char_length(image_path) between 1 and 200),
 prompt text not null check(char_length(prompt) between 1 and 3000),
 model text not null check(char_length(model) between 1 and 100),
 style text not null check(style in ('dry','absurd','wholesome')),
 captions text[] not null check (
   array_ndims(captions)=1 and array_lower(captions,1)=1 and cardinality(captions)=3 and
   captions[1] is not null and captions[2] is not null and captions[3] is not null and
   char_length(btrim(captions[1])) between 1 and 280 and
   char_length(btrim(captions[2])) between 1 and 280 and
   char_length(btrim(captions[3])) between 1 and 280 and
   lower(btrim(captions[1]))<>lower(btrim(captions[2])) and
   lower(btrim(captions[2]))<>lower(btrim(captions[3])) and
   lower(btrim(captions[1]))<>lower(btrim(captions[3]))
 ),
 published_generation_id uuid references public.ai_generations(id) on delete set null,
 selected_index smallint check(selected_index between 0 and 2),
 created_at timestamptz not null default now()
);
create index caption_drafts_user_created_idx on public.caption_drafts(user_id,created_at desc);
create index caption_drafts_image_path_idx on public.caption_drafts(image_path);
create index caption_drafts_published_idx on public.caption_drafts(published_generation_id) where published_generation_id is not null;
alter table public.caption_drafts enable row level security;
revoke all on public.caption_drafts from anon,authenticated;
grant select on public.caption_drafts to authenticated;
grant insert(user_id,image_path,prompt,model,style,captions) on public.caption_drafts to authenticated;
create policy caption_drafts_read_self on public.caption_drafts for select to authenticated using((select auth.uid())=user_id);
create policy caption_drafts_insert_self on public.caption_drafts for insert to authenticated with check(
 (select auth.uid())=user_id and (storage.foldername(image_path))[1]=(select auth.uid())::text and
 array_length(storage.foldername(image_path),1)=1 and storage.extension(image_path) in ('jpg','png','webp')
);
-- A single atomic operation publishes an immutable stored option, once per draft.
create function public.publish_caption_choice(draft_id uuid, choice_index integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); draft public.caption_drafts%rowtype; published uuid;
begin
 if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if choice_index is null or choice_index<0 or choice_index>2 then raise exception 'Invalid caption selection' using errcode='22023'; end if;
 select * into draft from public.caption_drafts where id=draft_id and user_id=caller for update;
 if not found then raise exception 'Draft unavailable' using errcode='42501'; end if;
 if draft.published_generation_id is not null then return draft.published_generation_id; end if;
 if (storage.foldername(draft.image_path))[1]<>caller::text then raise exception 'Invalid image owner' using errcode='42501'; end if;
 insert into public.ai_generations(user_id,situation,prompt,caption,style,model,image_path)
 values(caller,'A photo shared for a caption.',draft.prompt,draft.captions[choice_index+1],draft.style,draft.model,draft.image_path)
 returning id into published;
 update public.caption_drafts set published_generation_id=published,selected_index=choice_index where id=draft.id;
 return published;
end $$;
revoke all on function public.publish_caption_choice(uuid,integer) from public,anon;
grant execute on function public.publish_caption_choice(uuid,integer) to authenticated;
-- Pending drafts also retain their photos; only failed, unreferenced uploads are removable.
drop policy caption_images_owner_cleanup on storage.objects;
create policy caption_images_owner_cleanup on storage.objects for delete to authenticated using (
 bucket_id='caption-images' and (storage.foldername(name))[1]=(select auth.uid())::text and
 not exists(select 1 from public.ai_generations g where g.image_path=storage.objects.name) and
 not exists(select 1 from public.caption_drafts d where d.image_path=storage.objects.name)
);
commit;
