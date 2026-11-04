begin;

update public.ai_caption_prompt_chains
set execution_mode = 'sequential'
where execution_mode <> 'sequential';

alter table public.ai_caption_prompt_chains
  alter column execution_mode set default 'sequential';

alter table public.ai_caption_prompt_chains
  drop constraint if exists ai_caption_prompt_chains_execution_mode_check;

alter table public.ai_caption_prompt_chains
  add constraint ai_caption_prompt_chains_execution_mode_check
  check (execution_mode = 'sequential');

create or replace function public.admin_save_caption_prompt_chain(
  p_surface text,
  p_execution_mode text,
  p_steps jsonb
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
  if p_surface is null or p_surface not in ('humor_project', 'admin_panel')
    or p_execution_mode is distinct from 'sequential'
  then
    raise exception 'Caption chains must use sequential execution.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_steps) is distinct from 'array' then
    raise exception 'Prompt steps must be a JSON array.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_steps) not between 1 and 5 then
    raise exception 'Prompt chains must contain between 1 and 5 steps.' using errcode = '22023';
  end if;

  for step_value in select value from jsonb_array_elements(p_steps) as steps(value) loop
    if jsonb_typeof(step_value) is distinct from 'object'
      or jsonb_typeof(step_value -> 'title') is distinct from 'string'
      or jsonb_typeof(step_value -> 'prompt') is distinct from 'string'
      or jsonb_typeof(step_value -> 'enabled') is distinct from 'boolean'
      or char_length(btrim(step_value ->> 'title')) not between 1 and 80
      or char_length(btrim(step_value ->> 'prompt')) not between 1 and 3000
    then
      raise exception 'Each prompt step needs a title and prompt; titles are limited to 80 characters and prompts to 3000.' using errcode = '22023';
    end if;
    if (step_value ->> 'enabled')::boolean then
      active_steps := active_steps + 1;
    end if;
  end loop;
  if active_steps = 0 then
    raise exception 'Enable at least one prompt step.' using errcode = '22023';
  end if;

  insert into public.ai_caption_prompt_chains (surface, execution_mode, updated_by, updated_at)
  values (p_surface, 'sequential', caller, now())
  on conflict (surface) do update
    set execution_mode = excluded.execution_mode,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
  returning id into saved_chain_id;

  delete from public.ai_caption_prompt_chain_steps where chain_id = saved_chain_id;
  for step_value in select value from jsonb_array_elements(p_steps) as steps(value) loop
    insert into public.ai_caption_prompt_chain_steps (chain_id, position, title, prompt, enabled)
    values (
      saved_chain_id,
      step_index,
      btrim(step_value ->> 'title'),
      btrim(step_value ->> 'prompt'),
      (step_value ->> 'enabled')::boolean
    );
    step_index := step_index + 1;
  end loop;

  return jsonb_build_object('surface', p_surface, 'executionMode', 'sequential', 'stepCount', step_index);
end;
$$;

commit;
