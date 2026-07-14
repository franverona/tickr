# Tickr — Claude Code instructions

## Next.js version

This project uses **Next.js 16**. Read `node_modules/next/dist/docs/` before writing any Next.js code — APIs and conventions differ from older versions. Heed deprecation notices.

## Stack

- **Next.js 16** App Router with Server Actions (`'use server'` file directive)
- **Pluggable database** behind a `TaskRepository` interface (`lib/db/`), selected at runtime via `DB_TYPE`. SQLite (via `better-sqlite3` + Kysely), Postgres (via `pg` + Kysely), and Firestore (via `@google-cloud/firestore`, no Kysely) are implemented; MySQL is designed for but not yet built — see "Database backend" below
- **Tailwind CSS v4**
- **TypeScript**
- `@uiw/react-md-editor` — loaded via `next/dynamic` with `{ ssr: false }`

## Project structure

```
app/
  actions.ts           # all DB operations (Server Actions)
  page.tsx             # main UI — single page app
  layout.tsx
  globals.css
  api/
    upload/route.ts         # image upload endpoint (POST /api/upload → public/uploads/)
    uploads/[...path]/      # dynamic image server (GET /uploads/* → public/uploads/)
components/
  TaskCard.tsx         # task list item
  TaskDetail.tsx       # right-panel detail view
  CreateTaskModal.tsx
  TagSelector.tsx      # inline tag picker with create flow
  TagManagementModal.tsx  # rename / recolor / delete tags
  TagBadge.tsx
  Logo.tsx
  MdEditor.tsx         # dynamic imports for react-md-editor
lib/
  db/
    index.ts            # barrel: export { getRepository }
    factory.ts          # getRepository() — reads DB_TYPE, dispatches to a backend
    types.ts             # Kysely DbSchema + TaskRepository interface + DbType union
    slug.ts               # slugify() — shared across backends
    sqlite/
      connection.ts        # better-sqlite3 + Kysely singleton, globalThis-cached
      migrate.ts             # ensureSchema() — DDL, migrations, tag seeding
      repository.ts            # SqliteTaskRepository implements TaskRepository
      index.ts                  # getSqliteRepository(), globalThis-cached
    postgres/
      schema.ts             # PgDbSchema — same tables as sqlite's, native BOOLEAN columns
      connection.ts           # pg.Pool + Kysely singleton, globalThis-cached, reads DATABASE_URL
      migrate.ts                # ensureSchema() — DDL (final shape, no migration history), tag seeding
      repository.ts               # PostgresTaskRepository implements TaskRepository
      index.ts                     # getPostgresRepository(), globalThis-cached
    firestore/
      connection.ts        # Firestore client singleton, globalThis-cached, reads FIRESTORE_SERVICE_ACCOUNT_KEY
      seed.ts                 # ensureSeeded() — predefined-tag seeding only (no DDL to run)
      chunk.ts                  # chunk() — splits arrays for Firestore's 500-op batch limit
      repository.ts               # FirestoreTaskRepository implements TaskRepository (no Kysely)
      index.ts                     # getFirestoreRepository(), globalThis-cached
  types.ts             # Task and Tag interfaces
  constants.ts         # PREDEFINED_TAGS and COLOR_PALETTE
  export.ts            # exportToJSON, exportToCSV, exportToZip (client-side)
  import.ts            # processImportZip — parse ZIP, upload images (client-side)
data/
  tasks.db             # created at runtime, gitignored
public/
  uploads/             # uploaded images, gitignored
```

## Key conventions

