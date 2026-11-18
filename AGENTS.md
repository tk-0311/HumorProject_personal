# Agent instructions

## Supabase permissions and data documentation

- Read `datastructure.md` before changing database-dependent code or planning database work. This app shares its Supabase project with HP Admin Panel, HumorProject Personal, and Prompt Studio; changes can affect all three.
- **Do not change any database without explicit user permission for the target project/environment and scope.** Permission to document the schema, inspect/debug, or edit application code is not permission to execute a database change. Existing explicit authorization for the same scope remains valid.
- This applies to schema changes, DDL/DML, migrations, seeds/backfills, resets, roles/grants/RLS, database settings, Auth/Storage mutations, and database tests that write fixtures even if they roll back. Do not bypass the rule through app endpoints, scripts, or mutating RPCs. Read-only metadata inspection and preparing unapplied SQL for review are allowed.
- After every authorized agent-driven database change, update this app's `datastructure.md` in the same task. Include affected tables/columns/types/defaults, relationships/delete actions, constraints/indexes, grants/RLS, functions/triggers, Storage, JSON contracts, and app usage. Record agent-driven data-only changes in the change log too.
- Keep the marked shared snapshot synchronized in `HP_admin_panel/datastructure.md`, `HumorProject_personal/datastructure.md`, and `prompt_chain/datastructure.md`, and update the workspace `datastructure.md` index when needed. These are sibling repositories under `HP_personal`. If another checkout is unavailable, report which documentation remains outstanding.
- Verify approved changes read-only; record the date, project/environment, approval scope, migration/change reference, and verification result. Label proposals as unapplied and source-only information as unverified. Never put credentials or real user records in documentation.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
