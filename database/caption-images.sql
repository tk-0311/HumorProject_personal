begin;
alter table public.ai_generations add column image_path text;
alter table public.ai_generations add constraint ai_generations_image_path_length check(image_path is null or char_length(image_path) <= 200);
alter table public.ai_generations drop constraint ai_generations_situation_check;
alter table public.ai_generations add constraint ai_generations_situation_check check (
 char_length(btrim(situation)) between 1 and 500 and (char_length(btrim(situation)) >= 10 or image_path is not null)
);
grant select(image_path) on public.ai_generations to anon, authenticated;
grant insert(image_path) on public.ai_generations to authenticated;
drop policy ai_generations_insert_self on public.ai_generations;
create policy ai_generations_insert_self on public.ai_generations for insert to authenticated with check (
 (select auth.uid())=user_id and (image_path is null or (
   (storage.foldername(image_path))[1]=(select auth.uid())::text and
   array_length(storage.foldername(image_path),1)=1 and
   storage.extension(image_path) in ('jpg','png','webp')
 ))
);
create index ai_generations_image_path_idx on public.ai_generations(image_path) where image_path is not null;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('caption-images','caption-images',false,3145728,array['image/jpeg','image/png','image/webp']);
-- Owners can inspect unpublished uploads; readers can only see images attached to a caption.
create policy caption_images_read_published on storage.objects for select to anon,authenticated using (
 bucket_id='caption-images' and exists(select 1 from public.ai_generations g where g.image_path=storage.objects.name)
);
create policy caption_images_owner_read on storage.objects for select to authenticated using (
 bucket_id='caption-images' and (storage.foldername(name))[1]=(select auth.uid())::text
);
create policy caption_images_owner_insert on storage.objects for insert to authenticated with check (
 bucket_id='caption-images' and (storage.foldername(name))[1]=(select auth.uid())::text and
 array_length(storage.foldername(name),1)=1 and storage.extension(name) in ('jpg','png','webp')
);
-- No update permission: generated random names never overwrite another upload.
-- Only unreferenced uploads can be cleaned up after a failed caption insert.
create policy caption_images_owner_cleanup on storage.objects for delete to authenticated using (
 bucket_id='caption-images' and (storage.foldername(name))[1]=(select auth.uid())::text and
 not exists(select 1 from public.ai_generations g where g.image_path=storage.objects.name)
);
commit;