- **Server Actions** for all DB reads and writes — no API routes, except `/api/upload` (image upload) and `/api/uploads/[...path]` (image serving, see below)
- **Uploaded image serving**: In production, Next.js indexes `public/` once at startup, so newly uploaded files 404 if served as static assets. A `beforeFiles` rewrite in `next.config.ts` redirects all `GET /uploads/*` requests to `/api/uploads/*`, which reads files from `public/uploads/` dynamically on every request
- **Tag colors** are stored as full Tailwind class strings (e.g. `"bg-blue-600 text-blue-100 border-blue-500"`). All color options must appear as literals in `COLOR_PALETTE` in `lib/constants.ts` so Tailwind v4 bundles them
- `better-sqlite3` is excluded from webpack bundling via `serverExternalPackages` in `next.config.ts`
- **Migrations** run idempotently in `ensureSchema()` inside `lib/db/sqlite/migrate.ts` — add `ALTER TABLE … ADD COLUMN` wrapped in try/catch to extend the schema without breaking existing databases. There's no migration-version table; idempotency comes from try/catch on `ADD COLUMN` and existence checks (e.g. `pragma_table_info`) for anything that can't be safely retried the same way (like `DROP COLUMN`)
- **Export format**: ZIP containing `tasks.json` or `tasks.csv` + `uploads/` folder. Image paths in the data file are rewritten from `/uploads/` to `uploads/` (relative) so the archive is self-contained. `lib/export.ts` is client-only.
- **Import**: `lib/import.ts` is client-only — it parses the ZIP with JSZip, uploads images through `/api/upload`, rewrites paths, then calls the `importTasks` server action which resolves/creates tags and bulk-inserts tasks. Imported tags without a matching existing tag get a color cycled from `COLOR_PALETTE`.

## Database backend

- **`DB_TYPE`** env var selects the backend. Defaults to `sqlite` (zero-config — no env var needed for the common case). `sqlite`, `postgres`, and `firestore` are implemented; setting `DB_TYPE=mysql` throws a clear "not implemented yet" error from `getRepository()` (`lib/db/factory.ts`) rather than silently falling back
- Postgres shares a Kysely-based SQL layer with the SQLite adapter and reads connection details from a single **`DATABASE_URL`** connection string (not discrete host/port/user/pass vars). MySQL, when implemented, will follow the same convention. Firestore is schemaless and reads a single **`FIRESTORE_SERVICE_ACCOUNT_KEY`** connection string instead (see "Firestore adapter" below)
- **To add a new backend**: implement `TaskRepository` (`lib/db/types.ts`) in a new `lib/db/<backend>/` directory (mirror `lib/db/sqlite/` or `lib/db/postgres/`), then register it in the `switch` in `lib/db/factory.ts`
- All DB access goes through `getRepository()` from `lib/db` — `app/actions.ts`'s Server Actions are thin wrappers over it and contain no backend-specific logic themselves

## SQLite adapter

