begin;

alter table public.ai_caption_prompt_chain_steps
  add column model_id uuid references public.ai_models(id) on delete restrict,
  add column include_image boolean not null default true;

-- Preserve the actual model currently used by each surface, including inactive links.
update public.ai_caption_prompt_chain_steps step
set model_id = defaults.model_id
from public.ai_caption_prompt_chains chain
join public.ai_model_defaults defaults on defaults.surface = chain.surface
where step.chain_id = chain.id;

alter table public.ai_caption_prompt_chain_steps alter column model_id set not null;
create index ai_caption_prompt_chain_steps_model_id_idx
  on public.ai_caption_prompt_chain_steps(model_id);

create or replace function public.admin_list_caption_prompt_chains()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'surface', chain.surface,
      'executionMode', chain.execution_mode,
      'steps', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', step.id,
          'title', step.title,
          'prompt', step.prompt,
          'enabled', step.enabled,
          'position', step.position,
          'modelId', step.model_id,
          'includeImage', step.include_image
        ) order by step.position)
        from public.ai_caption_prompt_chain_steps step
        where step.chain_id = chain.id
      ), '[]'::jsonb)
    ) order by chain.surface)
    from public.ai_caption_prompt_chains chain
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_humor_project_caption_prompt_chain()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'executionMode', chain.execution_mode,
      'steps', coalesce((
        select jsonb_agg(jsonb_build_object('title', step.title, 'prompt', step.prompt, 'modelId', step.model_id, 'includeImage', step.include_image) order by step.position)
        from public.ai_caption_prompt_chain_steps step
        where step.chain_id = chain.id and step.enabled
      ), '[]'::jsonb)
    )
    from public.ai_caption_prompt_chains chain
    where chain.surface = 'humor_project'
  );
end;
$$;

create or replace function public.get_admin_panel_caption_prompt_chain()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'executionMode', chain.execution_mode,
      'steps', coalesce((
        select jsonb_agg(jsonb_build_object('title', step.title, 'prompt', step.prompt, 'modelId', step.model_id, 'includeImage', step.include_image) order by step.position)
        from public.ai_caption_prompt_chain_steps step
        where step.chain_id = chain.id and step.enabled
      ), '[]'::jsonb)
    )
    from public.ai_caption_prompt_chains chain
    where chain.surface = 'admin_panel'
  );
end;
$$;

create or replace function public.admin_save_caption_prompt_chain(
  p_surface text, p_execution_mode text, p_steps jsonb
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := (select auth.uid());
  saved_chain_id uuid;
  step_value jsonb;
  step_index integer := 0;
  active_steps integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_surface is null or p_surface not in ('humor_project','admin_panel')
    or p_execution_mode is distinct from 'sequential' then
    raise exception 'Invalid caption chain configuration' using errcode = '22023';
  end if;
  if jsonb_typeof(p_steps) is distinct from 'array' then
    raise exception 'Prompt steps must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_steps) not between 1 and 5 then
    raise exception 'Use between one and five prompt links' using errcode = '22023';
  end if;

  for step_value in select value from jsonb_array_elements(p_steps) as steps(value) loop
    if jsonb_typeof(step_value) is distinct from 'object'
      or jsonb_typeof(step_value -> 'title') is distinct from 'string'
      or jsonb_typeof(step_value -> 'prompt') is distinct from 'string'
      or jsonb_typeof(step_value -> 'enabled') is distinct from 'boolean'
      or jsonb_typeof(step_value -> 'modelId') is distinct from 'string'
      or jsonb_typeof(step_value -> 'includeImage') is distinct from 'boolean'
      or char_length(btrim(step_value ->> 'title')) not between 1 and 80
      or char_length(btrim(step_value ->> 'prompt')) not between 1 and 3000
      or (step_value ->> 'modelId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then
      raise exception 'Each link requires a title, prompt, registered model, enabled flag and photo setting' using errcode = '22023';
    end if;
    -- Keep model deletion from racing with validation and chain replacement.
    perform 1 from public.ai_models
    where id = (step_value ->> 'modelId')::uuid for key share;
    if not found then
      raise exception 'A link references an unavailable model' using errcode = '22023';
    end if;
    if (step_value ->> 'enabled')::boolean then
      if active_steps = 0 and not (step_value ->> 'includeImage')::boolean then
        raise exception 'The first active link must receive the photo' using errcode = '22023';
      end if;
      active_steps := active_steps + 1;
    end if;
  end loop;
  if active_steps = 0 then
    raise exception 'Enable at least one prompt link' using errcode = '22023';
  end if;

  insert into public.ai_caption_prompt_chains(surface,execution_mode,updated_by,updated_at)
  values(p_surface,'sequential',caller,now())
  on conflict(surface) do update set execution_mode=excluded.execution_mode,
    updated_by=excluded.updated_by,updated_at=excluded.updated_at
  returning id into saved_chain_id;

  delete from public.ai_caption_prompt_chain_steps where chain_id=saved_chain_id;
  for step_value in select value from jsonb_array_elements(p_steps) as steps(value) loop
    insert into public.ai_caption_prompt_chain_steps(chain_id,position,title,prompt,enabled,model_id,include_image)
    values(saved_chain_id,step_index,btrim(step_value ->> 'title'),btrim(step_value ->> 'prompt'),
      (step_value ->> 'enabled')::boolean,(step_value ->> 'modelId')::uuid,(step_value ->> 'includeImage')::boolean);
    step_index := step_index+1;
  end loop;
  return jsonb_build_object('surface',p_surface,'executionMode','sequential','stepCount',step_index);
end;
$$;

revoke all on function public.admin_list_caption_prompt_chains(),
  public.get_humor_project_caption_prompt_chain(), public.get_admin_panel_caption_prompt_chain(),
  public.admin_save_caption_prompt_chain(text,text,jsonb) from public,anon;
grant execute on function public.admin_list_caption_prompt_chains(),
  public.get_humor_project_caption_prompt_chain(), public.get_admin_panel_caption_prompt_chain(),
  public.admin_save_caption_prompt_chain(text,text,jsonb) to authenticated;

commit;
