# AI captions and voting (assignment steps 1–5)

Admins can inspect new generation runs in **Prompt Studio → Chain responses** on the admin panel (`/admin/prompts/responses`; the old `/admin#prompt-responses` link forwards there). Both apps capture visible model output from every enabled link, with model/provider, title/order, duration, and execution status. Responses are stored in a separate admin-only `ai_caption_chain_runs` history through the applied migration `20261028025444_admin_chain_response_history.sql`; normal users cannot read it, including their own records. Partial and invalid outputs are retained for inspection. No image bytes, API keys, hidden reasoning, request prompts, or raw provider error bodies are captured. Historical intermediate responses were not saved. Recording is best effort and does not add responses to community action results or aggregate telemetry.

## Product choice

Sam wants relatable campus and NYC humor with little effort. Both apps turn one uploaded photo into nine caption options: three dry, three wholesome, and three absurd. Users browse three options at a time in style tabs, keep one selection across tabs, and publish their favorite. Fresh captions provide a reason to return; visible scores let the community signal what lands. Existing community posts remain available.

## Included

- `/new`: authenticated photo upload and generation form, Dry / Wholesome / Absurd tabs with three caption options each, a persistent selected-caption preview, and loading/error/result states. On the home feed, the main generate button opens an anchored popup and the floating plus opens the same popup centered in the viewport, with a dimmed background and no URL change. The popup remains scrollable with its scrollbar hidden. Escape or the close button dismisses it and restores background scrolling. Successful publication closes the modal and refreshes the feed in place. Direct visits to `/new` remain supported.
- `/captions`: newest 30 saved captions, aggregate scores, sign-in prompt for visitors.
- `/`: logged-out landing page; signed-in real feed with AI captions and creation links. Apply `database/ranked-caption-feed.sql` after the caption/image migrations: posts from the last 72 hours appear first, ranked by positive votes (likes), with newer posts breaking ties. Older posts follow newest-first, up to 30 posts total. Ranking happens before the limit; downvotes affect displayed scores but not the likes ranking. `/captions` remains newest-first. If the ranking function is missing (`PGRST202` or `42883`), the homepage temporarily falls back to newest-first and logs a migration reminder. Other query failures log their error code on the server and keep the unavailable message.
- Server-side AI provider calls, 25-second timeout, structured JSON output validation.
- Stored situation, full provider prompt, model, creator, caption, and timestamp.
- One vote per user/caption; changing a vote updates it, clicking the selected vote removes it. Apply `database/caption-vote-counts.sql` to show separate like (`value = 1`) and dislike (`value = -1`) totals instead of net scores. Existing votes are counted automatically. Counts update optimistically and roll back on failed saves; the RPC exposes only aggregates, including zero totals for unrated posts.
- Limit of ten successfully generated and saved caption sets per user per UTC day. Failed calls do not count. Apply `database/successful-caption-quota.sql` after `database/caption-choices.sql` to enable this policy on existing databases. It counts saved drafts (including existing drafts), ignores historical failed attempts, and serializes draft inserts to enforce the limit under concurrent requests. Provider-level limits still need configuration for aggregate usage across users.

## Installation

The connected Supabase migration `ai_captions_votes_and_strict_rls` has already been applied. Do not run its creation SQL again. `database/ai-captions.sql` records its exact source for review/history.

Apply the supplied source patch from the `hello-world` folder, then add these server environment variables to `.env.local`:

```
GEMINI_API_KEY=your_key
```

Apply [`20261027201307_shared_ai_models.sql`](supabase/migrations/20261027201307_shared_ai_models.sql), followed by [`20261027202847_multi_provider_ai_models.sql`](supabase/migrations/20261027202847_multi_provider_ai_models.sql) and [`20261027205526_prompt_link_models.sql`](supabase/migrations/20261027205526_prompt_link_models.sql), to the shared project. Manage Gemini, OpenAI, Grok, Anthropic, or other OpenAI-compatible models on the admin panel’s **Models** page. Each prompt-chain link has its own model assignment and **Include uploaded photo** setting, editable only by admins in **Prompt Studio**. Both app generators use these server-loaded link assignments and ignore client model overrides. Neither caption form offers a model picker. The first enabled link must include the photo and use an image-capable model; later links may use text-only models with the prior output. Final-link models return validated caption JSON. Custom compatible providers use their HTTPS Chat Completions API base URL. Existing links are migrated with their app’s current model. App defaults only prefill new links and do not change saved link assignments. Provider failures stop the chain without silently switching models; all link credentials are checked before the first request. `GEMINI_MODEL` is no longer used. Historical captions keep their recorded final-link model strings. Models referenced by active/inactive links or new-link defaults must be reassigned before deletion.

