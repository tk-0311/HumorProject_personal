begin;

alter table public.app_telemetry_events
  add column if not exists http_status integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.app_telemetry_events'::regclass
      and conname = 'app_telemetry_events_http_status_check'
  ) then
    alter table public.app_telemetry_events
      add constraint app_telemetry_events_http_status_check
      check (http_status is null or http_status between 100 and 599);
  end if;
end;
$$;

create index if not exists app_telemetry_events_status_method_created_idx
  on public.app_telemetry_events (http_status, method, created_at desc);

create or replace function public.record_app_telemetry_v2(
  p_route text,
  p_method text,
  p_success boolean,
  p_duration_ms integer,
  p_http_status integer,
  p_error_category text default null,
  p_provider_status integer default null,
  p_model text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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

  insert into public.app_telemetry_events (
    route, method, success, duration_ms, http_status, error_category, provider_status, model
  ) values (
    p_route, p_method, p_success, p_duration_ms, p_http_status, p_error_category, p_provider_status, p_model
  );

  if random() < 0.01 then
    delete from public.app_telemetry_events where created_at < now() - interval '30 days';
  end if;
end;
$$;

revoke all on function public.record_app_telemetry_v2(text, text, boolean, integer, integer, text, integer, text) from public, anon;
grant execute on function public.record_app_telemetry_v2(text, text, boolean, integer, integer, text, integer, text) to authenticated;

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
      event.duration_ms, event.error_category, event.provider_status, event.model, event.created_at
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
        'createdAt', page.created_at
      ) order by page.page_order)
      from page
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_admin_operations_request_page(integer, text, text, text, text, text, integer, integer) from public, anon;
grant execute on function public.get_admin_operations_request_page(integer, text, text, text, text, text, integer, integer) to authenticated;

commit;
