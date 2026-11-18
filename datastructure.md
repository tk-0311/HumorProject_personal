# Supabase data structure — HumorProject Personal

This app uses shared Supabase project `apbmaxmpvkaltywewlsh`. Read this file before changing database-dependent code. [Workspace index](../datastructure.md) · [HP Admin Panel](../HP_admin_panel/datastructure.md) · [Prompt Studio](../prompt_chain/datastructure.md).

## Permission and maintenance contract

- Database inspection is read-only unless the user explicitly authorizes a write for the target project/environment and scope. A request to document, debug, or edit application code does not authorize database changes.
- Approval is required before executing schema changes, migrations, data inserts/updates/deletes, seeds, backfills, resets, role/grant/RLS changes, Auth mutations, Storage mutations, or database tests that create/change records even if they later roll back. Do not use app routes or write-capable RPCs to bypass this requirement.
- Proposed SQL and migration files may be prepared for review without executing them. Do not apply historical SQL merely because it exists in this repository.
- After every authorized agent-driven database change, update this document in the same task. Update affected columns, types, defaults/nullability, keys/delete actions, constraints/indexes, policies/grants, RPCs, triggers, buckets, JSON shapes, and app usage. Record data-only changes in the change log even when the structure is unchanged.
- This project is shared by three apps. Keep the shared schema snapshot below identical in all three app `datastructure.md` files, and update affected app-specific notes and the workspace index. If another checkout is unavailable, report exactly which document still needs updating; do not claim cross-app synchronization.
- Verify the result using read-only metadata, record the verification date/environment and migration or change reference, and distinguish proposed/unapplied changes from verified live state. If live access is unavailable, label the documentation as source-derived and unverified.
- Keep credentials, encrypted credential values, real user records, and signed media URLs out of these files. Normal end-user app activity does not require a documentation edit for each row; this contract applies to agent-performed database changes and changes to the data contract.

## This app's data usage

This is the community app and public caption feed. Its caption surface is `humor_project`. It shares all accounts, published captions, and stored images with Admin and Studio.

| Area | Data and operations |
| --- | --- |
| Signup/profile | Supabase Auth, `profiles`, `is_signup_email_allowed`, `get_my_profile_details`, and `profile-photos` Storage. Private profile details must be read through their protected contract rather than a public projection. |
| Feed/favorites | Public projections of `ai_generations`, `ranked_caption_feed`, `caption_vote_counts`, and the signed-in user's `caption_votes`. |
| Votes | Composite key `(user_id, generation_id)`; `value = 1` or `-1`. Never write a derived aggregate count. |
| Discussion | `caption_comments`, `caption_comment_likes`, and `caption_comment_like_counts`. |
| Generate/publish | `claim_caption_attempt`, configured canonical chain through the signed Prompt Studio API, `save_caption_draft`, and owner-only `publish_caption_choice`. |
| Images | `caption-images`, `get_saved_image`/`list_saved_images`, and shared byte-based upload duplicate prevention. Shared references protect images used elsewhere. |
| Shared keywords | Admin-only catalog and published-pair assignments now exist; this app has no keyword-table integration yet. |
| Models/telemetry | Shared `ai_models`/`ai_model_defaults` and `record_app_telemetry_v3`. |

Source entry points: [caption actions](app/captions/actions.ts), [feed](app/components/CaptionFeed.tsx), [generation/publication](app/new/actions.ts), [profile actions](app/profile/actions.ts), [signup checks](lib/auth/signup-policy.ts), [model types](lib/ai/model-types.ts), [saved images](lib/storage/saved-images.ts), [base database SQL](database), and [migrations](supabase/migrations).

The SQL under `database/` and older migrations includes historical draft-publication behavior. The live schema below includes later Studio migrations that consume published drafts and retain private receipts; do not infer current behavior from the oldest script alone.

## Shared Admin keyword storage — applied; Personal integration pending

On 2026-11-17, the user explicitly approved applying the prepared [Admin keyword setup](../HP_admin_panel/database/meme-keywords.sql) to shared project `apbmaxmpvkaltywewlsh`. Migration `20261118015223_admin_meme_keywords` added `meme_keywords`, generation-owned `meme_keyword_assignments`, ten admin functions, access controls/indexes, and eight catalog seeds. Post-apply metadata and seed state were verified read-only and are included in the shared snapshot below. No existing pairs were backfilled; assignments were empty after activation.

The catalog and pair editor are currently Admin-only. Personal's current keyword/topic search and caption generation contract remain unchanged; it does not yet read or write these keyword tables. This shared storage activation does not adopt the proposed JSON formatter response or expand humor styles. A future integration must define the appropriate read and generation/publishing contracts without exposing catalog audit fields.

<!-- BEGIN SHARED SUPABASE SNAPSHOT -->
## Shared Supabase snapshot

Verified: **2026-11-17** against project **`apbmaxmpvkaltywewlsh`** at `https://apbmaxmpvkaltywewlsh.supabase.co`.

Evidence: read-only Supabase table metadata, PostgreSQL catalogs (constraints, indexes, grants, policies, function signatures, triggers), Storage bucket configuration, and applied migration history. The original baseline was created read-only. Following explicit user approval, migration `20261118015223_admin_meme_keywords` activated the Admin keyword setup on 2026-11-17; its resulting schema, access controls, and eight seed rows were verified read-only. No fixture-writing database tests were run.

Scope: **29 application tables** (27 in `public`, 2 in `private`), **4 Storage buckets**, **92 public/private functions**. All cataloged app tables have RLS enabled. No public/private views, materialized views, or custom enum types were present. Supabase-managed Auth/Storage internals are outside the full table inventory; app-facing buckets, policies, and custom Auth triggers are included.

### Relationships and lifecycle

- `auth.users.id` identifies an account. `profiles.user_id` is its shared profile key; account-linked content usually references `auth.users` directly. The exact foreign-key delete/update actions are listed per table below.
- `ai_generations.id` is the published caption identity used by votes and comments. `caption_votes` has composite primary key `(user_id, generation_id)`, with `value = 1` or `-1`; `caption_comment_likes` uses `(comment_id, user_id)`. Totals come from aggregate RPCs. There is no current `captions` table or `captions.like_count` column.
- `caption_drafts.captions` stores three options for one style or nine options for `mixed`. Application selection indexes are zero-based; PostgreSQL text arrays are one-based. `publish_caption_choice` handles that translation for owner publication; Studio uses `studio_publish_caption_draft`.
- Publication retains the chosen caption in `ai_generations` and retires matching drafts/options. Private publication receipts preserve repeat-safe publishing and daily usage; `prompt_chain_published_media` retains chain attribution. Remaining legacy publication columns are documented because they still exist.
- `meme_keywords` is the admin-managed broad keyword catalog. `meme_keyword_assignments` connects catalog IDs to published `ai_generations.id` pairs, so captions sharing an image can have different keywords. Deleting a generation cascades its assignments; deleting a used keyword is restricted. Account deletion clears keyword audit references without removing catalog entries or pair associations.
- Canonical chains use `prompt_chains → prompt_chain_steps`; `prompt_chain_assignments` selects chains per app surface. Generic execution history is `prompt_chain_runs → prompt_chain_run_steps`. Caption-chain visible response history is separately stored in `ai_caption_chain_runs`.
- `image_path` strings identify Storage object paths; these text columns are not foreign keys to `storage.objects`. Image-ID RPCs and private helpers enforce saved-image visibility and reference protection across captions, drafts, profiles, posts, and Studio media. Chain attribution IDs without a declared FK are snapshots, not enforced relationships.
- Shared clients use the publishable key and signed-in user's session. Legacy admin access uses `profiles.role = 'admin'`; Studio access uses `profiles.is_superadmin = true`. Neither flag is an editable profile preference. Column grants, schema access, RLS, and RPC-body checks all affect effective access.

### JSON and array contracts

These shapes are also defined/validated in application source; JSONB column types alone do not enforce every application field.

- `caption_drafts.captions`: `text[]`, three distinct bounded caption strings for `dry`/`wholesome`/`absurd`, or nine grouped options for `mixed` (three per style). See `valid_caption_draft_options` and the table constraints.
- `prompt_chain_runs.steps`: saved step objects with `id, title, prompt, model, model_id, include_image, output_type, enabled` and optional captured provider/endpoint/model-name fields. The snapshot preserves the configuration used by the run.
- `prompt_chain_runs.input_media` and `prompt_chain_run_steps.media`: arrays of media descriptors with `path, mime_type` and optional `bucket` (`caption-images` or legacy `prompt-chain-media`). Signed `url` and `unavailable` fields are response-time presentation fields, not durable object identities.
- `ai_caption_chain_runs.steps`: per-step visible response objects with `index, position, title, model, modelName, provider, includeImage, status, response, durationMs`. Status is `not_run`, `completed`, or `failed`; response/model/timing fields can be null.
- `app_telemetry_events.chain_context`: optional bounded JSON object (database limit 2,000 bytes) for diagnostic context. It is separate from prompt text, credentials, and full response bodies.
- `ai_caption_prompt_chain_steps.model_snapshot`: optional legacy model identity snapshot. Do not treat it as the current model registry.
- Admin keyword catalog RPC: `{keywords: [{id, name, description, active, sort_order, revision, usage_count, updated_at}], total}`, ordered by `sort_order, id`. Usage counts published-pair associations, not distinct images.
- Admin keyword meme RPC: `{memes: [{id, caption, style, image_path, keywords: [{id, name, active}]}], total, offset, limit: 12}`, ordered newest first. The response excludes private prompts and user details. Catalog edits send an expected revision; reorder sends the expected complete catalog order; assignment updates send the expected prior keyword set. These are admin RPC contracts, not a new AI generation response or a Personal browsing API.

### Tables, columns, and constraints

Column defaults and generated expressions are metadata, not migration instructions. “Nullable” describes SQL nullability. Constraints below include exact foreign-key actions and CHECK definitions.

#### `private.caption_publication_receipts`

Minimal publication/idempotency and quota receipts after draft options are retired. Not a client table.

RLS: **enabled**. Primary key: <code>draft_id</code>.

| Column | SQL type | Nullable | Default / generated |
| --- | --- | --- | --- |
| <code>draft_id</code> | <code>uuid</code> | no | — |
| <code>draft_owner</code> | <code>uuid</code> | no | — |
| <code>generation_id</code> | <code>uuid</code> | yes | — |
| <code>selected_index</code> | <code>smallint</code> | yes | — |
| <code>draft_created_at</code> | <code>timestamp with time zone</code> | no | — |
| <code>published_at</code> | <code>timestamp with time zone</code> | no | <code>now()</code> |

- <code>caption_publication_receipts_draft_owner_fkey</code>: <code>FOREIGN KEY (draft_owner) REFERENCES auth.users(id) ON DELETE CASCADE</code>
- <code>caption_publication_receipts_generation_id_fkey</code>: <code>FOREIGN KEY (generation_id) REFERENCES ai_generations(id) ON DELETE SET NULL</code>
- <code>caption_publication_receipts_pkey</code>: <code>PRIMARY KEY (draft_id)</code>
- <code>caption_publication_receipts_selected_index_check</code>: <code>CHECK (selected_index &gt;= 0 AND selected_index &lt;= 8)</code>

#### `private.saved_image_grants`

Internal durable per-image user access grants for legitimate relinked records. Not a client table.

RLS: **enabled**. Primary key: <code>image_id</code>, <code>user_id</code>.

| Column | SQL type | Nullable | Default / generated |
| --- | --- | --- | --- |
| <code>image_id</code> | <code>uuid</code> | no | — |
| <code>user_id</code> | <code>uuid</code> | no | — |

- <code>saved_image_grants_pkey</code>: <code>PRIMARY KEY (image_id, user_id)</code>
- <code>saved_image_grants_user_id_fkey</code>: <code>FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE</code>

#### `public.ai_caption_chain_runs`

Protected caption-chain response snapshots, including partial outputs on failure; separate from generic Studio run rows and aggregate telemetry.

RLS: **enabled**. Primary key: <code>id</code>.

| Column | SQL type | Nullable | Default / generated |
| --- | --- | --- | --- |
| <code>id</code> | <code>uuid</code> | no | <code>gen_random_uuid()</code> |
| <code>user_id</code> | <code>uuid</code> | no | — |
| <code>surface</code> | <code>text</code> | no | — |
| <code>status</code> | <code>text</code> | no | — |
| <code>duration_ms</code> | <code>integer</code> | no | — |
| <code>step_count</code> | <code>smallint</code> | no | — |
| <code>steps</code> | <code>jsonb</code> | no | — |
| <code>failure_phase</code> | <code>text</code> | yes | — |
| <code>created_at</code> | <code>timestamp with time zone</code> | no | <code>now()</code> |

- <code>ai_caption_chain_runs_check</code>: <code>CHECK (jsonb_typeof(steps) = 'array'::text AND jsonb_array_length(steps) = step_count AND pg_column_size(steps) &lt;= 2200000)</code>
- <code>ai_caption_chain_runs_check1</code>: <code>CHECK (status = 'completed'::text AND failure_phase IS NULL OR status = 'failed'::text AND failure_phase IS NOT NULL)</code>
- <code>ai_caption_chain_runs_duration_ms_check</code>: <code>CHECK (duration_ms &gt;= 0 AND duration_ms &lt;= 600000)</code>
- <code>ai_caption_chain_runs_failure_phase_check</code>: <code>CHECK (failure_phase = ANY (ARRAY['chain_configuration'::text, 'credentials'::text, 'provider_request'::text, 'provider_response'::text, 'output_validation'::text, 'unknown'::text]))</code>
- <code>ai_caption_chain_runs_pkey</code>: <code>PRIMARY KEY (id)</code>
- <code>ai_caption_chain_runs_status_check</code>: <code>CHECK (status = ANY (ARRAY['completed'::text, 'failed'::text]))</code>
- <code>ai_caption_chain_runs_step_count_check</code>: <code>CHECK (step_count &gt;= 1 AND step_count &lt;= 20)</code>
- <code>ai_caption_chain_runs_surface_check</code>: <code>CHECK (surface = ANY (ARRAY['admin_panel'::text, 'humor_project'::text, 'prompt_studio'::text]))</code>
- <code>ai_caption_chain_runs_user_id_fkey</code>: <code>FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE</code>

#### `public.ai_caption_prompt_chain_steps`

Legacy chain steps and model snapshots, retained for compatibility.

RLS: **enabled**. Primary key: <code>id</code>.

| Column | SQL type | Nullable | Default / generated |
| --- | --- | --- | --- |
| <code>id</code> | <code>uuid</code> | no | <code>gen_random_uuid()</code> |
| <code>chain_id</code> | <code>uuid</code> | no | — |
| <code>position</code> | <code>smallint</code> | no | — |
| <code>title</code> | <code>text</code> | no | — |
| <code>prompt</code> | <code>text</code> | no | — |
| <code>enabled</code> | <code>boolean</code> | no | <code>true</code> |
| <code>model_id</code> | <code>uuid</code> | no | — |
| <code>include_image</code> | <code>boolean</code> | no | <code>true</code> |
| <code>model_snapshot</code> | <code>jsonb</code> | yes | — |

