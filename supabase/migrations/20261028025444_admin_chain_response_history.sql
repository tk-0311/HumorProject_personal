-- Applied to the shared project as 20261028025444_admin_chain_response_history.
create table public.ai_caption_chain_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  surface text not null check (surface in ('humor_project', 'admin_panel')),
  status text not null check (status in ('completed', 'failed')),
  duration_ms integer not null check (duration_ms between 0 and 600000),
  step_count smallint not null check (step_count between 1 and 5),
  steps jsonb not null check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) = step_count and pg_column_size(steps) <= 300000),
  failure_phase text check (failure_phase in ('chain_configuration','credentials','provider_request','provider_response','output_validation','unknown')),
  created_at timestamptz not null default now(),
  check ((status = 'completed' and failure_phase is null) or (status = 'failed' and failure_phase is not null))
);
create index ai_caption_chain_runs_created_idx on public.ai_caption_chain_runs(created_at desc, id desc);
create index ai_caption_chain_runs_surface_created_idx on public.ai_caption_chain_runs(surface, created_at desc, id desc);
alter table public.ai_caption_chain_runs enable row level security;
revoke all on public.ai_caption_chain_runs from public, anon, authenticated;
grant select on public.ai_caption_chain_runs to authenticated;
create policy ai_caption_chain_runs_admin_read on public.ai_caption_chain_runs
for select to authenticated using ((select public.is_admin()));

-- Authenticated generation servers append their caller's run. Readers must be admins.
-- There is no user-ID parameter and no caller may update or remove another run.
create or replace function public.record_caption_chain_run(
  p_surface text, p_status text, p_duration_ms integer, p_steps jsonb, p_failure_phase text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  step jsonb;
  field text;
  step_index integer := 0;
  failed_steps integer := 0;
begin
  if caller is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_surface = 'admin_panel' and not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_surface is null or p_surface not in ('humor_project','admin_panel')
    or p_status is null or p_status not in ('completed','failed')
    or p_duration_ms is null or p_duration_ms not between 0 and 600000
    or jsonb_typeof(p_steps) is distinct from 'array'
  then raise exception 'Invalid chain response run' using errcode = '22023'; end if;
  if jsonb_array_length(p_steps) not between 1 and 5 or pg_column_size(p_steps) > 300000
    or (p_status = 'completed' and p_failure_phase is not null)
    or (p_status = 'failed' and (p_failure_phase is null or p_failure_phase not in ('chain_configuration','credentials','provider_request','provider_response','output_validation','unknown')))
  then raise exception 'Invalid chain response run' using errcode = '22023'; end if;

  for step in select value from jsonb_array_elements(p_steps) as entries(value) loop
    step_index := step_index + 1;
    if jsonb_typeof(step) is distinct from 'object'
      or not (step ?& array['index','position','title','model','modelName','provider','includeImage','status','response','durationMs'])
      or (step - array['index','position','title','model','modelName','provider','includeImage','status','response','durationMs']) <> '{}'::jsonb
      or jsonb_typeof(step->'index') is distinct from 'number' or step->>'index' <> step_index::text
      or jsonb_typeof(step->'position') is distinct from 'number' or step->>'position' !~ '^[1-5]$'
      or jsonb_typeof(step->'title') is distinct from 'string' or char_length(btrim(step->>'title')) not between 1 and 80
      or jsonb_typeof(step->'includeImage') is distinct from 'boolean'
      or jsonb_typeof(step->'status') is distinct from 'string' or step->>'status' not in ('not_run','completed','failed')
      or jsonb_typeof(step->'response') not in ('string','null')
      or char_length(step->>'response') > 12000
    then raise exception 'Invalid chain step response' using errcode = '22023'; end if;
    foreach field in array array['model','modelName','provider'] loop
      if jsonb_typeof(step->field) not in ('string','null')
        or (jsonb_typeof(step->field) = 'string' and char_length(step->>field) not between 1 and 100)
      then raise exception 'Invalid response model metadata' using errcode = '22023'; end if;
    end loop;
    if jsonb_typeof(step->'provider') = 'string' and step->>'provider' not in ('gemini','openai','grok','anthropic','openai_compatible') then
      raise exception 'Invalid response provider' using errcode = '22023';
    end if;
    if jsonb_typeof(step->'durationMs') is distinct from 'null' then
      if jsonb_typeof(step->'durationMs') is distinct from 'number' or step->>'durationMs' !~ '^(0|[1-9][0-9]{0,5})$' then
        raise exception 'Invalid response duration' using errcode = '22023';
      end if;
      if (step->>'durationMs')::integer > 120000 then raise exception 'Invalid response duration' using errcode = '22023'; end if;
    end if;
    if step->>'status' = 'completed' and (jsonb_typeof(step->'response') <> 'string' or jsonb_typeof(step->'durationMs') <> 'number') then
      raise exception 'Completed steps require a response and duration' using errcode = '22023';
    end if;
    if step->>'status' = 'not_run' and (step->'response' <> 'null'::jsonb or step->'durationMs' <> 'null'::jsonb) then
      raise exception 'Unexecuted steps cannot have responses' using errcode = '22023';
    end if;
    if step->>'status' = 'failed' then failed_steps := failed_steps + 1; end if;
    if p_status = 'completed' and step->>'status' <> 'completed' then
      raise exception 'Incomplete chain responses' using errcode = '22023';
    end if;
  end loop;
  if failed_steps > 1 then raise exception 'A sequential chain can fail at one step' using errcode = '22023'; end if;

  insert into public.ai_caption_chain_runs(user_id,surface,status,duration_ms,step_count,steps,failure_phase)
  values(caller,p_surface,p_status,p_duration_ms,step_index,p_steps,p_failure_phase);
end;
$$;
revoke all on function public.record_caption_chain_run(text,text,integer,jsonb,text) from public, anon;
grant execute on function public.record_caption_chain_run(text,text,integer,jsonb,text) to authenticated;

