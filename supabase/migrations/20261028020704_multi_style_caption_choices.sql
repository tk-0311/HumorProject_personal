-- Applied to the shared project as 20261028020704_multi_style_caption_choices.
-- Nine options are stored in tab order: dry (0–2), wholesome (3–5), absurd (6–8).
-- Keep existing three-option drafts publishable during and after rollout.
create or replace function public.valid_caption_draft_options(options text[])
returns boolean
language sql immutable strict parallel safe
set search_path = ''
as $$
 select coalesce(
   array_ndims(options) = 1 and array_lower(options, 1) = 1
   and cardinality(options) in (3, 9)
   and bool_and(caption is not null and char_length(btrim(caption)) between 1 and 280)
   and count(distinct lower(btrim(caption))) = cardinality(options),
   false
 )
 from unnest(options) as item(caption)
$$;
revoke all on function public.valid_caption_draft_options(text[]) from public, anon;
grant execute on function public.valid_caption_draft_options(text[]) to authenticated, service_role;

alter table public.caption_drafts
 drop constraint caption_drafts_captions_check,
 drop constraint caption_drafts_style_check,
 drop constraint caption_drafts_selected_index_check,
 add constraint caption_drafts_captions_check check (public.valid_caption_draft_options(captions)),
 add constraint caption_drafts_style_check check (
   (style in ('dry', 'wholesome', 'absurd') and cardinality(captions) = 3)
   or (style = 'mixed' and cardinality(captions) = 9)
 ),
 add constraint caption_drafts_selected_index_check check (
   selected_index >= 0 and selected_index < cardinality(captions)
 );

create or replace function public.publish_caption_choice(draft_id uuid, choice_index integer)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
 caller uuid := auth.uid();
 draft public.caption_drafts%rowtype;
 published uuid;
 selected_style text;
begin
 if caller is null then
   raise exception 'Authentication required' using errcode = '42501';
 end if;
 if choice_index is null or choice_index < 0 or choice_index > 8 then
   raise exception 'Invalid caption selection' using errcode = '22023';
 end if;
 select * into draft from public.caption_drafts
 where id = draft_id and user_id = caller for update;
 if not found then
   raise exception 'Draft unavailable' using errcode = '42501';
 end if;
 if choice_index >= cardinality(draft.captions) then
   raise exception 'Invalid caption selection' using errcode = '22023';
 end if;
 if draft.published_generation_id is not null then return draft.published_generation_id; end if;
 if (storage.foldername(draft.image_path))[1] <> caller::text then
   raise exception 'Invalid image owner' using errcode = '42501';
 end if;
 selected_style := case when draft.style = 'mixed'
   then (array['dry', 'wholesome', 'absurd'])[choice_index / 3 + 1]
   else draft.style end;
 insert into public.ai_generations(user_id, situation, prompt, caption, style, model, image_path)
 values(caller, 'A photo shared for a caption.', draft.prompt, draft.captions[choice_index + 1], selected_style, draft.model, draft.image_path)
 returning id into published;
 update public.caption_drafts
 set published_generation_id = published, selected_index = choice_index
 where id = draft.id;
 return published;
end
$$;
revoke all on function public.publish_caption_choice(uuid, integer) from public, anon;
grant execute on function public.publish_caption_choice(uuid, integer) to authenticated;