- SQLite at `./data/tasks.db`, created automatically on first run. Connection is a `better-sqlite3` instance wrapped in Kysely (`lib/db/sqlite/connection.ts`), `globalThis`-cached, with `PRAGMA foreign_keys = ON`
- Schema: `tasks`, `tags`, `task_urls`, and `task_tags` tables
- `tasks` columns: `id`, `title`, `description`, `completed`, `archived`, `due_date`, `created_at`, `updated_at`, `completed_at`, `archived_at`, `sort_order`. `completed`/`archived` are stored as `INTEGER` 0/1 — the better-sqlite3 driver doesn't auto-convert JS booleans, so `lib/db/sqlite/repository.ts` converts manually
- `task_tags` is a join table (`task_id`, `tag_id`, `position`) — replaces the old JSON-array-in-TEXT `tasks.tags` column. `position` preserves tag display order (tag badges render in array order, so this isn't cosmetic). Both FKs cascade on delete
- `task_urls` columns: `id`, `task_id`, `url`, `label`, `created_at` — backs the Links section in the task detail panel. `task_id` cascades on delete
- Predefined tags seeded via Kysely `.onConflict().doNothing()` on every startup (user edits/deletes of predefined tags are never overwritten)
- To reset: delete `./data/tasks.db` and restart

## Postgres adapter

- Configured via **`DATABASE_URL`** (e.g. `postgresql://user:pass@host:5432/dbname`) — `lib/db/postgres/connection.ts` throws a clear error if unset when `DB_TYPE=postgres`. Connection is a `pg.Pool` wrapped in Kysely (`PostgresDialect`), `globalThis`-cached (load-bearing, not just parity with SQLite — without it, dev-mode hot-reload would spawn a new `Pool`/new TCP connections on every module re-evaluation)
- Same 4-table schema as SQLite (`tasks`, `tags`, `task_urls`, `task_tags`), but `completed`/`archived` are native `BOOLEAN` columns (the `pg` driver handles JS booleans natively, unlike better-sqlite3) — see `lib/db/postgres/schema.ts`'s `PgTasksTable`. Timestamps stay `TEXT` (ISO-8601 strings) on both backends for consistency
- `lib/db/postgres/migrate.ts`'s `ensureSchema()` creates the current schema directly via Kysely's schema builder (`db.schema.createTable(...)`) — no incremental migration history to replay, unlike `sqlite/migrate.ts`, since Postgres starts fresh
- **Local testing**: `docker-compose.yml` at the repo root runs a `postgres:16-alpine` container (`docker compose up -d`). Copy `.env.example` to `.env.local`, uncomment `DB_TYPE=postgres` and `DATABASE_URL`, then `pnpm dev`
- To reset: `docker compose down -v` (drops the named volume) and restart

## Firestore adapter

- Configured via **`FIRESTORE_SERVICE_ACCOUNT_KEY`** — the full service-account JSON (Firebase Console → Project Settings → Service Accounts → Generate new private key) as a single-line env var, `JSON.parse`d and passed as `credentials` to the `Firestore` constructor (`lib/db/firestore/connection.ts`). Not the Web SDK client config (`apiKey`/`authDomain`/`appId`) — that can't authenticate server-side access. The service-account key file itself must never be committed; `*firebase-adminsdk*.json` is gitignored as a safety net and the code never reads a file path (`keyFilename`), only the env var
- **No emulator** — `DB_TYPE=firestore` always connects to the real remote project, including in local dev. `getFirestoreClient()` logs a one-time `console.warn` on first connection as a reminder
- **Schema**: two collections, no Kysely, no join tables — `tasks/{id}` (with `tags: string[]` and `urls: {id,url,label}[]` embedded directly, replacing `task_tags`/`task_urls`) and `tags/{id}` (`id = slugify(label)`, same as the SQL adapters). Firestore field names match the `Task`/`Tag` domain types' camelCase fields directly (`sortOrder`, `dueDate`, `createdAt`, …) — no snake_case translation layer
- `lib/db/firestore/seed.ts`'s `ensureSeeded()` seeds `PREDEFINED_TAGS` idempotently via `doc(id).create()` caught against `ALREADY_EXISTS` (gRPC code 6) — the Firestore analog to the SQL adapters' `.onConflict().doNothing()`
- **No cascade deletes**: `deleteTag` has to fan out — query every task with `tags array-contains id` and `FieldValue.arrayRemove(id)` each one, batched. `deleteTask` needs no fan-out at all, since urls/tags are embedded on the task doc itself
- `createTask`'s "lowest sort_order among incomplete tasks" query (`where('completed', '==', false).orderBy('sortOrder')`) needs a Firestore **composite index** — it can't be created from application code; Firestore throws `FAILED_PRECONDITION` with a direct Console link to create it, once, on first use
- `reorderTasks`/`importTasks`/`deleteTag`'s fan-out all use `lib/db/firestore/chunk.ts`'s `chunk()` to stay under Firestore's 500-operation batch limit. Large imports are **not** atomic across chunks (each chunk commits independently) — an accepted trade-off, since Firestore transactions share the same 500-write cap so true atomicity isn't available for imports that size anyway
- No automated tests against Firestore (no emulator, by design — would require live credentials in CI and risk polluting real data). Verify manually against the live project instead

## Testing

- **Vitest** — run with `pnpm test` (or `pnpm test:watch`)
- Tests live in `__tests__/`: `export.test.ts`, `import.test.ts`, `actions.test.ts`
- `actions.test.ts` mocks `lib/db`'s `getRepository` via `vi.hoisted` + `vi.mock`, backed by a `SqliteTaskRepository` built on an in-memory `better-sqlite3` DB — schema comes from the real `ensureSchema()` (`lib/db/sqlite/migrate.ts`) rather than a duplicated DDL copy, so the test fixture can't drift from production. `beforeEach` wipes all rows (including seeded tags) for isolation; tests that need specific tags insert them directly first
- `parseCSVRows`, `parseJSONContent`, `parseCSVContent` in `lib/import.ts` are exported so they can be unit-tested directly

## Before considering a feature or fix done

Run all three of the following and fix any failures:

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm test
```

## Running

```bash
pnpm dev              # development
pnpm build && pnpm start -- -p 9876   # production (pm2 manages this)
```

See README.md for full pm2 setup instructions.