- <code>ai_caption_prompt_chain_steps_chain_id_fkey</code>: <code>FOREIGN KEY (chain_id) REFERENCES ai_caption_prompt_chains(id) ON DELETE CASCADE</code>
- <code>ai_caption_prompt_chain_steps_chain_id_position_key</code>: <code>UNIQUE (chain_id, "position")</code>
- <code>ai_caption_prompt_chain_steps_model_id_fkey</code>: <code>FOREIGN KEY (model_id) REFERENCES ai_models(id) ON DELETE RESTRICT</code>
- <code>ai_caption_prompt_chain_steps_pkey</code>: <code>PRIMARY KEY (id)</code>
- <code>ai_caption_prompt_chain_steps_position_check</code>: <code>CHECK ("position" &gt;= 0 AND "position" &lt;= 4)</code>
- <code>ai_caption_prompt_chain_steps_prompt_check</code>: <code>CHECK (char_length(btrim(prompt)) &gt;= 1 AND char_length(btrim(prompt)) &lt;= 3000)</code>
- <code>ai_caption_prompt_chain_steps_title_check</code>: <code>CHECK (char_length(btrim(title)) &gt;= 1 AND char_length(btrim(title)) &lt;= 80)</code>

#### `public.ai_caption_prompt_chains`

Legacy per-surface sequential caption configuration. Canonical current assignments use prompt_chain_assignments.

RLS: **enabled**. Primary key: <code>id</code>.

| Column | SQL type | Nullable | Default / generated |
| --- | --- | --- | --- |
| <code>id</code> | <code>uuid</code> | no | <code>gen_random_uuid()</code> |
| <code>surface</code> | <code>text</code> | no | — |
| <code>execution_mode</code> | <code>text</code> | no | <code>'sequential'::text</code> |
| <code>updated_by</code> | <code>uuid</code> | yes | — |
| <code>updated_at</code> | <code>timestamp with time zone</code> | no | <code>now()</code> |

- <code>ai_caption_prompt_chains_execution_mode_check</code>: <code>CHECK (execution_mode = 'sequential'::text)</code>
- <code>ai_caption_prompt_chains_pkey</code>: <code>PRIMARY KEY (id)</code>
- <code>ai_caption_prompt_chains_surface_check</code>: <code>CHECK (surface = ANY (ARRAY['humor_project'::text, 'admin_panel'::text]))</code>
- <code>ai_caption_prompt_chains_surface_key</code>: <code>UNIQUE (surface)</code>
- <code>ai_caption_prompt_chains_updated_by_fkey</code>: <code>FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL</code>

#### `public.ai_generation_attempts`

Per-user attempt timestamps used by generation admission/limits.

RLS: **enabled**. Primary key: <code>id</code>.

| Column | SQL type | Nullable | Default / generated |
| --- | --- | --- | --- |
| <code>id</code> | <code>uuid</code> | no | <code>gen_random_uuid()</code> |
| <code>user_id</code> | <code>uuid</code> | no | — |
| <code>created_at</code> | <code>timestamp with time zone</code> | no | <code>now()</code> |

- <code>ai_generation_attempts_pkey</code>: <code>PRIMARY KEY (id)</code>
- <code>ai_generation_attempts_user_id_fkey</code>: <code>FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE</code>

#### `public.ai_generations`

Published caption posts shared by the community feed, admin dashboard, and Studio. This is the current caption table.

RLS: **enabled**. Primary key: <code>id</code>.

| Column | SQL type | Nullable | Default / generated |
| --- | --- | --- | --- |
| <code>id</code> | <code>uuid</code> | no | <code>gen_random_uuid()</code> |
| <code>user_id</code> | <code>uuid</code> | no | — |
| <code>situation</code> | <code>text</code> | no | — |
| <code>prompt</code> | <code>text</code> | no | — |
| <code>caption</code> | <code>text</code> | no | — |
| <code>style</code> | <code>text</code> | no | — |
| <code>model</code> | <code>text</code> | no | — |
| <code>created_at</code> | <code>timestamp with time zone</code> | no | <code>now()</code> |
| <code>image_path</code> | <code>text</code> | yes | — |
| <code>content_key</code> | <code>text</code> | yes | — |

- <code>ai_generations_caption_check</code>: <code>CHECK (char_length(btrim(caption)) &gt;= 1 AND char_length(btrim(caption)) &lt;= 280)</code>
- <code>ai_generations_image_path_length</code>: <code>CHECK (image_path IS NULL OR char_length(image_path) &lt;= 200)</code>
- <code>ai_generations_model_check</code>: <code>CHECK (char_length(model) &gt;= 1 AND char_length(model) &lt;= 100)</code>
- <code>ai_generations_pkey</code>: <code>PRIMARY KEY (id)</code>
- <code>ai_generations_prompt_check</code>: <code>CHECK (char_length(prompt) &gt;= 1 AND char_length(prompt) &lt;= 3000)</code>
- <code>ai_generations_situation_check</code>: <code>CHECK (char_length(btrim(situation)) &gt;= 1 AND char_length(btrim(situation)) &lt;= 500 AND (char_length(btrim(situation)) &gt;= 10 OR image_path IS NOT NULL))</code>
- <code>ai_generations_style_check</code>: <code>CHECK (style = ANY (ARRAY['dry'::text, 'absurd'::text, 'wholesome'::text]))</code>
- <code>ai_generations_user_id_fkey</code>: <code>FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE</code>

#### `public.ai_model_defaults`

Default model IDs for the admin_panel and humor_project surfaces.

RLS: **enabled**. Primary key: <code>surface</code>.

| Column | SQL type | Nullable | Default / generated |
| --- | --- | --- | --- |
| <code>surface</code> | <code>text</code> | no | — |
| <code>model_id</code> | <code>uuid</code> | no | — |

- <code>ai_model_defaults_model_id_fkey</code>: <code>FOREIGN KEY (model_id) REFERENCES ai_models(id) ON DELETE RESTRICT</code>
- <code>ai_model_defaults_pkey</code>: <code>PRIMARY KEY (surface)</code>
- <code>ai_model_defaults_surface_check</code>: <code>CHECK (surface = ANY (ARRAY['admin_panel'::text, 'humor_project'::text]))</code>

#### `public.ai_models`

Shared provider/model catalog with optional server-decrypted credentials. has_api_key is generated; never place credential values in documentation.

RLS: **enabled**. Primary key: <code>id</code>.

| Column | SQL type | Nullable | Default / generated |
| --- | --- | --- | --- |
| <code>id</code> | <code>uuid</code> | no | <code>gen_random_uuid()</code> |
| <code>name</code> | <code>text</code> | no | — |
| <code>provider</code> | <code>text</code> | no | <code>'gemini'::text</code> |
| <code>model_id</code> | <code>text</code> | no | — |
| <code>created_at</code> | <code>timestamp with time zone</code> | no | <code>now()</code> |
| <code>api_base_url</code> | <code>text</code> | yes | — |
| <code>encrypted_api_key</code> | <code>text</code> | yes | — |
| <code>has_api_key</code> | <code>boolean</code> | yes | <code>(encrypted_api_key IS NOT NULL)</code> (generated) |

