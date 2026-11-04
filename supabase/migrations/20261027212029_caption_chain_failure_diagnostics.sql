begin;

-- Snapshot metadata survives prompt edits/deletion; legacy events remain unknown.
alter table public.app_telemetry_events add column chain_context jsonb
  check (chain_context is null or (jsonb_typeof(chain_context)='object' and pg_column_size(chain_context)<=2000));

create or replace function public.record_app_telemetry_v3(
  p_route text,
  p_method text,
  p_success boolean,
  p_duration_ms integer,
  p_http_status integer,
  p_error_category text default null,
  p_provider_status integer default null,
  p_model text default null,
  p_chain_context jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  field text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_route is null or char_length(p_route) not between 1 and 100
    or p_method is null or p_method not in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'SERVER_ACTION')
    or p_success is null
    or p_duration_ms is null or p_duration_ms not between 0 and 120000
    or p_http_status is null or p_http_status not between 100 and 599
    or (p_error_category is not null and char_length(p_error_category) > 80)
    or (p_provider_status is not null and p_provider_status not between 100 and 599)
    or (p_model is not null and char_length(p_model) > 100)
  then
    raise exception 'Invalid telemetry event' using errcode = '22023';
  end if;

  if p_chain_context is not null then
    if p_route <> 'caption.generate' or p_success
      or jsonb_typeof(p_chain_context) is distinct from 'object'
      or pg_column_size(p_chain_context) > 2000
      or (p_chain_context - array['surface','phase','stepId','stepIndex','stepCount','stepPosition','stepTitle','stepDurationMs','provider','includeImage']) <> '{}'::jsonb
      or jsonb_typeof(p_chain_context->'surface') is distinct from 'string'
      or p_chain_context->>'surface' not in ('admin_panel','humor_project')
      or jsonb_typeof(p_chain_context->'phase') is distinct from 'string'
      or p_chain_context->>'phase' not in ('input_validation','chain_configuration','credentials','provider_request','provider_response','output_validation','image_upload','draft_save')
    then raise exception 'Invalid chain diagnostic context' using errcode='22023'; end if;
    if p_chain_context->>'surface'='admin_panel' and not public.is_admin() then
      raise exception 'Admin access required for admin diagnostics' using errcode='42501';
    end if;
    foreach field in array array['stepIndex','stepCount','stepPosition'] loop
      if p_chain_context ? field and (jsonb_typeof(p_chain_context->field) is distinct from 'number' or p_chain_context->>field !~ '^[1-5]$') then
        raise exception 'Invalid chain link index' using errcode='22023';
      end if;
    end loop;
    if p_chain_context ? 'stepIndex' and (not (p_chain_context ? 'stepCount') or not (p_chain_context ? 'stepTitle')
      or (p_chain_context->>'stepIndex')::integer > (p_chain_context->>'stepCount')::integer) then
      raise exception 'Incomplete chain link diagnostic' using errcode='22023';
    end if;
    if p_chain_context ? 'stepTitle' and (jsonb_typeof(p_chain_context->'stepTitle') is distinct from 'string' or char_length(btrim(p_chain_context->>'stepTitle')) not between 1 and 80) then
      raise exception 'Invalid link title' using errcode='22023';
    end if;
    if p_chain_context ? 'stepId' and (jsonb_typeof(p_chain_context->'stepId') is distinct from 'string' or p_chain_context->>'stepId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
      raise exception 'Invalid historical link ID' using errcode='22023';
    end if;
    if p_chain_context ? 'provider' and (jsonb_typeof(p_chain_context->'provider') is distinct from 'string' or p_chain_context->>'provider' not in ('gemini','openai','grok','anthropic','openai_compatible')) then
      raise exception 'Invalid model provider' using errcode='22023';
    end if;
    if p_chain_context ? 'includeImage' and jsonb_typeof(p_chain_context->'includeImage') is distinct from 'boolean' then
      raise exception 'Invalid photo flag' using errcode='22023';
    end if;
    if p_chain_context ? 'stepDurationMs' then
      if jsonb_typeof(p_chain_context->'stepDurationMs') is distinct from 'number' or p_chain_context->>'stepDurationMs' !~ '^(0|[1-9][0-9]{0,5})$' then
        raise exception 'Invalid link duration' using errcode='22023';
      end if;
      if (p_chain_context->>'stepDurationMs')::integer > 120000 then
        raise exception 'Invalid link duration' using errcode='22023';
      end if;
    end if;
  end if;

  insert into public.app_telemetry_events (
    route, method, success, duration_ms, http_status, error_category, provider_status, model, chain_context
  ) values (
    p_route, p_method, p_success, p_duration_ms, p_http_status, p_error_category, p_provider_status, p_model, p_chain_context
  );

  if random() < 0.01 then
    delete from public.app_telemetry_events where created_at < now() - interval '30 days';
  end if;
end;
$$;

create or replace function public.get_admin_operations_metrics(p_window_hours integer default 24)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  window_start timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_window_hours not in (24, 168) then
    raise exception 'Invalid metrics window' using errcode = '22023';
  end if;
  window_start := now() - make_interval(hours => p_window_hours);

  with filtered as (
    select * from public.app_telemetry_events where created_at >= window_start
  ),
  route_stats as (
    select route, method, count(*) as requests,
      count(*) filter (where not success) as failures,
      round(100.0 * count(*) filter (where not success) / nullif(count(*), 0), 1) as error_rate,
      percentile_cont(0.50) within group (order by duration_ms) as p50_ms,
      percentile_cont(0.95) within group (order by duration_ms) as p95_ms,
      percentile_cont(0.99) within group (order by duration_ms) as p99_ms
    from filtered group by route, method
  ),
  generation_stats as (
    select model, count(*) as requests,
      count(*) filter (where success) as successes,
      count(*) filter (where not success) as failures,
      round(100.0 * count(*) filter (where not success) / nullif(count(*), 0), 1) as failure_rate,
      percentile_cont(0.50) within group (order by duration_ms) as p50_ms,
      percentile_cont(0.95) within group (order by duration_ms) as p95_ms,
      percentile_cont(0.99) within group (order by duration_ms) as p99_ms
    from filtered where route = 'caption.generate'
    group by model
  ),
  common_errors as (
    select coalesce(error_category, 'Uncategorized') as category, provider_status, count(*) as occurrences
    from filtered where not success
    group by coalesce(error_category, 'Uncategorized'), provider_status
  )
  ,chain_failures as (
    select chain_context - array['stepDurationMs','stepId'] as context, model, provider_status, count(*) as failures
    from filtered where route='caption.generate' and not success
    group by chain_context - array['stepDurationMs','stepId'],model,provider_status
  )
  select jsonb_build_object(
    'windowHours', p_window_hours,
    'since', window_start,
    'totals', jsonb_build_object(
      'requests', (select count(*) from filtered),
      'failures', (select count(*) from filtered where not success),
      'errorRate', coalesce((select round(100.0 * count(*) filter (where not success) / nullif(count(*), 0), 1) from filtered), 0),
      'p50Ms', coalesce((select percentile_cont(0.50) within group (order by duration_ms) from filtered), 0),
      'p95Ms', coalesce((select percentile_cont(0.95) within group (order by duration_ms) from filtered), 0),
      'p99Ms', coalesce((select percentile_cont(0.99) within group (order by duration_ms) from filtered), 0)
    ),
    'routes', coalesce((select jsonb_agg(to_jsonb(route_stats) order by requests desc) from route_stats), '[]'::jsonb),
    'generations', coalesce((select jsonb_agg(to_jsonb(generation_stats) order by requests desc) from generation_stats), '[]'::jsonb),
    'chainFailures', coalesce((select jsonb_agg(jsonb_build_object('context',context,'model',model,'providerStatus',provider_status,'failures',failures) order by failures desc) from chain_failures), '[]'::jsonb),
    'errors', coalesce((select jsonb_agg(to_jsonb(common_errors) order by occurrences desc) from common_errors), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

create or replace function public.get_admin_operations_request_page(
  p_window_hours integer default 24,
  p_status_class text default 'all',
  p_method text default 'all',
  p_route text default 'all',
  p_sort_by text default 'created_at',
  p_sort_direction text default 'desc',
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  window_start timestamptz;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_window_hours is null or p_window_hours not in (24, 168)
    or p_status_class is null or p_status_class not in ('all', '2xx', '3xx', '4xx', '5xx', 'unknown')
    or p_method is null or p_method not in ('all', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'SERVER_ACTION')
    or p_route is null or char_length(p_route) > 100
    or p_sort_by is null or p_sort_by not in ('created_at', 'http_status', 'method', 'route')
    or p_sort_direction is null or p_sort_direction not in ('asc', 'desc')
    or p_limit is null or p_limit not between 1 and 100
    or p_offset is null or p_offset not between 0 and 1000000
  then
    raise exception 'Invalid request log filters' using errcode = '22023';
  end if;

  window_start := now() - make_interval(hours => p_window_hours);

  with filtered as (
    select event.id, event.route, event.method, event.http_status, event.success,
      event.duration_ms, event.error_category, event.provider_status, event.model, event.created_at, event.chain_context
    from public.app_telemetry_events event
    where event.created_at >= window_start
      and (p_method = 'all' or event.method = p_method)
      and (p_route = 'all' or event.route = p_route)
      and (
        p_status_class = 'all'
        or (p_status_class = 'unknown' and event.http_status is null)
        or (p_status_class = '2xx' and event.http_status between 200 and 299)
        or (p_status_class = '3xx' and event.http_status between 300 and 399)
        or (p_status_class = '4xx' and event.http_status between 400 and 499)
        or (p_status_class = '5xx' and event.http_status between 500 and 599)
      )
  ), ordered as (
    select filtered.*,
      row_number() over (
        order by
          case when p_sort_by = 'created_at' and p_sort_direction = 'asc' then filtered.created_at end asc nulls last,
          case when p_sort_by = 'created_at' and p_sort_direction = 'desc' then filtered.created_at end desc nulls last,
          case when p_sort_by = 'http_status' and p_sort_direction = 'asc' then filtered.http_status end asc nulls last,
          case when p_sort_by = 'http_status' and p_sort_direction = 'desc' then filtered.http_status end desc nulls last,
          case when p_sort_by = 'method' and p_sort_direction = 'asc' then filtered.method end asc nulls last,
          case when p_sort_by = 'method' and p_sort_direction = 'desc' then filtered.method end desc nulls last,
          case when p_sort_by = 'route' and p_sort_direction = 'asc' then filtered.route end asc nulls last,
          case when p_sort_by = 'route' and p_sort_direction = 'desc' then filtered.route end desc nulls last,
          filtered.created_at desc,
          filtered.id desc
      ) as page_order
    from filtered
  ), page as (
    select * from ordered
    where page_order > p_offset and page_order <= p_offset + p_limit
  )
  select jsonb_build_object(
    'windowHours', p_window_hours,
    'total', (select count(*) from filtered),
    'offset', p_offset,
    'limit', p_limit,
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', page.id,
        'route', page.route,
        'method', page.method,
        'httpStatus', page.http_status,
        'success', page.success,
        'durationMs', page.duration_ms,
        'errorCategory', page.error_category,
        'providerStatus', page.provider_status,
        'model', page.model,
        'createdAt', page.created_at,
        'chainContext', page.chain_context
      ) order by page.page_order)
      from page
    ), '[]'::jsonb)
  ) into result;

  return result;
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
        select jsonb_agg(jsonb_build_object('id',step.id,'position',step.position,'title', step.title, 'prompt', step.prompt, 'modelId', step.model_id, 'includeImage', step.include_image) order by step.position)
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
        select jsonb_agg(jsonb_build_object('id',step.id,'position',step.position,'title', step.title, 'prompt', step.prompt, 'modelId', step.model_id, 'includeImage', step.include_image) order by step.position)
        from public.ai_caption_prompt_chain_steps step
        where step.chain_id = chain.id and step.enabled
      ), '[]'::jsonb)
    )
    from public.ai_caption_prompt_chains chain
    where chain.surface = 'admin_panel'
  );
end;
$$;


revoke all on function public.record_app_telemetry_v3(text,text,boolean,integer,integer,text,integer,text,jsonb) from public,anon;
grant execute on function public.record_app_telemetry_v3(text,text,boolean,integer,integer,text,integer,text,jsonb) to authenticated;

commit;
