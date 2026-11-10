# Tickr — Claude Code instructions

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the PR checks and commit rules. Dependabot auto-merges npm patch/minor updates except 0.x minor bumps. GitHub Actions and docker-compose bumps never auto-merge; for docker-compose, sync `ci.yml`'s service images by hand.

## Next.js 16

Read `node_modules/next/dist/docs/` before writing Next.js code; APIs differ from older versions. `agentRules: false` in `next.config.ts` stops `next dev` generating an `AGENTS.md`; don't add one back.

## Architecture

- All DB access goes through `getRepository()` (`lib/db`), selected by `DB_TYPE` (`sqlite` default, `postgres`, `mysql`, `firestore`). `app/actions.ts` Server Actions are thin wrappers with no backend logic.
- SQL backends share `createSqlTaskRepository()` (`lib/db/shared/sql-repository.ts`); each backend only supplies `ensureSchema`, `boolIn`/`boolOut` and the tag-conflict strategy. Firestore is a separate implementation with tags/urls embedded on the task doc.
- New backend: implement `TaskRepository` (`lib/db/types.ts`) in `lib/db/<backend>/` and register it in `lib/db/factory.ts`.

## Rules

- **No API routes** except `/api/upload` and `/api/uploads/[...path]`. Route handlers get no CSRF check, so `/api/upload` checks `Origin` and `Content-Length` before parsing. `proxyClientMaxBodySize` in `next.config.ts` must stay above its 100 MB cap.
- **Uploads** are served through `/api/uploads` (a `beforeFiles` rewrite), because production indexes `public/` only at startup. Keep its `nosniff` + `sandbox` CSP; `next.config.ts` headers skip uploads because they'd replace that CSP.
- **Markdown previews** always pass `sanitizeMarkdown` in `rehypePlugins`: the preview enables `rehype-raw`.
- **Tag colors** are full Tailwind class strings and must appear literally in `COLOR_PALETTE` (`lib/constants.ts`).
- **SQLite migrations** live in `lib/db/sqlite/migrate.ts`: `ADD COLUMN` in try/catch, existence checks for anything not safely retryable. Postgres/MySQL create the final schema directly.
- **MySQL**: id/FK columns are `varchar(255)` + `utf8mb4_bin` (indexable, accent-sensitive slugs); `description` is `mediumtext`.
- **Firestore**: `createTask` needs a composite index (the emulator doesn't enforce it). Batches go through `chunk()` (500 ops / 10 MiB).
- **Export/import is backend-agnostic**: ids are regenerated on import, tags are re-linked by lowercased label, and `#old-id` mentions are rewritten (`lib/db/mentions.ts`). Keep `__tests__/cross-backend-import-export.test.ts` passing.

## Testing

- Cross-backend tests use `POSTGRES_TEST_URL` / `MYSQL_TEST_URL` / `FIRESTORE_TEST_HOST` (never `DATABASE_URL` or a live Firestore project): they wipe the target database. They skip when the docker-compose service is down, except in CI.
- `lib/db/sqlite/migrate.ts` caches its run per module, so a test creating several in-memory DBs needs `vi.resetModules()` between them.
- Don't run `pnpm build` in this checkout: it overwrites the `.next` that pm2 serves. Use a separate worktree.
- Browser testing: never change remote Firestore data. Use SQLite or the emulator (`DB_TYPE=firestore FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`).
