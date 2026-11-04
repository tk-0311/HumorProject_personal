begin;

create table public.ai_models (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  provider text not null default 'gemini' check (provider = 'gemini'),
  model_id text not null unique check (char_length(model_id) <= 100 and model_id ~ '^gemini-[a-zA-Z0-9.-]+$'),
  created_at timestamptz not null default now()
);

create table public.ai_model_defaults (
  surface text primary key check (surface in ('admin_panel', 'humor_project')),
  model_id uuid not null references public.ai_models(id) on delete restrict
);
create index ai_model_defaults_model_id_idx on public.ai_model_defaults(model_id);

alter table public.ai_models enable row level security;
alter table public.ai_model_defaults enable row level security;
revoke all on public.ai_models, public.ai_model_defaults from public, anon, authenticated;
grant select, insert, delete on public.ai_models to authenticated;
grant select, insert, update on public.ai_model_defaults to authenticated;

create policy "Signed-in users can choose AI models" on public.ai_models
  for select to authenticated using ((select auth.uid()) is not null);
create policy "Admins can add AI models" on public.ai_models
  for insert to authenticated with check ((select public.is_admin()));
create policy "Admins can delete AI models" on public.ai_models
  for delete to authenticated using ((select public.is_admin()));
create policy "Signed-in users can read app model defaults" on public.ai_model_defaults
  for select to authenticated using ((select auth.uid()) is not null);
create policy "Admins can create app model defaults" on public.ai_model_defaults
  for insert to authenticated with check ((select public.is_admin()));
create policy "Admins can change app model defaults" on public.ai_model_defaults
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Preserve the models currently configured and used by both apps.
-- Historical captions keep their model string and do not depend on these rows.
insert into public.ai_models (name, model_id) values
  ('Gemini 3.6 Flash', 'gemini-3.6-flash'),
  ('Gemini 3.1 Flash Lite', 'gemini-3.1-flash-lite');
insert into public.ai_model_defaults (surface, model_id)
select surface, model.id
from (values ('admin_panel'), ('humor_project')) as apps(surface)
cross join public.ai_models model
where model.model_id = 'gemini-3.6-flash';

commit;
