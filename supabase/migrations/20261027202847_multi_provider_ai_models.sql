begin;

alter table public.ai_models
  drop constraint ai_models_provider_check,
  drop constraint ai_models_model_id_check,
  drop constraint ai_models_model_id_key,
  add column api_base_url text,
  add column encrypted_api_key text,
  add column has_api_key boolean generated always as (encrypted_api_key is not null) stored,
  add constraint ai_models_provider_check check (provider in ('gemini','openai','grok','anthropic','openai_compatible')),
  add constraint ai_models_model_id_check check (
    char_length(model_id) between 1 and 100
    and model_id ~ '^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$'
    and position('://' in model_id) = 0
    and (provider <> 'gemini' or model_id ~ '^gemini-[a-zA-Z0-9.-]+$')
  ),
  add constraint ai_models_api_base_url_check check (
    (provider <> 'openai_compatible' and api_base_url is null)
    or (provider = 'openai_compatible' and api_base_url is not null
      and char_length(api_base_url) <= 500
      and api_base_url ~ '^https://[^/@?#[:space:]]+(/[^?#[:space:]]*)?$')
  ),
  add constraint ai_models_encrypted_key_check check (
    encrypted_api_key is null
    or (char_length(encrypted_api_key) between 40 and 8192
      and encrypted_api_key ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$')
  ),
  add constraint ai_models_custom_key_required check (provider <> 'openai_compatible' or encrypted_api_key is not null);

create unique index ai_models_provider_endpoint_model_key
  on public.ai_models(provider, coalesce(api_base_url,''), model_id);

-- This column stores AES-256-GCM ciphertext, never a plaintext API key.
-- The independent application encryption secret stays on both app servers.
-- Authenticated sessions can read ciphertext for server-side generation;
-- public model catalogs select only safe metadata and never include it.
comment on column public.ai_models.encrypted_api_key is
  'Versioned AES-256-GCM ciphertext bound to model identity and endpoint. Decrypted only by application servers with AI_MODEL_ENCRYPTION_KEY.';

grant update (encrypted_api_key) on public.ai_models to authenticated;
create policy "Admins can rotate model API keys" on public.ai_models
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

commit;
