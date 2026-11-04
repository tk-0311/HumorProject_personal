# Shared prompt chains and centralized AI execution

`prompt_chain` is the sole application that sends generation requests to AI providers. HP Admin Panel and HumorProject Personal call its authenticated server API. An unavailable service fails closed; neither caller falls back to an AI API.

## Canonical configuration

All editors use `prompt_chains` and `prompt_chain_steps`. `prompt_chain_assignments` binds `admin_panel` and `humor_project` to their configured chains. The admin editor and Prompt Studio edit the same rows; optimistic revisions reject stale saves. Step IDs survive edits and reordering. Both editors support 1–20 steps, 100-character titles and 12,000-character prompts, source-image settings, and disabled steps.

```json
{
  "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "revision": 1,
  "name": "Caption chain",
  "description": "Image to captions",
  "surface": "humor_project",
  "steps": [{
    "id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    "position": 0,
    "title": "Describe the image",
    "prompt": "Describe the image for {{style}}.",
    "model_id": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    "model": "gemini-3.6-flash",
    "include_image": true,
    "output_type": "text",
    "enabled": true
  }]
}
```

`model_id` identifies the registered Supabase model; `model` is its provider identifier, resolved from the catalog on save. `{{previous}}`, `{{step:1}}` and `{{style}}` work in caption prompts. Numbered references follow active execution order. Caption chains require a photo on the first active step and text outputs. Their final runtime contract produces three options for each of dry, wholesome and absurd, preserving nine-option drafts and publication order. General Prompt Studio chains retain their other input/output behavior.

## Server API

- `POST /api/v1/captions`: `{version:1,surface,chain_id,revision,style,image:{mime_type,base64}}`. The service loads the configured chain itself; callers cannot submit replacement prompts, model credentials or endpoints. A changed chain returns HTTP 409. Images are validated by size and byte signature. All credentials and input modalities are checked before the first provider call. A complete chain has a 235-second execution budget; Vercel handlers allow 300 seconds. The client does not retry generation automatically.
- `POST /api/v1/catalog`: `{version:1}`. Admin callers receive safe catalog metadata, verified input capabilities and credential readiness. No plaintext or encrypted API keys are returned.

Each request carries the caller’s Supabase access token and a server signature. Supabase Auth verifies the token, then the same identity is used for RLS and surface-scoped RPCs. The signed body, path, user token, timestamp and nonce are authenticated using an HKDF-derived HMAC key. Signatures expire after 120 seconds. Only a trusted application server has the signing secret. Community users may execute the configured community chain; the admin surface and catalog require administrator access. Prompt Studio’s interactive pages and management APIs remain superadmin-only.

Caption response history is written once, by the central service, to the existing admin-only `ai_caption_chain_runs` history. Earlier outputs and failure locations remain inspectable. Aggregate telemetry and caption draft/publication logic remain in their originating applications. Community quotas are checked before generation and again when drafts are saved. No response history is included in the community generation result.

## Environment

All three servers must have the same server-only `AI_MODEL_ENCRYPTION_KEY`, the existing 64-character hex secret. HKDF uses a separate purpose-specific signing key; the original key also opens model credentials using their existing AES-GCM identity binding. HP Admin Panel still uses it to save model credentials.

Callers default to `https://prompt-chain-chi.vercel.app`. Set server-only `PROMPT_CHAIN_URL` to override the origin, for example `http://localhost:4400` during local development. Remote origins require HTTPS; local HTTP is limited to loopback hosts. Redirects are rejected. Provider environment keys are used only by `prompt_chain`; the caller apps no longer read or send them.

## Migration and rollout

Apply `prompt_chain/database/centralized-caption-chains.sql` after the existing Prompt Studio and shared-model migrations. It preserves original step IDs, order, prompts, models and enabled flags in the canonical tables, keeps the legacy configuration as an archive, and extends bounded response history to twenty steps. Archived model metadata is saved without credentials; its old foreign key no longer blocks current catalog management. Existing roles, `is_superadmin` flags, model defaults, caption drafts and storage policies are unchanged.

Deploy `prompt_chain` first, then the two callers. If publication is deferred, apply `keep-legacy-caption-model-guard.sql` to retain the production deletion guard. This guard is currently restored on the shared project while publication is pending. After both callers are deployed, apply `retire-legacy-caption-writes.sql` to revoke the retired configuration writer and remove the archived model-reference guard. Older read functions remain available for archive inspection; active applications use `get_prompt_chain_for_surface` and `save_caption_chain`.

The surface getter intentionally uses SECURITY DEFINER with explicit user/surface/admin checks so community users can read only their configured active chain without gaining direct access to private Studio tables. All mutations retain superadmin checks and revision validation. The rolled-back SQL tests verify those boundaries, shared edits, migration preservation, disabled steps and twenty-step history.
