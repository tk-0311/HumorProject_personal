create or replace function private.admin_image_reference_count(p_bucket text, p_name text)
returns bigint language plpgsql stable security definer set search_path = '' as $$
declare suffix text := '/' || p_bucket || '/' || p_name;
        encoded_suffix text := '/' || replace(p_bucket || '/' || p_name, ' ', '%20');
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  return
    (select count(*) from public.ai_generations where p_bucket = 'caption-images' and image_path = p_name)
    + (select count(*) from public.caption_drafts where p_bucket = 'caption-images' and image_path = p_name)
    + (select count(*) from public.profiles where profile_image = p_name
       or right(split_part(profile_image, '?', 1), char_length(suffix)) = suffix
       or right(split_part(profile_image, '?', 1), char_length(encoded_suffix)) = encoded_suffix)
    + (select count(*) from public.posts where image_src = p_name
       or right(split_part(image_src, '?', 1), char_length(suffix)) = suffix
       or right(split_part(image_src, '?', 1), char_length(encoded_suffix)) = encoded_suffix);
end;
$$;