Saved model keys are AES-256-GCM encrypted and shared between both apps. Both server environments require the **same** 64-hex-character `AI_MODEL_ENCRYPTION_KEY`; the local ignored `.env.local` files are already configured. Set the same value in both production deployments before using saved keys, and keep it stable. Keys and their ciphertext are excluded from model catalogs and action responses. The database stores only ciphertext; the application servers hold the independent encryption secret. Provider keys are entered only in the admin Models page, never in public caption forms.

If a built-in model has no saved key, each server uses `GEMINI_API_KEY`, `OPENAI_API_KEY`, `XAI_API_KEY`/`GROK_API_KEY`, or `ANTHROPIC_API_KEY`. Custom compatible providers require a saved key. Provider and encryption environment variables must never use a `NEXT_PUBLIC_` prefix. Adding a model/key does not validate access or spend provider credits. Real generation sends the photo to the selected provider.

No new npm dependencies are required. Generation is real; there is no mock fallback. Missing provider settings produce an explicit unavailable message without consuming a database attempt.

Official API reference: https://ai.google.dev/gemini-api/docs/generate-content/structured-output

## Security decisions

New generations can only be inserted with the signed-in user's ID. Prompt, model, and creator columns are not readable by public clients; displayed situation/caption fields are public. Existing posts/profiles require authentication, and existing private profile column grants are retained. Votes are readable/mutable only by their owners; a unique key and value constraint enforce valid single votes. Arbitrary raw vote mutations cannot alter another user's vote.

`caption_scores` deliberately uses SECURITY DEFINER to return only aggregate scores for at most 100 captions while keeping individual votes private. After the successful-caption-quota migration, `claim_caption_attempt` checks the saved-draft count without reserving an attempt; `enforce_successful_caption_quota` enforces the limit under a per-user advisory lock when a draft is saved. Both fix their search path, use qualified table names, and restrict execution grants. The existing private profile-details function remains owner-scoped. The security advisor flags these deliberate function boundaries for review. Existing leaked-password protection is disabled; enable it in Supabase Auth settings when available.

The legacy anonymous profile-picture write policies were removed; the app's owner-folder profile-photo upload/update/delete policies remain. Public avatar reads remain intentional. All public application tables have RLS enabled. Supabase-managed internal schemas are not modified.

## Verification

TypeScript and four validation/prompt tests passed. Live transaction tests passed for inserts, unique votes, vote updates, two-user ownership, private votes/prompts, aggregate scores, anonymous denial, and the daily quota. All test data was rolled back. RLS is enabled on all five public application tables. Real provider generation still requires a Gemini key. Production build was blocked by this environment's inability to reach Google Fonts for the app's existing Geist imports. Test accounts should confirm creation, reload persistence, voting changes/removal, and logged-out denial before submission.

The quota protects server-side provider calls. Authenticated clients can insert their own caption records under RLS; provenance is not cryptographically guaranteed. Do not present the AI label as verified provenance in a higher-trust product without moving creation behind a server-only database capability.


## Prompt-chain failure diagnostics

Apply `supabase/migrations/20261027212029_caption_chain_failure_diagnostics.sql` and deploy both apps. Failed caption generation uses `record_app_telemetry_v3` to snapshot the failed link’s number, title, ID/position, model/provider, photo flag, duration, and failure phase. The admin Operations view groups failures by link and shows locations on individual requests. Credential preflight and provider/output failures are separate; post-generation photo uploads and draft saves are identified as after-chain failures. Community users continue receiving general error messages. No prompts, captions, provider response bodies, API keys, auth tokens or user identifiers are stored in the telemetry context. Events recorded before this change remain explicitly unknown, and existing v2 telemetry remains compatible.
