-- Run as the project database owner after the two admin image-library migrations.
-- Read-only checks on live Storage metadata. No image bytes or records are changed.
begin;
select set_config('image_test.admin', (select user_id::text from public.profiles where role = 'admin' limit 1), true);
select set_config('image_test.user', (select user_id::text from public.profiles where role = 'user' limit 1), true);
do $$ begin
  if nullif(current_setting('image_test.admin'), '') is null or nullif(current_setting('image_test.user'), '') is null then
    raise exception 'These checks require an existing admin and ordinary user.';
  end if;
  if (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname in ('admin_images_preserve_location','admin_images_protect_references') and permissive = 'RESTRICTIVE') <> 2 then
    raise exception 'Storage protections must also cover existing permissive owner policies.';
  end if;
  if has_function_privilege('anon', 'public.admin_get_storage_image(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.admin_get_image_linked_records(uuid,integer)', 'EXECUTE') then
    raise exception 'Anonymous image catalog access must be denied.';
  end if;
end; $$;

select set_config('request.jwt.claims', jsonb_build_object('sub',current_setting('image_test.admin'),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare page jsonb; image jsonb; links jsonb; bucket text; expected bigint; begin
  foreach bucket in array array['caption-images','profile-photos','profile pictures'] loop
    page := public.admin_list_storage_images(bucket, '', 0);
    select count(*) into expected from storage.objects o where bucket_id = bucket
      and (metadata->>'mimetype' like 'image/%' or storage.extension(name) in ('jpg','jpeg','png','webp','gif'));
    if (page->>'total')::bigint <> expected or jsonb_array_length(page->'images') > 24 then
      raise exception 'Admin image pagination or cross-owner read failed.';
    end if;
    for image in select value from jsonb_array_elements(page->'images') loop
      if public.admin_get_storage_image((image->>'id')::uuid) <> image then
        raise exception 'Detail and list must use the same object identity.';
      end if;
      if not private.admin_storage_location_unchanged((image->>'id')::uuid, bucket, image->>'name')
        or private.admin_storage_location_unchanged((image->>'id')::uuid, bucket, 'renamed-file.png')
        or private.admin_storage_location_unchanged((image->>'id')::uuid, 'unmanaged-bucket', image->>'name') then
        raise exception 'Replacement must preserve bucket and path.';
      end if;
      if (image->>'references')::bigint <> private.admin_image_reference_count(bucket,image->>'name') then
        raise exception 'Image reference protection disagrees with the catalog.';
      end if;
      links := public.admin_get_image_linked_records((image->>'id')::uuid, 0);
      if (links->>'total')::bigint <> (image->>'references')::bigint or jsonb_array_length(links->'records') > 20 then
        raise exception 'Linked records must match the deletion guard and use bounded pages.';
      end if;
      if exists(select 1 from jsonb_array_elements(links->'records') record
        where record->>'kind' not in ('caption','draft','profile','post') or record ? 'prompt' or record ? 'email') then
        raise exception 'Unexpected linked-record fields.';
      end if;
      if jsonb_array_length(public.admin_get_image_linked_records((image->>'id')::uuid, 1000000)->'records') <> 0 then
        raise exception 'An out-of-results page must be empty.';
      end if;
    end loop;
  end loop;
  if public.admin_get_storage_image(gen_random_uuid()) is not null then raise exception 'Missing image must be null.'; end if;
  if public.admin_get_image_linked_records(gen_random_uuid()) is not null then raise exception 'Missing image links must be null.'; end if;
  begin perform public.admin_get_image_linked_records(gen_random_uuid(), -1); raise exception 'Negative reference offset was accepted.';
  exception when invalid_parameter_value then null; end;
  if (public.admin_list_storage_images('caption-images','__admin_image_test_no_existing_path__',0)->>'total')::bigint <> 0 then
    raise exception 'Image search must filter storage paths.';
  end if;
  begin
    perform public.admin_list_storage_images('unmanaged-bucket','',0);
    raise exception 'Unmanaged bucket was accepted.';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.admin_list_storage_images('caption-images','',-1);
    raise exception 'Negative offset was accepted.';
  exception when invalid_parameter_value then null; end;
end; $$;
reset role;

select set_config('request.jwt.claims', jsonb_build_object('sub',current_setting('image_test.user'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
  begin perform public.admin_list_storage_images(); raise exception 'Ordinary user read the image catalog.';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_get_storage_image(gen_random_uuid()); raise exception 'Ordinary user read image details.';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_get_image_linked_records(gen_random_uuid()); raise exception 'Ordinary user read linked posts or drafts.';
  exception when insufficient_privilege then null; end;
  begin perform private.admin_image_reference_count('caption-images','private.png'); raise exception 'Ordinary user read private reference counts.';
  exception when insufficient_privilege then null; end;
  if private.admin_storage_location_unchanged(gen_random_uuid(),'caption-images','private.png') then
    raise exception 'Ordinary user passed the admin replacement guard.';
  end if;
end; $$;
reset role;

select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
do $$ begin
  begin perform public.admin_list_storage_images(); raise exception 'Anonymous caller read the image catalog.';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_get_image_linked_records(gen_random_uuid()); raise exception 'Anonymous caller read linked posts or drafts.';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;
select 'Admin image library, reference guards, ordinary-user and anonymous access checks passed.' as result;
rollback;
