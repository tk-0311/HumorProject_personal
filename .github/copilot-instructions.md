# Repository instructions

## Working directory and commands

The application and npm package are at the repository root in the local `HumorProject_personal/` folder. Run all commands below from that root. Use npm with the committed `package-lock.json`. Next.js 16.3.5 requires Node.js >=20.9.0.

```sh
npm ci
npm run dev         # http://localhost:3000
npm run build
npm start           # serve an existing production build
npm run lint        # ESLint 9 with Next core-web-vitals and TypeScript rules
npx tsc --noEmit
```

For file-scoped linting: `npx eslint app/new/actions.ts`.

Tests use `node:test` and `node:assert/strict`, with TypeScript sources and extensionless imports. Run them using the existing compiler; there is no npm test script or separate test-runner dependency. Compile to a temporary directory outside the app so emitted JavaScript does not enter lint/build inputs:

```sh
# From the repository root; run the full suite.
(
  test_dir=$(mktemp -d /tmp/humor-tests.XXXXXX) || exit 1
  trap 'rm -r "$test_dir"' EXIT
  ./node_modules/.bin/tsc --outDir "$test_dir" --module commonjs \
    --moduleResolution node --target ES2017 --lib esnext,dom,dom.iterable \
    --esModuleInterop --skipLibCheck \
    tests/*.test.ts &&
  NODE_PATH="$PWD/node_modules" node --test "$test_dir"/tests/*.test.js
)
```

For a single test file, replace `tests/*.test.ts` with `tests/caption-options.test.ts` and the runner path with `"$test_dir"/tests/caption-options.test.js`. To select an individual test, add `--test-name-pattern='accepts exactly three'` after `--test` and before the file path. These tests cover pure validation/prompt/count helpers, not live Supabase or Gemini integrations.

Production builds use `next/font` Geist downloads and need access to Google Fonts. Vercel must use the repository root (`.`) as its Root Directory; the former `hello-world/` subdirectory no longer exists.

## Architecture

- This is a Next.js App Router application using React 19, strict TypeScript, and Tailwind CSS 4. The `@/*` alias resolves from the repository root.
- Server pages and server actions access Supabase through `utils/supabase/server.ts`, using `createClient(await cookies())`. Browser components use `utils/supabase/client.ts`. Both use the publishable key and the user's session; database RLS is part of the authorization boundary, not a service-role bypass.
- `proxy.ts` delegates cookie/session refresh to `utils/supabase/middleware.ts`. It does not globally require login: protected pages/actions check `auth.getUser()` themselves. OAuth exchanges its code for a session in `app/auth/callback/route.ts` and accepts only local redirect paths.
- `/` renders `HumorLanding` for visitors and `CaptionFeed` for signed-in users. `/captions` exposes the newest-first caption feed. Home creation controls open `CaptionComposerDialog` without navigating; `/new` remains a directly accessible creation page. Both use `GenerationForm` and the same server actions.
- `app/new/actions.ts` implements generation and publication. A required image and chosen humor style go to Gemini through server-side fetch with structured-output validation. Three generated options, the provider prompt/model, and the image path are saved to an owner-private `caption_drafts` row. Generation does not publish. Publication sends only the draft ID and zero-based option index to `publish_caption_choice`; the RPC checks ownership, locks the draft, and publishes the stored option to `ai_generations` idempotently.
- `CaptionFeed` combines public caption fields, signed image URLs, aggregate vote counts, and the current user's private votes. `CaptionCard` manages optimistic voting; `app/captions/actions.ts` persists it. Pure parsing, image checks, provider-error handling, and vote-count calculations live in `lib/ai/` and are covered by `tests/`.

## Behavioral and database conventions

- Read `AGENTS.md` before Next.js changes: it requires consulting the installed version's guides in `node_modules/next/dist/docs/` rather than assuming older framework APIs. `CLAUDE.md` points to those same instructions. Preserve the generated Next.js agent-rules block.
- The current creation UX is image-first, as documented in [CAPTION_CHOICES.md](../CAPTION_CHOICES.md). Earlier text-only/optional-image descriptions in [AI_CAPTIONS.md](../AI_CAPTIONS.md) and [CAPTION_IMAGES.md](../CAPTION_IMAGES.md) describe previous stages; use current actions and the later choices/quota migrations to resolve conflicts.
- Images are JPEG, PNG, or WebP, at most 3 MiB, with both MIME and file-signature validation. The server-action body limit in `next.config.ts` is 4 MiB for form overhead. Private `caption-images` objects use random owner-prefixed paths and no overwrite. Feed images use one-hour signed URLs; failed draft saves attempt upload cleanup. Do not treat these images like public profile avatars.
- The daily allowance is ten successfully saved caption sets per user per UTC day, including saved drafts. Failed provider calls do not count. `claim_caption_attempt` is a preflight check; the database insert trigger enforces the actual quota with a per-user advisory lock.
- Homepage ranking happens in `ranked_caption_feed` before the 30-post limit: posts within 72 hours first, ordered by positive votes then recency; older posts follow newest-first. Downvotes do not affect ranking. Only missing-function errors (`PGRST202`, `42883`) fall back to newest-first; other failures retain the unavailable state. `/captions` stays newest-first.
- Votes are `-1` or `1`; action value `0` removes a vote, and clicking the selected vote toggles it off. Display likes and dislikes separately through `caption_vote_counts`, not a net score. Individual vote rows stay owner-private; shared counts come from aggregate RPCs. Optimistic updates must roll back on save failure. Publishing/voting revalidate `/` and `/captions`.
- SQL in `database/` records Supabase schema, storage policies, and RPCs. The creation migrations for captions, images, and choices are documented as already applied to the connected project; do not blindly rerun them. Later patches include successful-caption quota, ranked feed, and separate vote counts. Confirm the target database state before applying SQL. Keep public feed projections separate from private prompts/models, drafts, and raw votes. Existing SECURITY DEFINER RPCs use fixed search paths, qualified tables, and explicit execution grants.
- Supabase configuration uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Gemini uses server-only `GEMINI_API_KEY` and `GEMINI_MODEL` with an image-capable structured-output model; never expose the API key through a `NEXT_PUBLIC_` variable. OAuth deployment redirects also use `NEXT_PUBLIC_SITE_URL`. Preserve provider-error redaction in `lib/ai/gemini-error.ts`.
- UI colors use semantic CSS variables from `app/globals.css` (`--background`, `--surface`, `--foreground`, `--muted`, `--border`, `--accent`) via Tailwind utilities. Keep new surfaces compatible with the existing `data-theme` light/dark overrides.