- <code>ai_models_api_base_url_check</code>: <code>CHECK (provider &lt;&gt; 'openai_compatible'::text AND api_base_url IS NULL OR provider = 'openai_compatible'::text AND api_base_url IS NOT NULL AND char_length(api_base_url) &lt;= 500 AND api_base_url ~ '^https://[^/@?#[:space:]]+(/[^?#[:space:]]*)?$'::text)</code>
- <code>ai_models_custom_key_required</code>: <code>CHECK (provider &lt;&gt; 'openai_compatible'::text OR encrypted_api_key IS NOT NULL)</code>
- <code>ai_models_encrypted_key_check</code>: <code>CHECK (encrypted_api_key IS NULL OR char_length(encrypted_api_key) &gt;= 40 AND char_length(encrypted_api_key) &lt;= 8192 AND encrypted_api_key ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'::text)</code>
- <code>ai_models_model_id_check</code>: <code>CHECK (char_length(model_id) &gt;= 1 AND char_length(model_id) &lt;= 100 AND model_id ~ '^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$'::text AND POSITION(('://'::text) IN (model_id)) = 0 AND (provider &lt;&gt; 'gemini'::text OR model_id ~ '^gemini-[a-zA-Z0-9.-]+$'::text))</code>
- <code>ai_models_name_check</code>: <code>CHECK (char_length(btrim(name)) &gt;= 1 AND char_length(btrim(name)) &lt;= 80)</code>
- <code>ai_models_pkey</code>: <code>PRIMARY KEY (id)</code>
- <code>ai_models_provider_check</code>: <code>CHECK (provider = ANY (ARRAY['gemini'::text, 'openai'::text, 'grok'::text, 'anthropic'::text, 'openai_compatible'::text]))</code>

#### `public.ai_prompt_templates`

Legacy caption prompt templates retained alongside the canonical Studio chains.

RLS: **enabled**. Primary key: <code>id</code>.

| Column | SQL type | Nullable | Default / generated |
| --- | --- | --- | --- |
| <code>id</code> | <code>uuid</code> | no | <code>gen_random_uuid()</code> |
| <code>name</code> | <code>text</code> | no | — |
| <code>prompt_template</code> | <code>text</code> | no | — |
| <code>is_active</code> | <code>boolean</code> | no | <code>false</code> |
| <code>created_by</code> | <code>uuid</code> | yes | — |
| <code>created_at</code> | <code>timestamp with time zone</code> | no | <code>now()</code> |
| <code>updated_at</code> | <code>timestamp with time zone</code> | no | <code>now()</code> |

- <code>ai_prompt_templates_created_by_fkey</code>: <code>FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL</code>
- <code>ai_prompt_templates_name_check</code>: <code>CHECK (char_length(btrim(name)) &gt;= 1 AND char_length(btrim(name)) &lt;= 80)</code>
- <code>ai_prompt_templates_pkey</code>: <code>PRIMARY KEY (id)</code>
- <code>ai_prompt_templates_prompt_template_check</code>: <code>CHECK (char_length(btrim(prompt_template)) &gt;= 80 AND char_length(btrim(prompt_template)) &lt;= 3000 AND POSITION(('{{style}}'::text) IN (prompt_template)) &gt; 0)</code>

#### `public.allowed_signup_domains`

Normalized exact domain allowlist, managed by admins.

RLS: **enabled**. Primary key: <code>id</code>.

| Column | SQL type | Nullable | Default / generated |
| --- | --- | --- | --- |
| <code>id</code> | <code>uuid</code> | no | <code>gen_random_uuid()</code> |
| <code>domain</code> | <code>text</code> | no | — |
| <code>created_at</code> | <code>timestamp with time zone</code> | no | <code>now()</code> |
| <code>updated_at</code> | <code>timestamp with time zone</code> | no | <code>now()</code> |
| <code>updated_by</code> | <code>uuid</code> | yes | — |

- <code>allowed_signup_domains_domain_check</code>: <code>CHECK (domain = lower(btrim(domain)) AND char_length(domain) &gt;= 3 AND char_length(domain) &lt;= 253 AND domain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'::text AND char_length(split_part(domain, '.'::text, '-1'::integer)) &gt;= 2 AND split_part(domain, '.'::text, '-1'::integer) !~ '^[0-9]+$'::text)</code>
- <code>allowed_signup_domains_domain_key</code>: <code>UNIQUE (domain)</code>
- <code>allowed_signup_domains_pkey</code>: <code>PRIMARY KEY (id)</code>
- <code>allowed_signup_domains_updated_by_fkey</code>: <code>FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL</code>

#### `public.app_telemetry_events`

Bounded request metrics and failure context, written/read through telemetry and operations RPCs.

RLS: **enabled**. Primary key: <code>id</code>.

| Column | SQL type | Nullable | Default / generated |
| --- | --- | --- | --- |
| <code>id</code> | <code>bigint</code> | no | <code>GENERATED ALWAYS AS IDENTITY</code> |
| <code>route</code> | <code>text</code> | no | — |
| <code>method</code> | <code>text</code> | no | — |
| <code>success</code> | <code>boolean</code> | no | — |
| <code>duration_ms</code> | <code>integer</code> | no | — |
| <code>error_category</code> | <code>text</code> | yes | — |
| <code>provider_status</code> | <code>integer</code> | yes | — |
| <code>model</code> | <code>text</code> | yes | — |
| <code>created_at</code> | <code>timestamp with time zone</code> | no | <code>now()</code> |
| <code>http_status</code> | <code>integer</code> | yes | — |
| <code>chain_context</code> | <code>jsonb</code> | yes | — |

- <code>app_telemetry_events_chain_context_check</code>: <code>CHECK (chain_context IS NULL OR jsonb_typeof(chain_context) = 'object'::text AND pg_column_size(chain_context) &lt;= 2000)</code>
- <code>app_telemetry_events_duration_ms_check</code>: <code>CHECK (duration_ms &gt;= 0 AND duration_ms &lt;= 120000)</code>
- <code>app_telemetry_events_error_category_check</code>: <code>CHECK (error_category IS NULL OR char_length(error_category) &lt;= 80)</code>
- <code>app_telemetry_events_http_status_check</code>: <code>CHECK (http_status IS NULL OR http_status &gt;= 100 AND http_status &lt;= 599)</code>
- <code>app_telemetry_events_method_check</code>: <code>CHECK (method = ANY (ARRAY['GET'::text, 'POST'::text, 'PUT'::text, 'PATCH'::text, 'DELETE'::text, 'SERVER_ACTION'::text]))</code>
- <code>app_telemetry_events_model_check</code>: <code>CHECK (model IS NULL OR char_length(model) &lt;= 100)</code>
- <code>app_telemetry_events_pkey</code>: <code>PRIMARY KEY (id)</code>
- <code>app_telemetry_events_provider_status_check</code>: <code>CHECK (provider_status IS NULL OR provider_status &gt;= 100 AND provider_status &lt;= 599)</code>
- <code>app_telemetry_events_route_check</code>: <code>CHECK (char_length(route) &gt;= 1 AND char_length(route) &lt;= 100)</code>

#### `public.caption_comment_likes`

One like per comment and user.

RLS: **enabled**. Primary key: <code>comment_id</code>, <code>user_id</code>.

| Column | SQL type | Nullable | Default / generated |
| --- | --- | --- | --- |
| <code>comment_id</code> | <code>uuid</code> | no | — |
| <code>user_id</code> | <code>uuid</code> | no | — |
| <code>created_at</code> | <code>timestamp with time zone</code> | no | <code>now()</code> |

- <code>caption_comment_likes_comment_id_fkey</code>: <code>FOREIGN KEY (comment_id) REFERENCES caption_comments(id) ON DELETE CASCADE</code>
- <code>caption_comment_likes_pkey</code>: <code>PRIMARY KEY (comment_id, user_id)</code>
- <code>caption_comment_likes_user_id_fkey</code>: <code>FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE</code>

#### `public.caption_comments`

Comments on published generations; content is limited to 1,000 trimmed characters.

RLS: **enabled**. Primary key: <code>id</code>.

| Column | SQL type | Nullable | Default / generated |
| --- | --- | --- | --- |
| <code>id</code> | <code>uuid</code> | no | <code>gen_random_uuid()</code> |
| <code>generation_id</code> | <code>uuid</code> | no | — |
| <code>user_id</code> | <code>uuid</code> | no | — |
| <code>content</code> | <code>text</code> | no | — |
| <code>created_at</code> | <code>timestamp with time zone</code> | no | <code>now()</code> |

- <code>caption_comments_content_check</code>: <code>CHECK (char_length(btrim(content)) &gt;= 1 AND char_length(btrim(content)) &lt;= 1000)</code>
- <code>caption_comments_generation_id_fkey</code>: <code>FOREIGN KEY (generation_id) REFERENCES ai_generations(id) ON DELETE CASCADE</code>
- <code>caption_comments_pkey</code>: <code>PRIMARY KEY (id)</code>
- <code>caption_comments_user_id_fkey</code>: <code>FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE</code>

#### `public.caption_drafts`

Unpublished three-option single-style or nine-option mixed-style captions. edit_revision detects concurrent edits; publication consumes matching drafts.

RLS: **enabled**. Primary key: <code>id</code>.

| Column | SQL type | Nullable | Default / generated |
| --- | --- | --- | --- |
| <code>id</code> | <code>uuid</code> | no | <code>gen_random_uuid()</code> |
| <code>user_id</code> | <code>uuid</code> | no | — |
| <code>image_path</code> | <code>text</code> | no | — |
| <code>prompt</code> | <code>text</code> | no | — |
| <code>model</code> | <code>text</code> | no | — |
| <code>style</code> | <code>text</code> | no | — |
| <code>captions</code> | <code>text[]</code> | no | — |
| <code>published_generation_id</code> | <code>uuid</code> | yes | — |
| <code>selected_index</code> | <code>smallint</code> | yes | — |
| <code>created_at</code> | <code>timestamp with time zone</code> | no | <code>now()</code> |
| <code>content_key</code> | <code>text</code> | yes | — |
| <code>edit_revision</code> | <code>integer</code> | no | <code>1</code> |

- <code>caption_drafts_captions_check</code>: <code>CHECK (valid_caption_draft_options(captions))</code>
- <code>caption_drafts_edit_revision_check</code>: <code>CHECK (edit_revision &gt; 0)</code>
- <code>caption_drafts_image_path_check</code>: <code>CHECK (char_length(image_path) &gt;= 1 AND char_length(image_path) &lt;= 200)</code>
- <code>caption_drafts_model_check</code>: <code>CHECK (char_length(model) &gt;= 1 AND char_length(model) &lt;= 100)</code>
- <code>caption_drafts_pkey</code>: <code>PRIMARY KEY (id)</code>
- <code>caption_drafts_prompt_check</code>: <code>CHECK (char_length(prompt) &gt;= 1 AND char_length(prompt) &lt;= 3000)</code>
- <code>caption_drafts_published_generation_id_fkey</code>: <code>FOREIGN KEY (published_generation_id) REFERENCES ai_generations(id) ON DELETE SET NULL</code>
- <code>caption_drafts_selected_index_check</code>: <code>CHECK (selected_index &gt;= 0 AND selected_index &lt; cardinality(captions))</code>
- <code>caption_drafts_style_check</code>: <code>CHECK ((style = ANY (ARRAY['dry'::text, 'wholesome'::text, 'absurd'::text])) AND cardinality(captions) = 3 OR style = 'mixed'::text AND cardinality(captions) = 9)</code>
- <code>caption_drafts_user_id_fkey</code>: <code>FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE</code>

#### `public.caption_votes`

One signed vote per user and published generation; value is 1 or -1.

RLS: **enabled**. Primary key: <code>user_id</code>, <code>generation_id</code>.

| Column | SQL type | Nullable | Default / generated |
| --- | --- | --- | --- |
| <code>user_id</code> | <code>uuid</code> | no | — |
| <code>generation_id</code> | <code>uuid</code> | no | — |
| <code>value</code> | <code>smallint</code> | no | — |
| <code>created_at</code> | <code>timestamp with time zone</code> | no | <code>now()</code> |

- <code>caption_votes_generation_id_fkey</code>: <code>FOREIGN KEY (generation_id) REFERENCES ai_generations(id) ON DELETE CASCADE</code>
- <code>caption_votes_pkey</code>: <code>PRIMARY KEY (user_id, generation_id)</code>
- <code>caption_votes_user_id_fkey</code>: <code>FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE</code>
- <code>caption_votes_value_check</code>: <code>CHECK (value = ANY (ARRAY['-1'::integer, 1]))</code>

#### `public.meme_keyword_assignments`

Admin-managed keywords for one published image-caption pair. `source = 'ai'` is reserved by the data type; this activation creates no AI assignments. The four-keyword limit is enforced by the mutation RPC, not a table CHECK.

RLS: **enabled**. Primary key: <code>generation_id</code>, <code>keyword_id</code>.

| Column | SQL type | Nullable | Default / generated |
| --- | --- | --- | --- |
| <code>generation_id</code> | <code>uuid</code> | no | — |
| <code>keyword_id</code> | <code>uuid</code> | no | — |
| <code>source</code> | <code>text</code> | no | <code>'admin'::text</code> |
| <code>assigned_by</code> | <code>uuid</code> | yes | — |
| <code>updated_at</code> | <code>timestamp with time zone</code> | no | <code>now()</code> |

- <code>meme_keyword_assignments_generation_id_fkey</code>: <code>FOREIGN KEY (generation_id) REFERENCES public.ai_generations(id) ON DELETE CASCADE</code>
- <code>meme_keyword_assignments_keyword_id_fkey</code>: <code>FOREIGN KEY (keyword_id) REFERENCES public.meme_keywords(id) ON DELETE RESTRICT</code>
- <code>meme_keyword_assignments_assigned_by_fkey</code>: <code>FOREIGN KEY (assigned_by) REFERENCES auth.users(id) ON DELETE SET NULL</code>
- <code>meme_keyword_assignments_pkey</code>: <code>PRIMARY KEY (generation_id, keyword_id)</code>
- <code>meme_keyword_assignments_source_check</code>: <code>CHECK (source IN ('admin', 'ai'))</code>

#### `public.meme_keywords`

Broad keyword catalog with stable UUID identities, an AI definition in `description`, active status, display order, and optimistic edit revisions. This feature exposes the catalog only to authenticated admins; it does not yet provide a Personal or AI read contract.

RLS: **enabled**. Primary key: <code>id</code>.

| Column | SQL type | Nullable | Default / generated |
| --- | --- | --- | --- |
| <code>id</code> | <code>uuid</code> | no | <code>gen_random_uuid()</code> |
| <code>name</code> | <code>text</code> | no | — |
| <code>description</code> | <code>text</code> | no | — |
| <code>active</code> | <code>boolean</code> | no | <code>true</code> |
| <code>sort_order</code> | <code>integer</code> | no | — |
| <code>revision</code> | <code>integer</code> | no | <code>1</code> |
| <code>created_at</code> | <code>timestamp with time zone</code> | no | <code>now()</code> |
| <code>updated_at</code> | <code>timestamp with time zone</code> | no | <code>now()</code> |
| <code>created_by</code> | <code>uuid</code> | yes | — |
| <code>updated_by</code> | <code>uuid</code> | yes | — |

- <code>meme_keywords_pkey</code>: <code>PRIMARY KEY (id)</code>
- <code>meme_keywords_name_check</code>: <code>CHECK (char_length(name) BETWEEN 1 AND 32 AND name = btrim(name) AND name = regexp_replace(name, '\s+', ' ', 'g'))</code>
- <code>meme_keywords_description_check</code>: <code>CHECK (char_length(description) BETWEEN 1 AND 220 AND description = btrim(description))</code>
- <code>meme_keywords_sort_order_check</code>: <code>CHECK (sort_order BETWEEN 0 AND 1000000)</code>
- <code>meme_keywords_revision_check</code>: <code>CHECK (revision &gt; 0)</code>
- <code>meme_keywords_created_by_fkey</code>: <code>FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL</code>
- <code>meme_keywords_updated_by_fkey</code>: <code>FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL</code>
- Case-insensitive name uniqueness is enforced by the <code>meme_keywords_name_unique</code> index on <code>lower(name)</code>.

#### `public.posts`

Legacy community posts retained for compatibility and shared image reference checks.

RLS: **enabled**. Primary key: <code>id</code>.

| Column | SQL type | Nullable | Default / generated |
| --- | --- | --- | --- |
| <code>id</code> | <code>uuid</code> | no | <code>gen_random_uuid()</code> |
| <code>created_at</code> | <code>timestamp with time zone</code> | no | <code>now()</code> |
| <code>content</code> | <code>text</code> | yes | — |
| <code>image_src</code> | <code>text</code> | yes | — |
| <code>image_alt</code> | <code>text</code> | yes | — |
| <code>likes</code> | <code>bigint</code> | yes | — |
| <code>user_id</code> | <code>uuid</code> | yes | <code>auth.uid()</code> |

- <code>Post_pkey</code>: <code>PRIMARY KEY (id)</code>
- <code>posts_user_id_fkey</code>: <code>FOREIGN KEY (user_id) REFERENCES profiles(user_id)</code>

#### `public.profiles`

Shared account/profile record. Public profile columns and private details have separate column grants; legacy role and Studio superadmin flag are distinct.

RLS: **enabled**. Primary key: <code>user_id</code>.

| Column | SQL type | Nullable | Default / generated |
| --- | --- | --- | --- |
| <code>profile_image</code> | <code>text</code> | yes | — |
| <code>bio</code> | <code>text</code> | yes | — |
| <code>website</code> | <code>text</code> | yes | — |
| <code>created_at</code> | <code>timestamp with time zone</code> | no | <code>now()</code> |
| <code>updated_at</code> | <code>timestamp with time zone</code> | no | <code>now()</code> |
| <code>user_id</code> | <code>uuid</code> | no | <code>auth.uid()</code> |
| <code>username</code> | <code>character varying</code> | no | — |
| <code>f_name</code> | <code>character varying</code> | yes | — |
| <code>l_name</code> | <code>character varying</code> | yes | — |
| <code>address</code> | <code>text</code> | yes | — |
| <code>email</code> | <code>text</code> | yes | — |
| <code>first_name</code> | <code>text</code> | yes | — |
| <code>last_name</code> | <code>text</code> | yes | — |
| <code>dorm</code> | <code>text</code> | yes | — |
| <code>caption_persona</code> | <code>text</code> | yes | — |
| <code>role</code> | <code>text</code> | no | <code>'user'::text</code> |
| <code>is_superadmin</code> | <code>boolean</code> | no | <code>false</code> |

- <code>profiles_caption_persona_length</code>: <code>CHECK (caption_persona IS NULL OR char_length(btrim(caption_persona)) &gt;= 1 AND char_length(btrim(caption_persona)) &lt;= 500)</code>
- <code>profiles_pkey</code>: <code>PRIMARY KEY (user_id)</code>
- <code>profiles_role_check</code>: <code>CHECK (role = ANY (ARRAY['user'::text, 'admin'::text]))</code>
- <code>profiles_user_id_fkey</code>: <code>FOREIGN KEY (user_id) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE</code>

#### `public.prompt_chain_assignments`

Maps admin_panel and humor_project to a canonical prompt_chains row.

RLS: **enabled**. Primary key: <code>surface</code>.

| Column | SQL type | Nullable | Default / generated |
| --- | --- | --- | --- |
| <code>surface</code> | <code>text</code> | no | — |
| <code>chain_id</code> | <code>uuid</code> | no | — |
| <code>updated_at</code> | <code>timestamp with time zone</code> | no | <code>now()</code> |

- <code>prompt_chain_assignments_chain_id_fkey</code>: <code>FOREIGN KEY (chain_id) REFERENCES prompt_chains(id) ON DELETE RESTRICT</code>
- <code>prompt_chain_assignments_pkey</code>: <code>PRIMARY KEY (surface)</code>
- <code>prompt_chain_assignments_surface_check</code>: <code>CHECK (surface = ANY (ARRAY['admin_panel'::text, 'humor_project'::text]))</code>

#### `public.prompt_chain_caption_media`

Associates a caption draft with its originating chain identity/revision. Draft deletion cascades this link.

RLS: **enabled**. Primary key: <code>id</code>.

| Column | SQL type | Nullable | Default / generated |
| --- | --- | --- | --- |
| <code>id</code> | <code>uuid</code> | no | <code>gen_random_uuid()</code> |
| <code>chain_id</code> | <code>uuid</code> | no | — |
| <code>chain_name</code> | <code>text</code> | no | — |
| <code>chain_revision</code> | <code>integer</code> | no | — |
| <code>caption_draft_id</code> | <code>uuid</code> | no | — |
| <code>created_by</code> | <code>uuid</code> | no | — |
| <code>created_at</code> | <code>timestamp with time zone</code> | no | <code>now()</code> |

- <code>prompt_chain_caption_media_caption_draft_id_fkey</code>: <code>FOREIGN KEY (caption_draft_id) REFERENCES caption_drafts(id) ON DELETE CASCADE</code>
- <code>prompt_chain_caption_media_chain_id_caption_draft_id_key</code>: <code>UNIQUE (chain_id, caption_draft_id)</code>
- <code>prompt_chain_caption_media_chain_name_check</code>: <code>CHECK (char_length(chain_name) &gt;= 1 AND char_length(chain_name) &lt;= 100)</code>
- <code>prompt_chain_caption_media_chain_revision_check</code>: <code>CHECK (chain_revision &gt; 0)</code>
- <code>prompt_chain_caption_media_created_by_fkey</code>: <code>FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE</code>
- <code>prompt_chain_caption_media_pkey</code>: <code>PRIMARY KEY (id)</code>

#### `public.prompt_chain_published_media`

Retains chain attribution for a published ai_generations record after the draft is consumed.

RLS: **enabled**. Primary key: <code>id</code>.

| Column | SQL type | Nullable | Default / generated |
| --- | --- | --- | --- |
| <code>id</code> | <code>uuid</code> | no | <code>gen_random_uuid()</code> |
| <code>chain_id</code> | <code>uuid</code> | no | — |
| <code>chain_name</code> | <code>text</code> | no | — |
| <code>chain_revision</code> | <code>integer</code> | no | — |
| <code>generation_id</code> | <code>uuid</code> | no | — |
| <code>created_by</code> | <code>uuid</code> | no | — |
| <code>created_at</code> | <code>timestamp with time zone</code> | no | <code>now()</code> |

- <code>prompt_chain_published_media_chain_id_generation_id_key</code>: <code>UNIQUE (chain_id, generation_id)</code>
- <code>prompt_chain_published_media_created_by_fkey</code>: <code>FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE</code>
- <code>prompt_chain_published_media_generation_id_fkey</code>: <code>FOREIGN KEY (generation_id) REFERENCES ai_generations(id) ON DELETE CASCADE</code>
- <code>prompt_chain_published_media_pkey</code>: <code>PRIMARY KEY (id)</code>

#### `public.prompt_chain_run_steps`

Saved outputs for individual generic Studio run steps.

RLS: **enabled**. Primary key: <code>id</code>.

| Column | SQL type | Nullable | Default / generated |
| --- | --- | --- | --- |
| <code>id</code> | <code>uuid</code> | no | <code>gen_random_uuid()</code> |
| <code>run_id</code> | <code>uuid</code> | no | — |
| <code>position</code> | <code>integer</code> | no | — |
| <code>title</code> | <code>text</code> | no | — |
| <code>model</code> | <code>text</code> | no | — |
| <code>text</code> | <code>text</code> | no | <code>''::text</code> |
| <code>media</code> | <code>jsonb</code> | no | <code>'[]'::jsonb</code> |
| <code>duration_ms</code> | <code>integer</code> | no | — |
| <code>created_at</code> | <code>timestamp with time zone</code> | no | <code>now()</code> |

- <code>prompt_chain_run_steps_duration_ms_check</code>: <code>CHECK (duration_ms &gt;= 0)</code>
- <code>prompt_chain_run_steps_media_check</code>: <code>CHECK (jsonb_typeof(media) = 'array'::text)</code>
- <code>prompt_chain_run_steps_pkey</code>: <code>PRIMARY KEY (id)</code>
- <code>prompt_chain_run_steps_position_check</code>: <code>CHECK ("position" &gt;= 0 AND "position" &lt;= 19)</code>
- <code>prompt_chain_run_steps_run_id_fkey</code>: <code>FOREIGN KEY (run_id) REFERENCES prompt_chain_runs(id) ON DELETE CASCADE</code>
- <code>prompt_chain_run_steps_run_id_position_key</code>: <code>UNIQUE (run_id, "position")</code>
- <code>prompt_chain_run_steps_text_check</code>: <code>CHECK (char_length(text) &lt;= 100000)</code>

#### `public.prompt_chain_runs`

Generic Studio execution snapshots, input/media, progress, leases, display metadata, and edit revision.

RLS: **enabled**. Primary key: <code>id</code>.

| Column | SQL type | Nullable | Default / generated |
| --- | --- | --- | --- |
| <code>id</code> | <code>uuid</code> | no | <code>gen_random_uuid()</code> |
| <code>chain_id</code> | <code>uuid</code> | yes | — |
| <code>chain_name</code> | <code>text</code> | no | — |
| <code>chain_revision</code> | <code>integer</code> | no | — |
| <code>steps</code> | <code>jsonb</code> | no | — |
| <code>input_text</code> | <code>text</code> | no | <code>''::text</code> |
| <code>input_media</code> | <code>jsonb</code> | no | <code>'[]'::jsonb</code> |
| <code>status</code> | <code>text</code> | no | <code>'queued'::text</code> |
| <code>next_step</code> | <code>integer</code> | no | <code>0</code> |
| <code>error</code> | <code>text</code> | yes | — |
| <code>lease_token</code> | <code>uuid</code> | yes | — |
| <code>lease_expires_at</code> | <code>timestamp with time zone</code> | yes | — |
| <code>created_by</code> | <code>uuid</code> | no | — |
| <code>created_at</code> | <code>timestamp with time zone</code> | no | <code>now()</code> |
| <code>updated_at</code> | <code>timestamp with time zone</code> | no | <code>now()</code> |
| <code>display_name</code> | <code>text</code> | yes | — |
| <code>notes</code> | <code>text</code> | no | <code>''::text</code> |
| <code>edit_revision</code> | <code>integer</code> | no | <code>1</code> |

- <code>prompt_chain_runs_chain_id_fkey</code>: <code>FOREIGN KEY (chain_id) REFERENCES prompt_chains(id) ON DELETE SET NULL</code>
- <code>prompt_chain_runs_created_by_fkey</code>: <code>FOREIGN KEY (created_by) REFERENCES auth.users(id)</code>
- <code>prompt_chain_runs_display_name_check</code>: <code>CHECK (char_length(display_name) &gt;= 1 AND char_length(display_name) &lt;= 100)</code>
- <code>prompt_chain_runs_edit_revision_check</code>: <code>CHECK (edit_revision &gt; 0)</code>
- <code>prompt_chain_runs_input_media_check</code>: <code>CHECK (jsonb_typeof(input_media) = 'array'::text)</code>
- <code>prompt_chain_runs_input_text_check</code>: <code>CHECK (char_length(input_text) &lt;= 10000)</code>
- <code>prompt_chain_runs_next_step_check</code>: <code>CHECK (next_step &gt;= 0 AND next_step &lt;= 20)</code>
- <code>prompt_chain_runs_notes_check</code>: <code>CHECK (char_length(notes) &lt;= 5000)</code>
- <code>prompt_chain_runs_pkey</code>: <code>PRIMARY KEY (id)</code>
- <code>prompt_chain_runs_status_check</code>: <code>CHECK (status = ANY (ARRAY['queued'::text, 'running'::text, 'completed'::text, 'failed'::text]))</code>
- <code>prompt_chain_runs_steps_check</code>: <code>CHECK (jsonb_typeof(steps) = 'array'::text AND jsonb_array_length(steps) &gt;= 1 AND jsonb_array_length(steps) &lt;= 20)</code>

#### `public.prompt_chain_steps`

Ordered chain steps, positions 0–19, per-step model reference, image input, output type, and enabled flag.

RLS: **enabled**. Primary key: <code>id</code>.

| Column | SQL type | Nullable | Default / generated |
| --- | --- | --- | --- |
| <code>id</code> | <code>uuid</code> | no | <code>gen_random_uuid()</code> |
| <code>chain_id</code> | <code>uuid</code> | no | — |
| <code>position</code> | <code>integer</code> | no | — |
| <code>title</code> | <code>text</code> | no | — |
| <code>prompt</code> | <code>text</code> | no | — |
| <code>model</code> | <code>text</code> | no | — |
| <code>include_image</code> | <code>boolean</code> | no | <code>false</code> |
| <code>output_type</code> | <code>text</code> | no | <code>'text'::text</code> |
| <code>model_id</code> | <code>uuid</code> | yes | — |
| <code>enabled</code> | <code>boolean</code> | no | <code>true</code> |

- <code>prompt_chain_steps_chain_id_fkey</code>: <code>FOREIGN KEY (chain_id) REFERENCES prompt_chains(id) ON DELETE CASCADE</code>
- <code>prompt_chain_steps_chain_id_position_key</code>: <code>UNIQUE (chain_id, "position")</code>
- <code>prompt_chain_steps_model_check</code>: <code>CHECK (char_length(model) &gt;= 1 AND char_length(model) &lt;= 100 AND model ~ '^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$'::text AND model !~~ '%://%'::text)</code>
- <code>prompt_chain_steps_model_id_fkey</code>: <code>FOREIGN KEY (model_id) REFERENCES ai_models(id) ON DELETE SET NULL</code>
- <code>prompt_chain_steps_output_type_check</code>: <code>CHECK (output_type = ANY (ARRAY['text'::text, 'image'::text]))</code>
- <code>prompt_chain_steps_pkey</code>: <code>PRIMARY KEY (id)</code>
- <code>prompt_chain_steps_position_check</code>: <code>CHECK ("position" &gt;= 0 AND "position" &lt;= 19)</code>
- <code>prompt_chain_steps_prompt_check</code>: <code>CHECK (char_length(btrim(prompt)) &gt;= 1 AND char_length(btrim(prompt)) &lt;= 12000)</code>
- <code>prompt_chain_steps_title_check</code>: <code>CHECK (char_length(btrim(title)) &gt;= 1 AND char_length(btrim(title)) &lt;= 100)</code>

#### `public.prompt_chains`

Canonical editable chain definitions with optimistic revision checks.

RLS: **enabled**. Primary key: <code>id</code>.

| Column | SQL type | Nullable | Default / generated |
| --- | --- | --- | --- |
| <code>id</code> | <code>uuid</code> | no | <code>gen_random_uuid()</code> |
| <code>name</code> | <code>text</code> | no | — |
| <code>description</code> | <code>text</code> | no | <code>''::text</code> |
| <code>revision</code> | <code>integer</code> | no | <code>1</code> |
| <code>created_by</code> | <code>uuid</code> | no | — |
| <code>created_at</code> | <code>timestamp with time zone</code> | no | <code>now()</code> |
| <code>updated_at</code> | <code>timestamp with time zone</code> | no | <code>now()</code> |

- <code>prompt_chains_created_by_fkey</code>: <code>FOREIGN KEY (created_by) REFERENCES auth.users(id)</code>
- <code>prompt_chains_description_check</code>: <code>CHECK (char_length(description) &lt;= 1000)</code>
- <code>prompt_chains_name_check</code>: <code>CHECK (char_length(btrim(name)) &gt;= 1 AND char_length(btrim(name)) &lt;= 100)</code>
- <code>prompt_chains_pkey</code>: <code>PRIMARY KEY (id)</code>
- <code>prompt_chains_revision_check</code>: <code>CHECK (revision &gt; 0)</code>

#### `public.signup_domain_settings`

Singleton signup restriction switch shared by the domain and email lists.

RLS: **enabled**. Primary key: <code>singleton</code>.

| Column | SQL type | Nullable | Default / generated |
| --- | --- | --- | --- |
| <code>singleton</code> | <code>boolean</code> | no | <code>true</code> |
| <code>restrict_signup</code> | <code>boolean</code> | no | <code>false</code> |
| <code>updated_at</code> | <code>timestamp with time zone</code> | no | <code>now()</code> |
| <code>updated_by</code> | <code>uuid</code> | yes | — |

- <code>signup_domain_settings_pkey</code>: <code>PRIMARY KEY (singleton)</code>
- <code>signup_domain_settings_singleton_check</code>: <code>CHECK (singleton)</code>
- <code>signup_domain_settings_updated_by_fkey</code>: <code>FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL</code>

#### `public.whitelisted_signup_emails`

Normalized exact email exceptions to signup restrictions, managed by admins.

RLS: **enabled**. Primary key: <code>id</code>.

| Column | SQL type | Nullable | Default / generated |
| --- | --- | --- | --- |
| <code>id</code> | <code>uuid</code> | no | <code>gen_random_uuid()</code> |
| <code>email</code> | <code>text</code> | no | — |
| <code>created_at</code> | <code>timestamp with time zone</code> | no | <code>now()</code> |
| <code>updated_at</code> | <code>timestamp with time zone</code> | no | <code>now()</code> |
| <code>updated_by</code> | <code>uuid</code> | yes | — |

- <code>whitelisted_signup_emails_email_check</code>: <code>CHECK (email = lower(btrim(email)) AND char_length(email) &gt;= 3 AND char_length(email) &lt;= 254 AND email ~ '^[^@]+@[^@]+$'::text AND char_length(split_part(email, '@'::text, 1)) &gt;= 1 AND char_length(split_part(email, '@'::text, 1)) &lt;= 64 AND split_part(email, '@'::text, 1) ~ '^[a-z0-9.!#$%&amp;''+/=?^_`{&#124;}~-]+$'::text AND split_part(email, '@'::text, 1) !~ '(^\.&#124;\.$&#124;\.\.)'::text AND split_part(email, '@'::text, 2) ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'::text AND char_length(split_part(split_part(email, '@'::text, 2), '.'::text, '-1'::integer)) &gt;= 2 AND split_part(split_part(email, '@'::text, 2), '.'::text, '-1'::integer) !~ '^[0-9]+$'::text)</code>
- <code>whitelisted_signup_emails_email_key</code>: <code>UNIQUE (email)</code>
- <code>whitelisted_signup_emails_pkey</code>: <code>PRIMARY KEY (id)</code>
- <code>whitelisted_signup_emails_updated_by_fkey</code>: <code>FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL</code>

### Indexes

Includes primary-key/unique backing indexes and partial-index predicates.

- <code>CREATE INDEX caption_publication_receipts_generation_idx ON private.caption_publication_receipts USING btree (generation_id)</code>
- <code>CREATE INDEX caption_publication_receipts_owner_day_idx ON private.caption_publication_receipts USING btree (draft_owner, draft_created_at)</code>
- <code>CREATE UNIQUE INDEX caption_publication_receipts_pkey ON private.caption_publication_receipts USING btree (draft_id)</code>
- <code>CREATE UNIQUE INDEX saved_image_grants_pkey ON private.saved_image_grants USING btree (image_id, user_id)</code>
- <code>CREATE INDEX ai_caption_chain_runs_created_idx ON public.ai_caption_chain_runs USING btree (created_at DESC, id DESC)</code>
- <code>CREATE UNIQUE INDEX ai_caption_chain_runs_pkey ON public.ai_caption_chain_runs USING btree (id)</code>
- <code>CREATE INDEX ai_caption_chain_runs_surface_created_idx ON public.ai_caption_chain_runs USING btree (surface, created_at DESC, id DESC)</code>
- <code>CREATE UNIQUE INDEX ai_caption_prompt_chain_steps_chain_id_position_key ON public.ai_caption_prompt_chain_steps USING btree (chain_id, "position")</code>
- <code>CREATE INDEX ai_caption_prompt_chain_steps_model_id_idx ON public.ai_caption_prompt_chain_steps USING btree (model_id)</code>
- <code>CREATE UNIQUE INDEX ai_caption_prompt_chain_steps_pkey ON public.ai_caption_prompt_chain_steps USING btree (id)</code>
- <code>CREATE UNIQUE INDEX ai_caption_prompt_chains_pkey ON public.ai_caption_prompt_chains USING btree (id)</code>
- <code>CREATE UNIQUE INDEX ai_caption_prompt_chains_surface_key ON public.ai_caption_prompt_chains USING btree (surface)</code>
- <code>CREATE UNIQUE INDEX ai_generation_attempts_pkey ON public.ai_generation_attempts USING btree (id)</code>
- <code>CREATE INDEX ai_generation_attempts_user_date_idx ON public.ai_generation_attempts USING btree (user_id, created_at)</code>
- <code>CREATE UNIQUE INDEX ai_generations_content_key_unique ON public.ai_generations USING btree (content_key) WHERE (content_key IS NOT NULL)</code>
- <code>CREATE INDEX ai_generations_created_at_idx ON public.ai_generations USING btree (created_at DESC, id)</code>
- <code>CREATE INDEX ai_generations_image_path_idx ON public.ai_generations USING btree (image_path) WHERE (image_path IS NOT NULL)</code>
- <code>CREATE UNIQUE INDEX ai_generations_pkey ON public.ai_generations USING btree (id)</code>
- <code>CREATE INDEX ai_generations_user_id_idx ON public.ai_generations USING btree (user_id)</code>
- <code>CREATE INDEX ai_model_defaults_model_id_idx ON public.ai_model_defaults USING btree (model_id)</code>
- <code>CREATE UNIQUE INDEX ai_model_defaults_pkey ON public.ai_model_defaults USING btree (surface)</code>
- <code>CREATE UNIQUE INDEX ai_models_pkey ON public.ai_models USING btree (id)</code>
- <code>CREATE UNIQUE INDEX ai_models_provider_endpoint_model_key ON public.ai_models USING btree (provider, COALESCE(api_base_url, ''::text), model_id)</code>
- <code>CREATE UNIQUE INDEX ai_prompt_templates_one_active_idx ON public.ai_prompt_templates USING btree (is_active) WHERE is_active</code>
- <code>CREATE UNIQUE INDEX ai_prompt_templates_pkey ON public.ai_prompt_templates USING btree (id)</code>
- <code>CREATE UNIQUE INDEX allowed_signup_domains_domain_key ON public.allowed_signup_domains USING btree (domain)</code>
- <code>CREATE UNIQUE INDEX allowed_signup_domains_pkey ON public.allowed_signup_domains USING btree (id)</code>
- <code>CREATE INDEX app_telemetry_events_created_route_idx ON public.app_telemetry_events USING btree (created_at DESC, route, method)</code>
- <code>CREATE UNIQUE INDEX app_telemetry_events_pkey ON public.app_telemetry_events USING btree (id)</code>
- <code>CREATE INDEX app_telemetry_events_status_method_created_idx ON public.app_telemetry_events USING btree (http_status, method, created_at DESC)</code>
- <code>CREATE UNIQUE INDEX caption_comment_likes_pkey ON public.caption_comment_likes USING btree (comment_id, user_id)</code>
- <code>CREATE INDEX caption_comments_generation_created_idx ON public.caption_comments USING btree (generation_id, created_at DESC, id DESC)</code>
- <code>CREATE UNIQUE INDEX caption_comments_pkey ON public.caption_comments USING btree (id)</code>
- <code>CREATE UNIQUE INDEX caption_drafts_content_key_unique ON public.caption_drafts USING btree (content_key) WHERE (content_key IS NOT NULL)</code>
- <code>CREATE INDEX caption_drafts_image_path_idx ON public.caption_drafts USING btree (image_path)</code>
- <code>CREATE INDEX caption_drafts_library_created_idx ON public.caption_drafts USING btree (created_at DESC, id DESC)</code>
- <code>CREATE UNIQUE INDEX caption_drafts_pkey ON public.caption_drafts USING btree (id)</code>
- <code>CREATE INDEX caption_drafts_published_idx ON public.caption_drafts USING btree (published_generation_id) WHERE (published_generation_id IS NOT NULL)</code>
- <code>CREATE INDEX caption_drafts_user_created_idx ON public.caption_drafts USING btree (user_id, created_at DESC)</code>
- <code>CREATE INDEX caption_votes_generation_id_idx ON public.caption_votes USING btree (generation_id)</code>
- <code>CREATE UNIQUE INDEX caption_votes_pkey ON public.caption_votes USING btree (user_id, generation_id)</code>
- <code>CREATE UNIQUE INDEX meme_keyword_assignments_pkey ON public.meme_keyword_assignments USING btree (generation_id, keyword_id)</code>
- <code>CREATE INDEX meme_keyword_assignments_keyword_idx ON public.meme_keyword_assignments USING btree (keyword_id, generation_id)</code>
- <code>CREATE INDEX meme_keyword_assignments_assigned_by_idx ON public.meme_keyword_assignments USING btree (assigned_by) WHERE (assigned_by IS NOT NULL)</code>
- <code>CREATE UNIQUE INDEX meme_keywords_pkey ON public.meme_keywords USING btree (id)</code>
- <code>CREATE UNIQUE INDEX meme_keywords_name_unique ON public.meme_keywords USING btree (lower(name))</code>
- <code>CREATE INDEX meme_keywords_sort_order_idx ON public.meme_keywords USING btree (sort_order, id)</code>
- <code>CREATE INDEX meme_keywords_created_by_idx ON public.meme_keywords USING btree (created_by) WHERE (created_by IS NOT NULL)</code>
- <code>CREATE INDEX meme_keywords_updated_by_idx ON public.meme_keywords USING btree (updated_by) WHERE (updated_by IS NOT NULL)</code>
- <code>CREATE UNIQUE INDEX "Post_pkey" ON public.posts USING btree (id)</code>
- <code>CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (user_id)</code>
- <code>CREATE INDEX prompt_chain_assignments_chain_idx ON public.prompt_chain_assignments USING btree (chain_id)</code>
- <code>CREATE UNIQUE INDEX prompt_chain_assignments_pkey ON public.prompt_chain_assignments USING btree (surface)</code>
- <code>CREATE UNIQUE INDEX prompt_chain_caption_media_chain_id_caption_draft_id_key ON public.prompt_chain_caption_media USING btree (chain_id, caption_draft_id)</code>
- <code>CREATE INDEX prompt_chain_caption_media_creator_idx ON public.prompt_chain_caption_media USING btree (created_by)</code>
- <code>CREATE INDEX prompt_chain_caption_media_draft_idx ON public.prompt_chain_caption_media USING btree (caption_draft_id)</code>
- <code>CREATE INDEX prompt_chain_caption_media_page_idx ON public.prompt_chain_caption_media USING btree (chain_id, created_at DESC, id DESC)</code>
- <code>CREATE UNIQUE INDEX prompt_chain_caption_media_pkey ON public.prompt_chain_caption_media USING btree (id)</code>
- <code>CREATE UNIQUE INDEX prompt_chain_published_media_chain_id_generation_id_key ON public.prompt_chain_published_media USING btree (chain_id, generation_id)</code>
- <code>CREATE INDEX prompt_chain_published_media_creator_idx ON public.prompt_chain_published_media USING btree (created_by)</code>
- <code>CREATE INDEX prompt_chain_published_media_generation_idx ON public.prompt_chain_published_media USING btree (generation_id)</code>
- <code>CREATE INDEX prompt_chain_published_media_page_idx ON public.prompt_chain_published_media USING btree (chain_id, created_at DESC, id DESC)</code>
- <code>CREATE UNIQUE INDEX prompt_chain_published_media_pkey ON public.prompt_chain_published_media USING btree (id)</code>
- <code>CREATE INDEX prompt_chain_output_media_refs_idx ON public.prompt_chain_run_steps USING gin (media)</code>
- <code>CREATE UNIQUE INDEX prompt_chain_run_steps_pkey ON public.prompt_chain_run_steps USING btree (id)</code>
- <code>CREATE UNIQUE INDEX prompt_chain_run_steps_run_id_position_key ON public.prompt_chain_run_steps USING btree (run_id, "position")</code>
- <code>CREATE INDEX prompt_chain_input_media_refs_idx ON public.prompt_chain_runs USING gin (input_media)</code>
- <code>CREATE INDEX prompt_chain_runs_chain_idx ON public.prompt_chain_runs USING btree (chain_id, created_at DESC)</code>
- <code>CREATE INDEX prompt_chain_runs_created_idx ON public.prompt_chain_runs USING btree (created_at DESC)</code>
- <code>CREATE INDEX prompt_chain_runs_creator_idx ON public.prompt_chain_runs USING btree (created_by)</code>
- <code>CREATE UNIQUE INDEX prompt_chain_runs_pkey ON public.prompt_chain_runs USING btree (id)</code>
- <code>CREATE UNIQUE INDEX prompt_chain_steps_chain_id_position_key ON public.prompt_chain_steps USING btree (chain_id, "position")</code>
- <code>CREATE INDEX prompt_chain_steps_model_idx ON public.prompt_chain_steps USING btree (model_id)</code>
- <code>CREATE UNIQUE INDEX prompt_chain_steps_pkey ON public.prompt_chain_steps USING btree (id)</code>
- <code>CREATE INDEX prompt_chains_creator_idx ON public.prompt_chains USING btree (created_by)</code>
- <code>CREATE UNIQUE INDEX prompt_chains_pkey ON public.prompt_chains USING btree (id)</code>
- <code>CREATE INDEX prompt_chains_updated_idx ON public.prompt_chains USING btree (updated_at DESC)</code>
- <code>CREATE UNIQUE INDEX signup_domain_settings_pkey ON public.signup_domain_settings USING btree (singleton)</code>
- <code>CREATE UNIQUE INDEX whitelisted_signup_emails_email_key ON public.whitelisted_signup_emails USING btree (email)</code>
- <code>CREATE UNIQUE INDEX whitelisted_signup_emails_pkey ON public.whitelisted_signup_emails USING btree (id)</code>

### Grants and row-level security

Grants allow operations; RLS and function checks still decide which rows are accessible. A table-level SELECT value of “—” does not rule out SELECT on individual columns. In particular, public profile/caption/comment projections rely on column grants. Avoid `select('*')` on those tables.

| Table | anon table grants | authenticated table grants |
| --- | --- | --- |
| <code>private.caption_publication_receipts</code> | — | — |
| <code>private.saved_image_grants</code> | — | — |
| <code>public.ai_caption_chain_runs</code> | — | SELECT |
| <code>public.ai_caption_prompt_chain_steps</code> | — | — |
| <code>public.ai_caption_prompt_chains</code> | — | — |
| <code>public.ai_generation_attempts</code> | — | SELECT |
| <code>public.ai_generations</code> | — | — |
| <code>public.ai_model_defaults</code> | — | SELECT, INSERT, UPDATE |
| <code>public.ai_models</code> | — | SELECT, INSERT, DELETE |
| <code>public.ai_prompt_templates</code> | — | SELECT, DELETE |
| <code>public.allowed_signup_domains</code> | — | SELECT, DELETE |
| <code>public.app_telemetry_events</code> | — | — |
| <code>public.caption_comment_likes</code> | — | DELETE |
| <code>public.caption_comments</code> | — | — |
| <code>public.caption_drafts</code> | — | SELECT |
| <code>public.caption_votes</code> | — | SELECT, INSERT, DELETE |
| <code>public.meme_keyword_assignments</code> | — | SELECT |
| <code>public.meme_keywords</code> | — | SELECT |
| <code>public.posts</code> | — | SELECT |
| <code>public.profiles</code> | — | — |
| <code>public.prompt_chain_assignments</code> | — | SELECT, INSERT, UPDATE, DELETE |
| <code>public.prompt_chain_caption_media</code> | — | SELECT |
| <code>public.prompt_chain_published_media</code> | — | SELECT |
| <code>public.prompt_chain_run_steps</code> | — | SELECT, INSERT, UPDATE, DELETE |
| <code>public.prompt_chain_runs</code> | — | SELECT, INSERT, UPDATE, DELETE |
| <code>public.prompt_chain_steps</code> | — | SELECT, INSERT, UPDATE, DELETE |
| <code>public.prompt_chains</code> | — | SELECT, INSERT, UPDATE, DELETE |
| <code>public.signup_domain_settings</code> | — | SELECT |
| <code>public.whitelisted_signup_emails</code> | — | SELECT, DELETE |

Column-specific grants are additive to table grants. In the following verified PostgreSQL ACL entries, `r = SELECT`, `a = INSERT`, `w = UPDATE`; `/postgres` identifies the grantor. These entries describe privileges, not example data.

| Table.column | Explicit column ACL |
| --- | --- |
| <code>public.ai_generations.id</code> | <code>{anon=r/postgres,authenticated=r/postgres}</code> |
| <code>public.ai_generations.user_id</code> | <code>{authenticated=a/postgres}</code> |
| <code>public.ai_generations.situation</code> | <code>{anon=r/postgres,authenticated=ar/postgres}</code> |
| <code>public.ai_generations.prompt</code> | <code>{authenticated=a/postgres}</code> |
| <code>public.ai_generations.caption</code> | <code>{anon=r/postgres,authenticated=ar/postgres}</code> |
| <code>public.ai_generations.style</code> | <code>{anon=r/postgres,authenticated=ar/postgres}</code> |
| <code>public.ai_generations.model</code> | <code>{authenticated=a/postgres}</code> |
| <code>public.ai_generations.created_at</code> | <code>{anon=r/postgres,authenticated=r/postgres}</code> |
| <code>public.ai_generations.image_path</code> | <code>{anon=r/postgres,authenticated=ar/postgres}</code> |
| <code>public.ai_models.encrypted_api_key</code> | <code>{authenticated=w/postgres}</code> |
| <code>public.ai_prompt_templates.name</code> | <code>{authenticated=aw/postgres}</code> |
| <code>public.ai_prompt_templates.prompt_template</code> | <code>{authenticated=aw/postgres}</code> |
| <code>public.ai_prompt_templates.created_by</code> | <code>{authenticated=a/postgres}</code> |
| <code>public.ai_prompt_templates.updated_at</code> | <code>{authenticated=w/postgres}</code> |
| <code>public.allowed_signup_domains.domain</code> | <code>{authenticated=aw/postgres}</code> |
| <code>public.caption_comment_likes.comment_id</code> | <code>{authenticated=ar/postgres}</code> |
| <code>public.caption_comment_likes.user_id</code> | <code>{authenticated=a/postgres}</code> |
| <code>public.caption_comments.id</code> | <code>{anon=r/postgres,authenticated=r/postgres}</code> |
| <code>public.caption_comments.generation_id</code> | <code>{anon=r/postgres,authenticated=ar/postgres}</code> |
| <code>public.caption_comments.user_id</code> | <code>{authenticated=a/postgres}</code> |
| <code>public.caption_comments.content</code> | <code>{anon=r/postgres,authenticated=ar/postgres}</code> |
| <code>public.caption_comments.created_at</code> | <code>{anon=r/postgres,authenticated=r/postgres}</code> |
| <code>public.caption_drafts.user_id</code> | <code>{authenticated=a/postgres}</code> |
| <code>public.caption_drafts.image_path</code> | <code>{authenticated=a/postgres}</code> |
| <code>public.caption_drafts.prompt</code> | <code>{authenticated=a/postgres}</code> |
| <code>public.caption_drafts.model</code> | <code>{authenticated=a/postgres}</code> |
| <code>public.caption_drafts.style</code> | <code>{authenticated=a/postgres}</code> |
| <code>public.caption_drafts.captions</code> | <code>{authenticated=a/postgres}</code> |
| <code>public.caption_drafts.edit_revision</code> | <code>{authenticated=r/postgres}</code> |
| <code>public.caption_votes.user_id</code> | <code>{authenticated=w/postgres}</code> |
| <code>public.caption_votes.generation_id</code> | <code>{authenticated=w/postgres}</code> |
| <code>public.caption_votes.value</code> | <code>{authenticated=w/postgres}</code> |
| <code>public.profiles.profile_image</code> | <code>{authenticated=rw/postgres,anon=r/postgres}</code> |
| <code>public.profiles.bio</code> | <code>{anon=r/postgres,authenticated=r/postgres}</code> |
| <code>public.profiles.website</code> | <code>{anon=r/postgres,authenticated=r/postgres}</code> |
| <code>public.profiles.created_at</code> | <code>{anon=r/postgres,authenticated=r/postgres}</code> |
| <code>public.profiles.updated_at</code> | <code>{authenticated=arw/postgres,anon=r/postgres}</code> |
| <code>public.profiles.user_id</code> | <code>{authenticated=ar/postgres,anon=r/postgres}</code> |
| <code>public.profiles.username</code> | <code>{anon=r/postgres,authenticated=r/postgres}</code> |
| <code>public.profiles.f_name</code> | <code>{authenticated=aw/postgres}</code> |
| <code>public.profiles.l_name</code> | <code>{authenticated=aw/postgres}</code> |
| <code>public.profiles.address</code> | <code>{authenticated=aw/postgres}</code> |
| <code>public.profiles.email</code> | <code>{authenticated=aw/postgres}</code> |
| <code>public.profiles.role</code> | <code>{authenticated=r/postgres}</code> |
| <code>public.profiles.is_superadmin</code> | <code>{authenticated=r/postgres}</code> |
| <code>public.prompt_chain_caption_media.chain_id</code> | <code>{authenticated=a/postgres}</code> |
| <code>public.prompt_chain_caption_media.chain_name</code> | <code>{authenticated=a/postgres}</code> |
| <code>public.prompt_chain_caption_media.chain_revision</code> | <code>{authenticated=a/postgres}</code> |
| <code>public.prompt_chain_caption_media.caption_draft_id</code> | <code>{authenticated=a/postgres}</code> |
| <code>public.prompt_chain_caption_media.created_by</code> | <code>{authenticated=a/postgres}</code> |
| <code>public.signup_domain_settings.restrict_signup</code> | <code>{authenticated=w/postgres}</code> |
| <code>public.whitelisted_signup_emails.email</code> | <code>{authenticated=aw/postgres}</code> |

Policies below are the exact catalog predicates. Permissive policies combine with OR; restrictive policies combine with AND. An EXECUTE or table grant is not permission for an agent to perform a write.

| Table | Policy / mode | Operation / roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| <code>public.meme_keyword_assignments</code> | <code>meme_keyword_assignments_admin_read</code> / PERMISSIVE | SELECT / <code>authenticated</code> | <code>((( SELECT auth.uid() AS uid) IS NOT NULL) AND ( SELECT is_admin() AS is_admin))</code> | — |
| <code>public.meme_keywords</code> | <code>meme_keywords_admin_read</code> / PERMISSIVE | SELECT / <code>authenticated</code> | <code>((( SELECT auth.uid() AS uid) IS NOT NULL) AND ( SELECT is_admin() AS is_admin))</code> | — |
| <code>private.saved_image_grants</code> | <code>saved_image_grants_admin</code> / PERMISSIVE | ALL / <code>authenticated</code> | <code>( SELECT is_admin() AS is_admin)</code> | <code>( SELECT is_admin() AS is_admin)</code> |
| <code>public.ai_caption_chain_runs</code> | <code>ai_caption_chain_runs_admin_read</code> / PERMISSIVE | SELECT / <code>authenticated</code> | <code>(( SELECT is_admin() AS is_admin) AND (surface &lt;&gt; 'prompt_studio'::text))</code> | — |
| <code>public.ai_caption_chain_runs</code> | <code>caption_responses_prompt_studio_read</code> / PERMISSIVE | SELECT / <code>authenticated</code> | <code>( SELECT prompt_studio_is_superadmin() AS prompt_studio_is_superadmin)</code> | — |
| <code>public.ai_generation_attempts</code> | <code>caption_attempts_read_self</code> / PERMISSIVE | SELECT / <code>authenticated</code> | <code>(( SELECT auth.uid() AS uid) = user_id)</code> | — |
| <code>public.ai_generations</code> | <code>ai_generations_insert_self</code> / PERMISSIVE | INSERT / <code>authenticated</code> | — | <code>((( SELECT auth.uid() AS uid) = user_id) AND ((image_path IS NULL) OR (((storage.foldername(image_path))[1] = (( SELECT auth.uid() AS uid))::text) AND (array_length(storage.foldername(image_path), 1) = 1) AND (storage.extension(image_path) = ANY (ARRAY['jpg'::text, 'png'::text, 'webp'::text])))))</code> |
| <code>public.ai_generations</code> | <code>ai_generations_read</code> / PERMISSIVE | SELECT / <code>anon</code>, <code>authenticated</code> | <code>true</code> | — |
| <code>public.ai_model_defaults</code> | <code>Admins can change app model defaults</code> / PERMISSIVE | UPDATE / <code>authenticated</code> | <code>( SELECT is_admin() AS is_admin)</code> | <code>( SELECT is_admin() AS is_admin)</code> |
| <code>public.ai_model_defaults</code> | <code>Admins can create app model defaults</code> / PERMISSIVE | INSERT / <code>authenticated</code> | — | <code>( SELECT is_admin() AS is_admin)</code> |
| <code>public.ai_model_defaults</code> | <code>Signed-in users can read app model defaults</code> / PERMISSIVE | SELECT / <code>authenticated</code> | <code>(( SELECT auth.uid() AS uid) IS NOT NULL)</code> | — |
| <code>public.ai_models</code> | <code>Admins can add AI models</code> / PERMISSIVE | INSERT / <code>authenticated</code> | — | <code>( SELECT is_admin() AS is_admin)</code> |
| <code>public.ai_models</code> | <code>Admins can delete AI models</code> / PERMISSIVE | DELETE / <code>authenticated</code> | <code>( SELECT is_admin() AS is_admin)</code> | — |
| <code>public.ai_models</code> | <code>Admins can rotate model API keys</code> / PERMISSIVE | UPDATE / <code>authenticated</code> | <code>( SELECT is_admin() AS is_admin)</code> | <code>( SELECT is_admin() AS is_admin)</code> |
| <code>public.ai_models</code> | <code>Signed-in users can choose AI models</code> / PERMISSIVE | SELECT / <code>authenticated</code> | <code>(( SELECT auth.uid() AS uid) IS NOT NULL)</code> | — |
| <code>public.ai_prompt_templates</code> | <code>ai_prompt_templates_delete_inactive_admin</code> / PERMISSIVE | DELETE / <code>authenticated</code> | <code>(( SELECT is_admin() AS is_admin) AND (NOT is_active))</code> | — |
| <code>public.ai_prompt_templates</code> | <code>ai_prompt_templates_insert_admin</code> / PERMISSIVE | INSERT / <code>authenticated</code> | — | <code>(( SELECT is_admin() AS is_admin) AND (created_by = ( SELECT auth.uid() AS uid)) AND (NOT is_active))</code> |
| <code>public.ai_prompt_templates</code> | <code>ai_prompt_templates_read_active_or_admin</code> / PERMISSIVE | SELECT / <code>authenticated</code> | <code>(is_active OR ( SELECT is_admin() AS is_admin))</code> | — |
| <code>public.ai_prompt_templates</code> | <code>ai_prompt_templates_update_admin</code> / PERMISSIVE | UPDATE / <code>authenticated</code> | <code>( SELECT is_admin() AS is_admin)</code> | <code>( SELECT is_admin() AS is_admin)</code> |
| <code>public.allowed_signup_domains</code> | <code>allowed_signup_domains_admin_delete</code> / PERMISSIVE | DELETE / <code>authenticated</code> | <code>( SELECT is_admin() AS is_admin)</code> | — |
| <code>public.allowed_signup_domains</code> | <code>allowed_signup_domains_admin_insert</code> / PERMISSIVE | INSERT / <code>authenticated</code> | — | <code>( SELECT is_admin() AS is_admin)</code> |
| <code>public.allowed_signup_domains</code> | <code>allowed_signup_domains_admin_read</code> / PERMISSIVE | SELECT / <code>authenticated</code> | <code>( SELECT is_admin() AS is_admin)</code> | — |
| <code>public.allowed_signup_domains</code> | <code>allowed_signup_domains_admin_update</code> / PERMISSIVE | UPDATE / <code>authenticated</code> | <code>( SELECT is_admin() AS is_admin)</code> | <code>( SELECT is_admin() AS is_admin)</code> |
| <code>public.caption_comment_likes</code> | <code>caption_comment_likes_delete_self</code> / PERMISSIVE | DELETE / <code>authenticated</code> | <code>(( SELECT auth.uid() AS uid) = user_id)</code> | — |
| <code>public.caption_comment_likes</code> | <code>caption_comment_likes_insert_self</code> / PERMISSIVE | INSERT / <code>authenticated</code> | — | <code>(( SELECT auth.uid() AS uid) = user_id)</code> |
| <code>public.caption_comment_likes</code> | <code>caption_comment_likes_read_self</code> / PERMISSIVE | SELECT / <code>authenticated</code> | <code>(( SELECT auth.uid() AS uid) = user_id)</code> | — |
| <code>public.caption_comments</code> | <code>caption_comments_insert_self</code> / PERMISSIVE | INSERT / <code>authenticated</code> | — | <code>(( SELECT auth.uid() AS uid) = user_id)</code> |
| <code>public.caption_comments</code> | <code>caption_comments_read_all</code> / PERMISSIVE | SELECT / <code>anon</code>, <code>authenticated</code> | <code>true</code> | — |
| <code>public.caption_drafts</code> | <code>caption_drafts_insert_self</code> / PERMISSIVE | INSERT / <code>authenticated</code> | — | <code>((( SELECT auth.uid() AS uid) = user_id) AND private.can_use_caption_image(image_path))</code> |
| <code>public.caption_drafts</code> | <code>caption_drafts_prompt_studio_read</code> / PERMISSIVE | SELECT / <code>authenticated</code> | <code>( SELECT prompt_studio_is_superadmin() AS prompt_studio_is_superadmin)</code> | — |
| <code>public.caption_drafts</code> | <code>caption_drafts_read_self</code> / PERMISSIVE | SELECT / <code>authenticated</code> | <code>(( SELECT auth.uid() AS uid) = user_id)</code> | — |
| <code>public.caption_votes</code> | <code>caption_votes_delete_self</code> / PERMISSIVE | DELETE / <code>authenticated</code> | <code>(( SELECT auth.uid() AS uid) = user_id)</code> | — |
| <code>public.caption_votes</code> | <code>caption_votes_insert_self</code> / PERMISSIVE | INSERT / <code>authenticated</code> | — | <code>(( SELECT auth.uid() AS uid) = user_id)</code> |
| <code>public.caption_votes</code> | <code>caption_votes_read_self</code> / PERMISSIVE | SELECT / <code>authenticated</code> | <code>(( SELECT auth.uid() AS uid) = user_id)</code> | — |
| <code>public.caption_votes</code> | <code>caption_votes_update_self</code> / PERMISSIVE | UPDATE / <code>authenticated</code> | <code>(( SELECT auth.uid() AS uid) = user_id)</code> | <code>(( SELECT auth.uid() AS uid) = user_id)</code> |
| <code>public.posts</code> | <code>posts_read_authenticated</code> / PERMISSIVE | SELECT / <code>authenticated</code> | <code>true</code> | — |
| <code>public.profiles</code> | <code>profiles_insert_self</code> / PERMISSIVE | INSERT / <code>authenticated</code> | — | <code>(( SELECT auth.uid() AS uid) = user_id)</code> |
| <code>public.profiles</code> | <code>profiles_read_authenticated</code> / PERMISSIVE | SELECT / <code>authenticated</code> | <code>true</code> | — |
| <code>public.profiles</code> | <code>profiles_read_public</code> / PERMISSIVE | SELECT / <code>anon</code>, <code>authenticated</code> | <code>true</code> | — |
| <code>public.profiles</code> | <code>profiles_update_self</code> / PERMISSIVE | UPDATE / <code>authenticated</code> | <code>(( SELECT auth.uid() AS uid) = user_id)</code> | <code>(( SELECT auth.uid() AS uid) = user_id)</code> |
| <code>public.prompt_chain_assignments</code> | <code>prompt_chain_assignments_superadmin</code> / PERMISSIVE | ALL / <code>authenticated</code> | <code>( SELECT prompt_studio_is_superadmin() AS prompt_studio_is_superadmin)</code> | <code>( SELECT prompt_studio_is_superadmin() AS prompt_studio_is_superadmin)</code> |
| <code>public.prompt_chain_caption_media</code> | <code>prompt_chain_caption_media_insert</code> / PERMISSIVE | INSERT / <code>authenticated</code> | — | <code>(( SELECT prompt_studio_is_superadmin() AS prompt_studio_is_superadmin) AND (created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1 FROM caption_drafts d WHERE ((d.id = prompt_chain_caption_media.caption_draft_id) AND (d.user_id = ( SELECT auth.uid() AS uid))))))</code> |
| <code>public.prompt_chain_caption_media</code> | <code>prompt_chain_caption_media_read</code> / PERMISSIVE | SELECT / <code>authenticated</code> | <code>( SELECT prompt_studio_is_superadmin() AS prompt_studio_is_superadmin)</code> | — |
| <code>public.prompt_chain_published_media</code> | <code>prompt_chain_published_media_read</code> / PERMISSIVE | SELECT / <code>authenticated</code> | <code>( SELECT prompt_studio_is_superadmin() AS prompt_studio_is_superadmin)</code> | — |
| <code>public.prompt_chain_run_steps</code> | <code>prompt_chain_outputs_superadmin</code> / PERMISSIVE | ALL / <code>authenticated</code> | <code>( SELECT prompt_studio_is_superadmin() AS prompt_studio_is_superadmin)</code> | <code>( SELECT prompt_studio_is_superadmin() AS prompt_studio_is_superadmin)</code> |
| <code>public.prompt_chain_runs</code> | <code>prompt_chain_runs_superadmin</code> / PERMISSIVE | ALL / <code>authenticated</code> | <code>( SELECT prompt_studio_is_superadmin() AS prompt_studio_is_superadmin)</code> | <code>( SELECT prompt_studio_is_superadmin() AS prompt_studio_is_superadmin)</code> |
| <code>public.prompt_chain_steps</code> | <code>prompt_chain_steps_superadmin</code> / PERMISSIVE | ALL / <code>authenticated</code> | <code>( SELECT prompt_studio_is_superadmin() AS prompt_studio_is_superadmin)</code> | <code>( SELECT prompt_studio_is_superadmin() AS prompt_studio_is_superadmin)</code> |
| <code>public.prompt_chains</code> | <code>prompt_chains_superadmin</code> / PERMISSIVE | ALL / <code>authenticated</code> | <code>( SELECT prompt_studio_is_superadmin() AS prompt_studio_is_superadmin)</code> | <code>( SELECT prompt_studio_is_superadmin() AS prompt_studio_is_superadmin)</code> |
| <code>public.signup_domain_settings</code> | <code>signup_domain_settings_admin_read</code> / PERMISSIVE | SELECT / <code>authenticated</code> | <code>( SELECT is_admin() AS is_admin)</code> | — |
| <code>public.signup_domain_settings</code> | <code>signup_domain_settings_admin_update</code> / PERMISSIVE | UPDATE / <code>authenticated</code> | <code>( SELECT is_admin() AS is_admin)</code> | <code>( SELECT is_admin() AS is_admin)</code> |
| <code>public.whitelisted_signup_emails</code> | <code>whitelisted_signup_emails_admin_delete</code> / PERMISSIVE | DELETE / <code>authenticated</code> | <code>( SELECT is_admin() AS is_admin)</code> | — |
| <code>public.whitelisted_signup_emails</code> | <code>whitelisted_signup_emails_admin_insert</code> / PERMISSIVE | INSERT / <code>authenticated</code> | — | <code>( SELECT is_admin() AS is_admin)</code> |
| <code>public.whitelisted_signup_emails</code> | <code>whitelisted_signup_emails_admin_read</code> / PERMISSIVE | SELECT / <code>authenticated</code> | <code>( SELECT is_admin() AS is_admin)</code> | — |
| <code>public.whitelisted_signup_emails</code> | <code>whitelisted_signup_emails_admin_update</code> / PERMISSIVE | UPDATE / <code>authenticated</code> | <code>( SELECT is_admin() AS is_admin)</code> | <code>( SELECT is_admin() AS is_admin)</code> |
| <code>storage.objects</code> | <code>Give anon users access to JPG images in folder qzf2z0_0</code> / PERMISSIVE | SELECT / <code>public</code> | <code>((bucket_id = 'profile pictures'::text) AND (storage.extension(name) = 'jpg'::text) AND (lower((storage.foldername(name))[1]) = 'public'::text) AND (auth.role() = 'anon'::text))</code> | — |
| <code>storage.objects</code> | <code>admin_images_delete</code> / PERMISSIVE | DELETE / <code>authenticated</code> | <code>((bucket_id = ANY (ARRAY['caption-images'::text, 'profile-photos'::text, 'profile pictures'::text])) AND ( SELECT is_admin() AS is_admin))</code> | — |
| <code>storage.objects</code> | <code>admin_images_insert</code> / PERMISSIVE | INSERT / <code>authenticated</code> | — | <code>((bucket_id = ANY (ARRAY['caption-images'::text, 'profile-photos'::text, 'profile pictures'::text])) AND ( SELECT is_admin() AS is_admin) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) AND (array_length(storage.foldername(name), 1) = 1) AND (storage.extension(name) = ANY (ARRAY['jpg'::text, 'png'::text, 'webp'::text])))</code> |
| <code>storage.objects</code> | <code>admin_images_preserve_location</code> / RESTRICTIVE | UPDATE / <code>authenticated</code> | — | <code>((NOT ( SELECT is_admin() AS is_admin)) OR private.admin_storage_location_unchanged(id, bucket_id, name))</code> |
| <code>storage.objects</code> | <code>admin_images_protect_references</code> / RESTRICTIVE | DELETE / <code>authenticated</code> | <code>((NOT ( SELECT is_admin() AS is_admin)) OR (bucket_id &lt;&gt; ALL (ARRAY['caption-images'::text, 'profile-photos'::text, 'profile pictures'::text])) OR (private.admin_image_reference_count(bucket_id, name) = 0))</code> | — |
| <code>storage.objects</code> | <code>admin_images_read</code> / PERMISSIVE | SELECT / <code>authenticated</code> | <code>((bucket_id = ANY (ARRAY['caption-images'::text, 'profile-photos'::text, 'profile pictures'::text])) AND ( SELECT is_admin() AS is_admin))</code> | — |
| <code>storage.objects</code> | <code>admin_images_update</code> / PERMISSIVE | UPDATE / <code>authenticated</code> | <code>((bucket_id = ANY (ARRAY['caption-images'::text, 'profile-photos'::text, 'profile pictures'::text])) AND ( SELECT is_admin() AS is_admin))</code> | <code>((bucket_id = ANY (ARRAY['caption-images'::text, 'profile-photos'::text, 'profile pictures'::text])) AND ( SELECT is_admin() AS is_admin))</code> |
| <code>storage.objects</code> | <code>caption_images_owner_cleanup</code> / PERMISSIVE | DELETE / <code>authenticated</code> | <code>((bucket_id = 'caption-images'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) AND (NOT (EXISTS ( SELECT 1 FROM ai_generations g WHERE (g.image_path = objects.name)))) AND (NOT (EXISTS ( SELECT 1 FROM caption_drafts d WHERE (d.image_path = objects.name)))))</code> | — |
| <code>storage.objects</code> | <code>caption_images_owner_insert</code> / PERMISSIVE | INSERT / <code>authenticated</code> | — | <code>((bucket_id = 'caption-images'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) AND (array_length(storage.foldername(name), 1) = 1) AND (storage.extension(name) = ANY (ARRAY['jpg'::text, 'png'::text, 'webp'::text])))</code> |
| <code>storage.objects</code> | <code>caption_images_owner_read</code> / PERMISSIVE | SELECT / <code>authenticated</code> | <code>((bucket_id = 'caption-images'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text))</code> | — |
| <code>storage.objects</code> | <code>caption_images_prompt_studio_read</code> / PERMISSIVE | SELECT / <code>authenticated</code> | <code>((bucket_id = 'caption-images'::text) AND ( SELECT prompt_studio_is_superadmin() AS prompt_studio_is_superadmin))</code> | — |
| <code>storage.objects</code> | <code>caption_images_read_own_drafts</code> / PERMISSIVE | SELECT / <code>authenticated</code> | <code>((bucket_id = 'caption-images'::text) AND (EXISTS ( SELECT 1 FROM caption_drafts d WHERE ((d.user_id = ( SELECT auth.uid() AS uid)) AND (d.image_path = objects.name)))))</code> | — |
| <code>storage.objects</code> | <code>caption_images_read_published</code> / PERMISSIVE | SELECT / <code>anon</code>, <code>authenticated</code> | <code>((bucket_id = 'caption-images'::text) AND (EXISTS ( SELECT 1 FROM ai_generations g WHERE (g.image_path = objects.name))))</code> | — |
| <code>storage.objects</code> | <code>profile_photos_owner_delete</code> / PERMISSIVE | DELETE / <code>authenticated</code> | <code>((bucket_id = 'profile-photos'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text))</code> | — |
| <code>storage.objects</code> | <code>profile_photos_owner_insert</code> / PERMISSIVE | INSERT / <code>authenticated</code> | — | <code>((bucket_id = 'profile-photos'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text))</code> |
| <code>storage.objects</code> | <code>profile_photos_owner_update</code> / PERMISSIVE | UPDATE / <code>authenticated</code> | <code>((bucket_id = 'profile-photos'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text))</code> | <code>((bucket_id = 'profile-photos'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text))</code> |
| <code>storage.objects</code> | <code>profile_photos_public_read</code> / PERMISSIVE | SELECT / <code>public</code> | <code>(bucket_id = 'profile-photos'::text)</code> | — |
| <code>storage.objects</code> | <code>prompt_studio_media_delete</code> / PERMISSIVE | DELETE / <code>authenticated</code> | <code>((bucket_id = 'prompt-chain-media'::text) AND ( SELECT prompt_studio_is_superadmin() AS prompt_studio_is_superadmin))</code> | — |
| <code>storage.objects</code> | <code>prompt_studio_media_insert</code> / PERMISSIVE | INSERT / <code>authenticated</code> | — | <code>((bucket_id = 'prompt-chain-media'::text) AND ( SELECT prompt_studio_is_superadmin() AS prompt_studio_is_superadmin))</code> |
| <code>storage.objects</code> | <code>prompt_studio_media_read</code> / PERMISSIVE | SELECT / <code>authenticated</code> | <code>((bucket_id = 'prompt-chain-media'::text) AND ( SELECT prompt_studio_is_superadmin() AS prompt_studio_is_superadmin))</code> | — |
| <code>storage.objects</code> | <code>saved_images_granted_read</code> / PERMISSIVE | SELECT / <code>authenticated</code> | <code>((bucket_id = ANY (ARRAY['caption-images'::text, 'profile-photos'::text, 'profile pictures'::text])) AND private.has_saved_image_grant(id))</code> | — |
| <code>storage.objects</code> | <code>saved_images_protect_all_references</code> / RESTRICTIVE | DELETE / <code>authenticated</code> | <code>((bucket_id &lt;&gt; ALL (ARRAY['caption-images'::text, 'profile-photos'::text, 'profile pictures'::text])) OR private.saved_image_is_unused(id))</code> | — |

### Functions and RPC signatures

All public/private functions are listed, including trigger functions and legacy RPCs. Identity arguments omit defaults. “Definer” runs with the owner's privileges and requires its internal authorization checks; “invoker” uses caller privileges. EXECUTE grants below are effective role grants only: schema USAGE, RLS, column privileges, and the function body still apply. Private helpers are internal implementation details. Do not call a mutating RPC without user authorization.

| Function (identity arguments) | Returns | Security | EXECUTE granted to |
| --- | --- | --- | --- |
| <code>private.admin_delete_meme_keyword(p_id uuid, p_expected_revision integer)</code> | <code>boolean</code> | definer | authenticated |
| <code>private.admin_reorder_meme_keywords(p_ids uuid[], p_expected_ids uuid[])</code> | <code>boolean</code> | definer | authenticated |
| <code>private.admin_save_meme_keyword(p_id uuid, p_name text, p_description text, p_active boolean, p_expected_revision integer)</code> | <code>uuid</code> | definer | authenticated |
| <code>private.admin_set_meme_keywords(p_generation_id uuid, p_keyword_ids uuid[], p_expected_keyword_ids uuid[])</code> | <code>boolean</code> | definer | authenticated |
| <code>public.admin_delete_meme_keyword(p_id uuid, p_expected_revision integer)</code> | <code>boolean</code> | invoker | authenticated |
| <code>public.admin_reorder_meme_keywords(p_ids uuid[], p_expected_ids uuid[])</code> | <code>boolean</code> | invoker | authenticated |
| <code>public.admin_save_meme_keyword(p_id uuid, p_name text, p_description text, p_active boolean, p_expected_revision integer)</code> | <code>uuid</code> | invoker | authenticated |
| <code>public.admin_set_meme_keywords(p_generation_id uuid, p_keyword_ids uuid[], p_expected_keyword_ids uuid[])</code> | <code>boolean</code> | invoker | authenticated |
| <code>public.admin_list_keyword_memes(p_keyword_id uuid, p_offset integer)</code> | <code>jsonb</code> | invoker | authenticated |
| <code>public.admin_list_meme_keywords()</code> | <code>jsonb</code> | invoker | authenticated |
| <code>private.admin_delete_linked_caption(p_image_id uuid, p_caption_id uuid)</code> | <code>boolean</code> | definer | authenticated |
| <code>private.admin_delete_linked_draft(p_image_id uuid, p_draft_id uuid)</code> | <code>boolean</code> | definer | authenticated |
| <code>private.admin_image_linked_records(p_image_id uuid, p_offset integer)</code> | <code>jsonb</code> | definer | authenticated |
| <code>private.admin_image_reference_count(p_bucket text, p_name text)</code> | <code>bigint</code> | definer | authenticated |
| <code>private.admin_relink_saved_image(p_target_id uuid, p_source_id uuid)</code> | <code>jsonb</code> | definer | authenticated |
| <code>private.admin_save_linked_caption(p_image_id uuid, p_caption_id uuid, p_caption text, p_style text, p_image_path text)</code> | <code>uuid</code> | definer | authenticated |
| <code>private.admin_save_linked_draft(p_image_id uuid, p_draft_id uuid, p_captions text[], p_style text, p_image_path text)</code> | <code>uuid</code> | definer | authenticated |
| <code>private.admin_storage_images(p_bucket text, p_search text, p_offset integer, p_id uuid)</code> | <code>jsonb</code> | definer | authenticated |
| <code>private.admin_storage_location_unchanged(p_id uuid, p_bucket text, p_name text)</code> | <code>boolean</code> | definer | authenticated |
| <code>private.can_use_caption_image(p_name text)</code> | <code>boolean</code> | definer | authenticated |
| <code>private.caption_draft_content_key()</code> | <code>trigger</code> | invoker | neither anon nor authenticated |
| <code>private.caption_draft_daily_usage(p_user uuid)</code> | <code>bigint</code> | invoker | neither anon nor authenticated |
| <code>private.caption_draft_edit_revision()</code> | <code>trigger</code> | invoker | neither anon nor authenticated |
| <code>private.caption_generation_content_key()</code> | <code>trigger</code> | invoker | neither anon nor authenticated |
| <code>private.caption_publication_cleanup()</code> | <code>trigger</code> | definer | neither anon nor authenticated |
| <code>private.caption_publication_owner_lock()</code> | <code>trigger</code> | invoker | neither anon nor authenticated |
| <code>private.caption_result_key(p_user uuid, p_image text, p_style text, p_captions text[])</code> | <code>text</code> | invoker | authenticated |
| <code>private.has_saved_image_grant(p_id uuid)</code> | <code>boolean</code> | definer | authenticated |
| <code>private.image_reference_matches(p_value text, p_bucket text, p_name text, p_id uuid)</code> | <code>boolean</code> | invoker | neither anon nor authenticated |
| <code>private.image_reference_total(p_bucket text, p_name text, p_id uuid)</code> | <code>bigint</code> | invoker | neither anon nor authenticated |
| <code>private.prompt_chain_run_revision()</code> | <code>trigger</code> | invoker | neither anon nor authenticated |
| <code>private.retire_published_caption_drafts(p_generation_id uuid)</code> | <code>void</code> | definer | neither anon nor authenticated |
| <code>private.saved_image_is_unused(p_id uuid)</code> | <code>boolean</code> | definer | authenticated |
| <code>private.saved_image_visible_to(p_id uuid, p_user uuid)</code> | <code>boolean</code> | invoker | neither anon nor authenticated |
| <code>private.studio_delete_caption_draft(p_draft_id uuid, p_expected_revision integer)</code> | <code>boolean</code> | definer | authenticated |
| <code>private.studio_publish_caption_draft(p_draft_id uuid, p_choice_index integer, p_expected_revision integer)</code> | <code>uuid</code> | definer | authenticated |
| <code>private.studio_update_caption_draft(p_draft_id uuid, p_expected_revision integer, p_captions text[], p_style text, p_prompt text, p_model text, p_image_path text)</code> | <code>uuid</code> | definer | authenticated |
| <code>public.activate_ai_prompt_template(p_prompt_id uuid)</code> | <code>uuid</code> | definer | authenticated |
| <code>public.admin_create_image_generation(p_user_id uuid, p_caption text, p_situation text, p_style text, p_model text, p_prompt text, p_image_path text)</code> | <code>uuid</code> | definer | authenticated |
| <code>public.admin_delete_generation(p_id uuid)</code> | <code>boolean</code> | definer | authenticated |
| <code>public.admin_delete_linked_caption(p_image_id uuid, p_caption_id uuid)</code> | <code>boolean</code> | invoker | authenticated |
| <code>public.admin_delete_linked_draft(p_image_id uuid, p_draft_id uuid)</code> | <code>boolean</code> | invoker | authenticated |
| <code>public.admin_get_image_linked_records(p_image_id uuid, p_offset integer)</code> | <code>jsonb</code> | invoker | authenticated |
| <code>public.admin_get_storage_image(p_id uuid)</code> | <code>jsonb</code> | invoker | authenticated |
| <code>public.admin_list_caption_prompt_chains()</code> | <code>jsonb</code> | definer | authenticated |
| <code>public.admin_list_storage_images(p_bucket text, p_search text, p_offset integer)</code> | <code>jsonb</code> | invoker | authenticated |
| <code>public.admin_relink_saved_image(p_target_id uuid, p_source_id uuid)</code> | <code>jsonb</code> | invoker | authenticated |
| <code>public.admin_save_caption_prompt_chain(p_surface text, p_execution_mode text, p_steps jsonb)</code> | <code>jsonb</code> | definer | authenticated |
| <code>public.admin_save_generation(p_id uuid, p_user_id uuid, p_caption text, p_situation text, p_style text, p_model text)</code> | <code>uuid</code> | definer | authenticated |
| <code>public.admin_save_linked_caption(p_image_id uuid, p_caption_id uuid, p_caption text, p_style text, p_image_path text)</code> | <code>uuid</code> | invoker | authenticated |
| <code>public.admin_save_linked_draft(p_image_id uuid, p_draft_id uuid, p_captions text[], p_style text, p_image_path text)</code> | <code>uuid</code> | invoker | authenticated |
| <code>public.assign_prompt_chain(p_surface text, p_chain_id uuid, p_expected_chain_id uuid, p_expected_updated_at timestamp with time zone, p_revision integer)</code> | <code>jsonb</code> | invoker | authenticated |
| <code>public.caption_comment_like_counts(comment_ids uuid[])</code> | <code>TABLE(comment_id uuid, likes bigint)</code> | definer | anon, authenticated |
| <code>public.caption_scores(generation_ids uuid[])</code> | <code>TABLE(generation_id uuid, score bigint)</code> | definer | anon, authenticated |
| <code>public.caption_vote_counts(generation_ids uuid[])</code> | <code>TABLE(generation_id uuid, likes bigint, dislikes bigint)</code> | definer | anon, authenticated |
| <code>public.claim_caption_attempt()</code> | <code>boolean</code> | definer | authenticated |
| <code>public.claim_prompt_chain_step(p_run_id uuid, p_retry boolean)</code> | <code>jsonb</code> | invoker | authenticated |
| <code>public.delete_ai_prompt_template(p_prompt_id uuid)</code> | <code>uuid</code> | definer | authenticated |
| <code>public.delete_prompt_chain_run(p_id uuid, p_revision integer)</code> | <code>boolean</code> | invoker | authenticated |
| <code>public.enforce_signup_email_domain()</code> | <code>trigger</code> | definer | neither anon nor authenticated |
| <code>public.enforce_successful_caption_quota()</code> | <code>trigger</code> | definer | neither anon nor authenticated |
| <code>public.finish_prompt_chain_step(p_run_id uuid, p_token uuid, p_output jsonb)</code> | <code>void</code> | invoker | authenticated |
| <code>public.get_admin_dashboard()</code> | <code>jsonb</code> | definer | authenticated |
| <code>public.get_admin_operations_metrics(p_window_hours integer)</code> | <code>jsonb</code> | definer | authenticated |
| <code>public.get_admin_operations_request_page(p_window_hours integer, p_status_class text, p_method text, p_route text, p_sort_by text, p_sort_direction text, p_limit integer, p_offset integer)</code> | <code>jsonb</code> | definer | authenticated |
| <code>public.get_admin_panel_caption_prompt_chain()</code> | <code>jsonb</code> | definer | authenticated |
| <code>public.get_humor_project_caption_prompt_chain()</code> | <code>jsonb</code> | definer | authenticated |
| <code>public.get_my_profile_details()</code> | <code>jsonb</code> | definer | authenticated |
| <code>public.get_prompt_chain_for_surface(p_surface text, p_include_disabled boolean)</code> | <code>jsonb</code> | definer | authenticated |
| <code>public.get_saved_image(p_image_id uuid)</code> | <code>jsonb</code> | invoker | anon, authenticated |
| <code>public.handle_new_auth_user()</code> | <code>trigger</code> | definer | neither anon nor authenticated |
| <code>public.handle_new_user()</code> | <code>trigger</code> | definer | neither anon nor authenticated |
| <code>public.is_admin()</code> | <code>boolean</code> | definer | authenticated |
| <code>public.is_signup_email_allowed(p_email text)</code> | <code>boolean</code> | definer | anon, authenticated |
| <code>public.link_prompt_chain_caption_media(p_chain_id uuid, p_chain_name text, p_chain_revision integer, p_draft_id uuid)</code> | <code>void</code> | invoker | authenticated |
| <code>public.list_saved_images(p_bucket text, p_offset integer, p_exclude_id uuid)</code> | <code>jsonb</code> | invoker | authenticated |
| <code>public.prompt_studio_is_superadmin()</code> | <code>boolean</code> | invoker | authenticated |
| <code>public.publish_caption_choice(draft_id uuid, choice_index integer)</code> | <code>uuid</code> | definer | authenticated |
| <code>public.ranked_caption_feed()</code> | <code>TABLE(id uuid, situation text, caption text, style text, created_at timestamp with time zone, image_path text)</code> | definer | anon, authenticated |
| <code>public.record_app_telemetry(p_route text, p_method text, p_success boolean, p_duration_ms integer, p_error_category text, p_provider_status integer, p_model text)</code> | <code>void</code> | definer | authenticated |
| <code>public.record_app_telemetry_v2(p_route text, p_method text, p_success boolean, p_duration_ms integer, p_http_status integer, p_error_category text, p_provider_status integer, p_model text)</code> | <code>void</code> | definer | authenticated |
| <code>public.record_app_telemetry_v3(p_route text, p_method text, p_success boolean, p_duration_ms integer, p_http_status integer, p_error_category text, p_provider_status integer, p_model text, p_chain_context jsonb)</code> | <code>void</code> | definer | authenticated |
| <code>public.record_caption_chain_run(p_surface text, p_status text, p_duration_ms integer, p_steps jsonb, p_failure_phase text)</code> | <code>void</code> | definer | authenticated |
| <code>public.save_caption_chain(p_surface text, p_id uuid, p_revision integer, p_name text, p_description text, p_steps jsonb)</code> | <code>uuid</code> | invoker | authenticated |
| <code>public.save_caption_draft(p_image_path text, p_prompt text, p_model text, p_style text, p_captions text[])</code> | <code>uuid</code> | invoker | authenticated |
| <code>public.save_prompt_chain(p_id uuid, p_revision integer, p_name text, p_description text, p_steps jsonb)</code> | <code>uuid</code> | invoker | authenticated |
| <code>public.stamp_signup_domain_change()</code> | <code>trigger</code> | invoker | neither anon nor authenticated |
| <code>public.studio_delete_caption_draft(p_draft_id uuid, p_expected_revision integer)</code> | <code>boolean</code> | invoker | authenticated |
| <code>public.studio_publish_caption_draft(p_draft_id uuid, p_choice_index integer, p_expected_revision integer)</code> | <code>uuid</code> | invoker | authenticated |
| <code>public.studio_update_caption_draft(p_draft_id uuid, p_expected_revision integer, p_captions text[], p_style text, p_prompt text, p_model text, p_image_path text)</code> | <code>uuid</code> | invoker | authenticated |
| <code>public.update_prompt_chain_run(p_id uuid, p_revision integer, p_name text, p_input text, p_notes text)</code> | <code>uuid</code> | invoker | authenticated |
| <code>public.valid_caption_draft_options(options text[])</code> | <code>boolean</code> | invoker | authenticated |

### Keyword catalog seed and mutation contract

Applied reference: **`20261118015223_admin_meme_keywords`**; execution date **2026-11-17 America/New_York** (**2026-11-18 UTC**). The user approved applying the prepared setup to the current shared project `apbmaxmpvkaltywewlsh`; this scope covered the two tables, ten functions, related indexes/access controls, and eight seed catalog labels only.

The approved activation seeds only the catalog below, with `active = true`, `revision = 1`, and null initial audit-user references. Read-only verification found eight catalog entries and zero pair assignments after migration. Existing captions, drafts, images, and AI contracts were not backfilled or changed.

| Order | Keyword | AI definition |
| --- | --- | --- |
| 0 | Academics | Classes, studying, exams, and assignments. |
| 1 | Campus life | Dorms, clubs, and the everyday campus experience. |
| 2 | Food & drink | Meals, coffee, cooking, and dining. |
| 3 | Transportation | Subways, commuting, traffic, and getting around. |
| 4 | Relationships | Friends, dating, family, and social connections. |
| 5 | Work | Jobs, internships, meetings, and workplace life. |
| 6 | Money | Budgets, spending, saving, and the cost of living. |
| 7 | Everyday life | Daily routines, small frustrations, and familiar moments. |

- Every keyword operation requires a non-null `auth.uid()` and `public.is_admin()`. New functions use an empty `search_path`; only the four private mutation functions are SECURITY DEFINER. The public mutation RPCs are SECURITY INVOKER wrappers. Both read RPCs are STABLE SECURITY INVOKER and obey table RLS. Public/anon execution is revoked; authenticated execution remains guarded by the function body. Existing authenticated `USAGE` on `private` is unchanged.
- Both keyword tables grant authenticated SELECT under admin-only policies, with no anon access or direct client INSERT/UPDATE/DELETE grants. Database writes use the guarded mutation RPCs. No new triggers, Auth/Storage changes, or service-role requirement are introduced.
- `admin_list_meme_keywords()` returns the complete ordered catalog and per-keyword published-pair usage counts. `admin_list_keyword_memes()` accepts null for all published pairs or a catalog UUID (including an inactive historical keyword); offset is 0–1,000,000 and pages contain at most 12 pairs.
- `admin_save_meme_keyword()` creates when `p_id` and expected revision are null; otherwise it locks the row and compares the expected revision before editing. Names are trimmed and whitespace-normalized, definitions are trimmed, case-insensitive duplicate names are rejected, and the catalog is capped at 500 entries. Edits increment `revision` and update audit fields.
- `admin_reorder_meme_keywords()` compares the expected complete order, requires every catalog UUID exactly once, and writes zero-based order positions. Moved entries receive a new revision and audit timestamp. `admin_delete_meme_keyword()` compares the expected revision and deletes only an unused keyword; used entries must be deactivated.
- `admin_set_meme_keywords()` compares the expected prior assignment set for a published generation before replacing it with zero to four distinct catalog UUIDs. New assignments require active keywords; already-associated inactive keywords may be retained or removed. Saved associations record `source = 'admin'` and the acting admin. Tags on another generation remain independent even when the image is shared.
- All four mutation helpers take the same catalog advisory transaction lock before row locks. Stale revision/order/set comparisons raise SQLSTATE `40001`; invalid input uses `22023`, missing records `P0002`, non-admin access `42501`, and attempted deletion of a used keyword `23503`.

Read-only activation checks: under an authenticated admin JWT context, the catalog returned all eight entries, published-pair browsing returned 41 existing memes with a 12-item first page, all usage counts were zero, and the first keyword filter returned no pairs. Under authenticated non-admin synthetic claims, both listing RPCs raised `42501` and direct RLS-filtered reads exposed zero rows from either new table. These transactions used `BEGIN READ ONLY` and were rolled back without mutations. Security-advisor finding identities were unchanged (36 before/36 after), with no keyword-related findings.

### Application and Auth triggers

These are observed trigger definitions. Built-in Supabase Storage lifecycle/protection triggers are managed platform internals and omitted here. Do not remove or reconcile triggers solely from older SQL files.

- <code>CREATE TRIGGER enforce_signup_email_domain BEFORE INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION enforce_signup_email_domain()</code>
- <code>CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user()</code>
- <code>CREATE TRIGGER on_auth_user_created_profile AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user()</code>
- <code>CREATE TRIGGER ai_generations_consume_drafts AFTER INSERT ON ai_generations FOR EACH ROW EXECUTE FUNCTION private.caption_publication_cleanup()</code>
- <code>CREATE TRIGGER ai_generations_publication_lock BEFORE INSERT ON ai_generations FOR EACH ROW EXECUTE FUNCTION private.caption_publication_owner_lock()</code>
- <code>CREATE TRIGGER ai_generations_set_content_key BEFORE INSERT OR UPDATE OF user_id, image_path, style, caption ON ai_generations FOR EACH ROW EXECUTE FUNCTION private.caption_generation_content_key()</code>
- <code>CREATE TRIGGER stamp_allowed_signup_domain BEFORE INSERT OR UPDATE OF domain ON allowed_signup_domains FOR EACH ROW EXECUTE FUNCTION stamp_signup_domain_change()</code>
- <code>CREATE TRIGGER caption_drafts_edit_revision BEFORE INSERT OR UPDATE ON caption_drafts FOR EACH ROW EXECUTE FUNCTION private.caption_draft_edit_revision()</code>
- <code>CREATE TRIGGER caption_drafts_set_content_key BEFORE INSERT OR UPDATE OF user_id, image_path, style, captions ON caption_drafts FOR EACH ROW EXECUTE FUNCTION private.caption_draft_content_key()</code>
- <code>CREATE TRIGGER successful_caption_quota BEFORE INSERT ON caption_drafts FOR EACH ROW EXECUTE FUNCTION enforce_successful_caption_quota()</code>
- <code>CREATE TRIGGER prompt_chain_run_revision BEFORE INSERT OR UPDATE ON prompt_chain_runs FOR EACH ROW EXECUTE FUNCTION private.prompt_chain_run_revision()</code>
- <code>CREATE TRIGGER stamp_signup_domain_setting BEFORE UPDATE OF restrict_signup ON signup_domain_settings FOR EACH ROW EXECUTE FUNCTION stamp_signup_domain_change()</code>
- <code>CREATE TRIGGER stamp_whitelisted_signup_email BEFORE INSERT OR UPDATE OF email ON whitelisted_signup_emails FOR EACH ROW EXECUTE FUNCTION stamp_signup_domain_change()</code>

### Storage

Object identity is `(bucket_id, name)` plus the Storage object UUID used by image RPCs. New shared caption/Studio uploads use `caption-images`; older Studio objects remain in `prompt-chain-media`. An image can be referenced by multiple records and apps. Use the Storage API for authorized object mutations; do not mutate Storage bytes/metadata through SQL.

| Bucket | Public | Database size limit | Allowed MIME types |
| --- | --- | --- | --- |
| <code>caption-images</code> | no | 3145728 bytes | <code>image/jpeg</code>, <code>image/png</code>, <code>image/webp</code> |
| <code>profile pictures</code> | no | not set | <code>image/*</code> |
| <code>profile-photos</code> | yes | 5242880 bytes | <code>image/jpeg</code>, <code>image/png</code>, <code>image/webp</code>, <code>image/gif</code> |
| <code>prompt-chain-media</code> | no | 10485760 bytes | <code>image/png</code>, <code>image/jpeg</code>, <code>image/webp</code> |

Bucket limits above are live database settings. Application forms may enforce stricter limits (for example 3 MiB). Private media uses short-lived signed links; public `profile-photos` has a different visibility contract. Storage object policies are included in the RLS table above.

### Applied migration history

Live history is shown for provenance. Some older local SQL filenames/version timestamps differ from live history; SQL files are not proof that a change is applied. Never reapply them without approval and checking the target state.

| Version | Name |
| --- | --- |
| <code>20261001203142</code> | <code>create_profile_on_auth_user_insert</code> |
| <code>20261001210559</code> | <code>populate_profile_names_on_signup</code> |
| <code>20261008194701</code> | <code>ai_captions_votes_and_strict_rls</code> |
| <code>20261008201115</code> | <code>caption_image_uploads</code> |
| <code>20261008201705</code> | <code>private_caption_choices_and_publication</code> |
| <code>20261008215753</code> | <code>private_caption_persona</code> |
| <code>20261027201307</code> | <code>shared_ai_models</code> |
| <code>20261027202847</code> | <code>multi_provider_ai_models</code> |
| <code>20261027205526</code> | <code>prompt_link_models</code> |
| <code>20261027212029</code> | <code>caption_chain_failure_diagnostics</code> |
| <code>20261028020704</code> | <code>multi_style_caption_choices</code> |
| <code>20261028025444</code> | <code>admin_chain_response_history</code> |
| <code>20261028034832</code> | <code>allowed_signup_domains</code> |
| <code>20261028043743</code> | <code>whitelisted_signup_emails</code> |
| <code>20261028052530</code> | <code>admin_image_library</code> |
| <code>20261028053320</code> | <code>fix_admin_image_reference_matching</code> |
| <code>20261028055945</code> | <code>admin_image_linked_records</code> |
| <code>20261028061633</code> | <code>saved_image_selection</code> |
| <code>20261028075854</code> | <code>admin_linked_caption_management</code> |
| <code>20261028202925</code> | <code>admin_linked_draft_management</code> |
| <code>20261104192446</code> | <code>prompt_studio_superadmin_chains_and_runs</code> |
| <code>20261104230358</code> | <code>prompt_chain_shared_model_catalog</code> |
| <code>20261104233732</code> | <code>centralized_caption_chains</code> |
| <code>20261104235805</code> | <code>preserve_legacy_caption_model_guard_until_cutover</code> |
| <code>20261105003449</code> | <code>prompt_studio_application_chain_selection</code> |
| <code>20261105182453</code> | <code>unified_caption_media_storage_and_idempotent_saves</code> |
| <code>20261105183544</code> | <code>include_studio_in_shared_image_reference_tools</code> |
| <code>20261105183905</code> | <code>caption_media_chain_associations</code> |
| <code>20261105184942</code> | <code>protect_prompt_studio_response_history</code> |
| <code>20261105185059</code> | <code>block_duplicate_caption_edits</code> |
| <code>20261105185940</code> | <code>prompt_studio_caption_draft_crud</code> |
| <code>20261105191201</code> | <code>publish_shared_drafts_from_prompt_studio</code> |
| <code>20261105194242</code> | <code>consume_drafts_after_publication_across_apps</code> |
| <code>20261105194243</code> | <code>manage_general_chain_run_metadata_and_deletion</code> |
| <code>20261118015223</code> | <code>admin_meme_keywords</code> |

### Change log

| Date | Change | Verification |
| --- | --- | --- |
| 2026-11-17 | Created the shared documentation baseline. No schema, data, Auth, or Storage changes were made. | Read-only metadata from project `apbmaxmpvkaltywewlsh`; latest applied migration `20261105194243_manage_general_chain_run_metadata_and_deletion`. |
| 2026-11-17 | Applied the user-approved prepared Admin keyword setup to shared project `apbmaxmpvkaltywewlsh` (current shared environment): `meme_keywords`, `meme_keyword_assignments`, eight catalog seed rows, ten functions, indexes, admin-only RLS/grants. Migration `20261118015223_admin_meme_keywords`; source `HP_admin_panel/database/meme-keywords.sql`. Approval scope was this prepared setup only; no existing-pair backfill or AI/Personal integration. | Read-only post-apply metadata verified 29 app tables (27 public, 2 private), RLS enabled on all 29, 92 public/private functions, the new columns/keys/delete actions/indexes/policies/grants/function security and signatures, eight seeded keywords in order, zero assignments, and the applied migration record. Storage remains four buckets; no fixture-writing tests or additional data mutations were run. |

For a subsequent authorized database change, add a dated entry with the target environment, approval scope, migration/change reference, affected objects/apps, and read-only verification result. Record proposed work separately until applied.

<!-- END SHARED SUPABASE SNAPSHOT -->
