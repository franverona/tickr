# Tickr — Claude Code instructions

## Next.js version

This project uses **Next.js 16**. Read `node_modules/next/dist/docs/` before writing any Next.js code — APIs and conventions differ from older versions. Heed deprecation notices.

`agentRules: false` in `next.config.ts` stops `next dev` from generating an `AGENTS.md` with this same guidance, so don't add one back.

## Stack

- **Next.js 16** App Router with Server Actions (`'use server'` file directive)
- **Pluggable database** behind a `TaskRepository` interface (`lib/db/`), selected at runtime via `DB_TYPE`. SQLite, Postgres, and MySQL (all via Kysely — `better-sqlite3`, `pg`, `mysql2` drivers respectively) and Firestore (via `@google-cloud/firestore`, no Kysely) are implemented — see "Database backend" below
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
    upload/route.ts         # attachment upload (POST /api/upload → public/uploads/); same-origin + size checked before parsing
    uploads/[...path]/      # dynamic file server (GET /uploads/* → public/uploads/), nosniff + sandbox CSP
components/
  TaskCard.tsx         # task list item
  TaskDetail.tsx       # right-panel detail view
  TaskContextMenu.tsx  # right-click / context menu for a task
  CreateTaskModal.tsx
  ImportModal.tsx      # import dialog for a chosen backup ZIP: merge or override (typed DELETE confirm)
  TagSelector.tsx      # inline tag picker with create flow
  TagManagementModal.tsx  # rename / recolor / delete tags
  TagBadge.tsx
  CommandPalette.tsx   # Ctrl/Cmd+K command palette
  ShortcutsModal.tsx   # keyboard shortcuts help overlay
  Logo.tsx
  MdEditor.tsx         # react-md-editor/preview dynamic imports, remarkOutlineList plugin, paste/drop upload + rich-paste handlers
lib/
  db/
    index.ts            # barrel: export { getRepository }
    factory.ts          # getRepository() — reads DB_TYPE, dispatches to a backend
    types.ts             # Kysely DbSchema + TaskRepository interface + DbType union
    slug.ts               # slugify() — shared across backends
    mentions.ts           # planImportIds() — new ids + `#old-id` mention rewrite for imports, shared across backends
    shared/
      sql-repository.ts    # createSqlTaskRepository() — the Kysely CRUD logic shared by sqlite/postgres/mysql
    sqlite/
      connection.ts        # better-sqlite3 + Kysely singleton, globalThis-cached
      migrate.ts             # ensureSchema() — DDL, migrations, tag seeding
      repository.ts            # SqliteTaskRepository — thin wrapper over createSqlTaskRepository
      index.ts                  # getSqliteRepository(), globalThis-cached
    postgres/
      schema.ts             # PgDbSchema — same tables as sqlite's, native BOOLEAN columns
      connection.ts           # pg.Pool + Kysely singleton, globalThis-cached, reads DATABASE_URL
      migrate.ts                # ensureSchema() — DDL (final shape, no migration history), tag seeding
      repository.ts               # PostgresTaskRepository — thin wrapper over createSqlTaskRepository
      index.ts                     # getPostgresRepository(), globalThis-cached
    mysql/
      connection.ts           # mysql2 Pool + Kysely singleton, globalThis-cached, reads DATABASE_URL
      migrate.ts                # ensureSchema() — DDL (final shape, no migration history), tag seeding
      repository.ts               # MysqlTaskRepository — thin wrapper over createSqlTaskRepository
      index.ts                     # getMysqlRepository(), globalThis-cached
    firestore/
      connection.ts        # Firestore client singleton, globalThis-cached, reads FIRESTORE_SERVICE_ACCOUNT_KEY
      seed.ts                 # ensureSeeded() — predefined-tag seeding only (no DDL to run)
      chunk.ts                  # chunk() — splits arrays for Firestore's 500-op batch limit
      repository.ts               # FirestoreTaskRepository implements TaskRepository (no Kysely, no shared factory)
      index.ts                     # getFirestoreRepository(), globalThis-cached
  types.ts             # Task and Tag interfaces
  constants.ts         # PREDEFINED_TAGS and COLOR_PALETTE
  dates.ts             # due-date badge logic (overdue / due today / due soon)
  standup.ts           # isReviewLink() (MR/PR URLs) + doneLastWeekSummary() for the Done tab's copy button
  emojis.ts            # emoji autocomplete (`:name`) data + matching
  snippets.ts          # snippet autocomplete (`/key`) data
  suggestLabel.ts       # tag label suggestion helper
  paste-utils.ts       # rich-paste-to-Markdown, URL-over-selection, CSV/TSV-to-table conversion
  useFocusTrap.ts      # focus-trap hook shared by modals
  export.ts            # exportToJSON, exportToCSV, exportToZip (client-side), referencedUploads
  import.ts            # processImportZip — parse ZIP, re-upload attachments (client-side)
  upload-types.ts      # UPLOAD_EXT_TO_MIME — accepted upload types, shared by import and /api/uploads
  backup.ts            # createBackup() — server-side ZIP in the export format, with retention (Node only)
scripts/
  backup.ts            # `pnpm backup` entry point (run via tsx): loads .env.local, calls createBackup()
data/
  tasks.db             # created at runtime, gitignored
public/
  uploads/             # uploaded attachments, gitignored
```

## Key conventions

- **Server Actions** for all DB reads and writes — no API routes, except `/api/upload` (attachment upload) and `/api/uploads/[...path]` (file serving, see below). Route handlers get no built-in CSRF check, so `/api/upload` rejects a mismatched `Origin` and checks `Content-Length` against its 10 MB cap before parsing the body
- **Uploaded file serving**: In production, Next.js indexes `public/` once at startup, so newly uploaded files 404 if served as static assets. A `beforeFiles` rewrite in `next.config.ts` redirects all `GET /uploads/*` requests to `/api/uploads/*`, which reads files from `public/uploads/` dynamically on every request. Responses carry `X-Content-Type-Options: nosniff` and, except for PDFs, `Content-Security-Policy: sandbox`, since the files are served from the app's own origin
- **Tag colors** are stored as full Tailwind class strings (e.g. `"bg-blue-600 text-blue-100 border-blue-500"`). All color options must appear as literals in `COLOR_PALETTE` in `lib/constants.ts` so Tailwind v4 bundles them
- `better-sqlite3` is excluded from webpack bundling via `serverExternalPackages` in `next.config.ts`
- **Migrations** run idempotently in `ensureSchema()` inside `lib/db/sqlite/migrate.ts` — add `ALTER TABLE … ADD COLUMN` wrapped in try/catch to extend the schema without breaking existing databases. There's no migration-version table; idempotency comes from try/catch on `ADD COLUMN` and existence checks (e.g. `pragma_table_info`) for anything that can't be safely retried the same way (like `DROP COLUMN`)
- **Export format**: ZIP containing `tasks.json` or `tasks.csv` + `tags.json` (every tag, since tasks only carry the ones they use; optional on import) + `uploads/` folder. Local `/uploads/` paths in task descriptions are rewritten to relative `uploads/` (`relativizeUploads()`) so the archive is self-contained; `/uploads/` inside other hosts' URLs is left alone. `lib/export.ts` is client-only.
- **Import**: `lib/import.ts` is client-only — it parses the ZIP with JSZip, re-uploads every attachment type `/api/upload` accepts (`lib/upload-types.ts`), rewrites paths, then calls the `importTasks` server action which resolves/creates tags and bulk-inserts tasks. Imported tags without a matching existing tag get a color cycled from `COLOR_PALETTE`.
- **Export/import is backend-agnostic**: a ZIP exported while running on one `DB_TYPE` imports cleanly into any other. `ImportedTask` (`lib/import.ts`) keeps its optional timestamps (normalized to ISO strings, falling back to the import time when missing), and its optional `id` (from JSON exports) is never stored — every backend's `importTasks` re-links tags by `label.toLowerCase()` (not by id) and regenerates ids via `randomUUID()`/`slugify()` rather than relying on DB-native autoincrement, so there's no backend-specific ID format to round-trip. The old `id` is only used to rewrite `[title](#old-id)` mention links in descriptions to the new ids (`lib/db/mentions.ts`'s `planImportIds()`, shared by all backends); CSV exports have no id column, so mentions don't survive a CSV round trip. Verified by `__tests__/cross-backend-import-export.test.ts` (automated SQLite↔Postgres, SQLite↔MySQL and SQLite↔Firestore, the last against the emulator).

## Database backend

- **`DB_TYPE`** env var selects the backend. Defaults to `sqlite` (zero-config — no env var needed for the common case). `sqlite`, `postgres`, `mysql`, and `firestore` are all implemented
- Postgres and MySQL share a Kysely-based SQL layer with the SQLite adapter and read connection details from a single **`DATABASE_URL`** connection string (not discrete host/port/user/pass vars). Firestore is schemaless and reads a single **`FIRESTORE_SERVICE_ACCOUNT_KEY`** connection string instead (see "Firestore adapter" below)
- **To add a new backend**: implement `TaskRepository` (`lib/db/types.ts`) in a new `lib/db/<backend>/` directory (mirror `lib/db/sqlite/` or `lib/db/postgres/`), then register it in the `switch` in `lib/db/factory.ts`
- All DB access goes through `getRepository()` from `lib/db` — `app/actions.ts`'s Server Actions are thin wrappers over it and contain no backend-specific logic themselves
- **SQL backends share one CRUD implementation**: `lib/db/shared/sql-repository.ts`'s `createSqlTaskRepository()` holds the actual Kysely query logic (task/tag CRUD, reordering, import) generic over the backend's boolean representation. `sqlite/repository.ts`, `postgres/repository.ts`, and `mysql/repository.ts` are now thin wrappers that just supply their backend's `ensureSchema`, `boolIn`/`boolOut` conversion, and tag-conflict strategy (`onConflict` vs MySQL's `ignore`) to that factory. Firestore's `repository.ts` is unrelated to this factory (no Kysely, no shared schema)

## SQLite adapter

- SQLite at `./data/tasks.db`, created automatically on first run. Connection is a `better-sqlite3` instance wrapped in Kysely (`lib/db/sqlite/connection.ts`), `globalThis`-cached, with `PRAGMA foreign_keys = ON`
- Schema: `tasks`, `tags`, `task_urls`, and `task_tags` tables
- `tasks` columns: `id`, `title`, `description`, `completed`, `archived`, `due_date`, `created_at`, `updated_at`, `completed_at`, `archived_at`, `sort_order`. `completed`/`archived` are stored as `INTEGER` 0/1 — the better-sqlite3 driver doesn't auto-convert JS booleans, so `sqlite/repository.ts` passes `boolIn`/`boolOut` converters (`b ? 1 : 0` / `v === 1`) into the shared `createSqlTaskRepository()` factory (`lib/db/shared/sql-repository.ts`)
- `task_tags` is a join table (`task_id`, `tag_id`, `position`) — replaces the old JSON-array-in-TEXT `tasks.tags` column. `position` preserves tag display order (tag badges render in array order, so this isn't cosmetic). Both FKs cascade on delete
- `task_urls` columns: `id`, `task_id`, `url`, `label`, `created_at` — backs the Links section in the task detail panel. `task_id` cascades on delete
- Predefined tags are seeded only into a fresh database (no tags and no tasks), so user edits/deletes of predefined tags are never undone on a later startup. The insert still uses Kysely `.onConflict().doNothing()` to guard concurrent first starts
- To reset: delete `./data/tasks.db` and restart

## Postgres adapter

- Configured via **`DATABASE_URL`** (e.g. `postgresql://user:pass@host:5432/dbname`) — `lib/db/postgres/connection.ts` throws a clear error if unset when `DB_TYPE=postgres`. Connection is a `pg.Pool` wrapped in Kysely (`PostgresDialect`), `globalThis`-cached (load-bearing, not just parity with SQLite — without it, dev-mode hot-reload would spawn a new `Pool`/new TCP connections on every module re-evaluation)
- Same 4-table schema as SQLite (`tasks`, `tags`, `task_urls`, `task_tags`), but `completed`/`archived` are native `BOOLEAN` columns (the `pg` driver handles JS booleans natively, unlike better-sqlite3) — see `lib/db/postgres/schema.ts`'s `PgTasksTable`. Timestamps stay `TEXT` (ISO-8601 strings) on both backends for consistency. `postgres/repository.ts` passes identity `boolIn`/`boolOut` converters into the shared `createSqlTaskRepository()` factory, since `pg` already hands back real JS booleans
- `lib/db/postgres/migrate.ts`'s `ensureSchema()` creates the current schema directly via Kysely's schema builder (`db.schema.createTable(...)`) — no incremental migration history to replay, unlike `sqlite/migrate.ts`, since Postgres starts fresh
- **Local testing**: `docker-compose.yml` at the repo root runs a `postgres:16-alpine` container (`docker compose up -d`). Copy `.env.example` to `.env.local`, uncomment `DB_TYPE=postgres` and `DATABASE_URL`, then `pnpm dev`
- To reset: `docker compose down -v` (drops the named volume) and restart

## MySQL adapter

- Configured via **`DATABASE_URL`** (e.g. `mysql://user:pass@host:3306/dbname`) — `lib/db/mysql/connection.ts` throws a clear error if unset when `DB_TYPE=mysql`. Connection is a `mysql2` (callback API, not `mysql2/promise`) `Pool` wrapped in Kysely (`MysqlDialect`), `globalThis`-cached for the same hot-reload reason as Postgres
- Reuses SQLite's `DbSchema`/`TasksTable` from `lib/db/types.ts` directly rather than a dedicated schema file like Postgres's — `completed`/`archived` are declared `boolean` in the DDL (MySQL stores this as `TINYINT(1)`), but the `mysql2` driver reads it back as a JS number (0|1), same as `better-sqlite3` and unlike `pg`, so `mysql/repository.ts` passes the same `boolIn`/`boolOut` converters into the shared `createSqlTaskRepository()` factory as `sqlite/repository.ts` does
- `id`/foreign-key columns (`tasks.id`, `tags.id`, `task_urls.id`, `task_urls.task_id`, `task_tags.task_id`, `task_tags.tag_id`) use `varchar(255)` rather than `text` — MySQL can't index a `TEXT`/`BLOB` column, including as a primary or foreign key, without an explicit key length. Non-indexed text columns (`title`, `url`, `label`, `color`, and the `TEXT`-stored ISO-8601 timestamp columns) stay `text`. `description` is `mediumtext` (16 MB) because MySQL's `text` caps at 64 KB; `ensureSchema()` upgrades a database created with `text` via a one-time `ALTER TABLE … MODIFY`, guarded by an `information_schema` type check
- MySQL has no `ON CONFLICT` — predefined-tag seeding (`lib/db/mysql/migrate.ts`) uses Kysely's `.ignore()` (`INSERT IGNORE`), and `mysql/repository.ts` passes `tagConflictStrategy: 'ignore'` into the shared factory so imported-tag creation does the same, instead of the SQLite/Postgres adapters' `tagConflictStrategy: 'onConflict'` (`.onConflict((oc) => oc.doNothing())`)
- `lib/db/mysql/migrate.ts`'s `ensureSchema()` creates the current schema directly via Kysely's schema builder — no incremental migration history to replay, same as Postgres
- **Local testing**: `docker-compose.yml`'s `mysql` service (`mysql:8.4`, `docker compose up -d`). Copy `.env.example` to `.env.local`, uncomment `DB_TYPE=mysql` and its `DATABASE_URL`, then `pnpm dev`
- To reset: `docker compose down -v` (drops the named volume) and restart

## Firestore adapter

- Configured via **`FIRESTORE_SERVICE_ACCOUNT_KEY`** — the full service-account JSON (Firebase Console → Project Settings → Service Accounts → Generate new private key) as a single-line env var, `JSON.parse`d and passed as `credentials` to the `Firestore` constructor (`lib/db/firestore/connection.ts`). Not the Web SDK client config (`apiKey`/`authDomain`/`appId`) — that can't authenticate server-side access. The service-account key file itself must never be committed; `*firebase-adminsdk*.json` is gitignored as a safety net and the code never reads a file path (`keyFilename`), only the env var
- **Emulator**: when **`FIRESTORE_EMULATOR_HOST`** is set (e.g. `127.0.0.1:8080`, the `docker-compose.yml` `firestore` service), `getFirestoreClient()` connects to the local emulator with no service-account key (project id `tickr-local`). The SDK sends every request there whenever that variable is set, so it can't reach the live project. The emulator is in-memory: data is gone when the container stops. Without it, `DB_TYPE=firestore` connects to the real remote project, and `getFirestoreClient()` logs a one-time `console.warn` saying so
- **Schema**: two collections, no Kysely, no join tables — `tasks/{id}` (with `tags: string[]` and `urls: {id,url,label}[]` embedded directly, replacing `task_tags`/`task_urls`) and `tags/{id}` (`id = slugify(label)`, same as the SQL adapters). Firestore field names match the `Task`/`Tag` domain types' camelCase fields directly (`sortOrder`, `dueDate`, `createdAt`, …) — no snake_case translation layer
- `lib/db/firestore/seed.ts`'s `ensureSeeded()` seeds `PREDEFINED_TAGS` only when both collections are empty (same fresh-database rule as the SQL adapters), via `doc(id).create()` caught against `ALREADY_EXISTS` (gRPC code 6) — the Firestore analog to the SQL adapters' `.onConflict().doNothing()`
- **No cascade deletes**: `deleteTag` has to fan out — query every task with `tags array-contains id` and `FieldValue.arrayRemove(id)` each one, batched. `deleteTask` needs no fan-out at all, since urls/tags are embedded on the task doc itself
- `createTask`'s "lowest sort_order among incomplete tasks" query (`where('completed', '==', false).orderBy('sortOrder')`) needs a Firestore **composite index** — it can't be created from application code; Firestore throws `FAILED_PRECONDITION` with a direct Console link to create it, once, on first use
- `reorderTasks`/`importTasks`/`deleteTag`'s fan-out all use `lib/db/firestore/chunk.ts`'s `chunk()` to stay under Firestore's 500-operation batch limit. Large imports are **not** atomic across chunks (each chunk commits independently) — an accepted trade-off, since Firestore transactions share the same 500-write cap so true atomicity isn't available for imports that size anyway
- Automated tests run against the **emulator only** (`cross-backend-import-export.test.ts`, via the test-only `FIRESTORE_TEST_HOST`, default `localhost:8080`, with explicit `host`/`ssl: false` settings that can't reach a live project). Never point tests at the live project. The emulator doesn't enforce composite indexes, so the index requirement above still needs a manual check on a real project

## Testing

- **Vitest** — run with `pnpm test` (or `pnpm test:watch`)
- Tests live in `__tests__/`, mirroring `lib/`/`components/`/`app/` — e.g. `export.test.ts`, `import.test.ts`, `actions.test.ts`, `cross-backend-import-export.test.ts`, `migrate.test.ts`, `dates.test.ts`, `paste-utils.test.ts`, `page.test.tsx`, `upload-route.test.ts` / `uploads-serve-route.test.ts` (the two API routes), plus one `*.test.tsx` per interactive component (`TaskCard`, `TaskDetail`, `TaskContextMenu`, `TagSelector`, `CreateTaskModal`, `TagManagementModal`, `ImportModal`, …)
- `actions.test.ts` mocks `lib/db`'s `getRepository` via `vi.hoisted` + `vi.mock`, backed by a `SqliteTaskRepository` built on an in-memory `better-sqlite3` DB — schema comes from the real `ensureSchema()` (`lib/db/sqlite/migrate.ts`) rather than a duplicated DDL copy, so the test fixture can't drift from production. `beforeEach` wipes all rows (including seeded tags) for isolation; tests that need specific tags insert them directly first
- `parseCSVRows`, `parseJSONContent`, `parseCSVContent` in `lib/import.ts` are exported so they can be unit-tested directly
- `cross-backend-import-export.test.ts` seeds a source `TaskRepository`, runs it through `exportToJSON`/`exportToCSV` → `parseJSONContent`/`parseCSVContent` → a destination repository's `importTasks`, and asserts the data survives modulo backend-regenerated ids/timestamps. The SQLite↔SQLite case (two independent in-memory DBs) always runs; the SQLite↔Postgres, SQLite↔MySQL and SQLite↔Firestore cases each skip themselves (via a runtime reachability check, not a hardcoded env flag) when the corresponding `docker-compose.yml` service isn't running. They connect via the test-only **`POSTGRES_TEST_URL`** / **`MYSQL_TEST_URL`** / **`FIRESTORE_TEST_HOST`** (defaulting to the docker-compose services), never the app's `DATABASE_URL` or a live Firestore project, because they wipe every task and tag in that database. In CI (`CI` env var set), `ci.yml` always starts all three (Postgres and MySQL as service containers, the Firestore emulator with `docker run`, since services can't take its start command), so there an unreachable database fails the run instead of skipping. Because two independent in-memory SQLite DBs are created in the same process, `makeSqliteRepo()` calls `vi.resetModules()` before each one — `lib/db/sqlite/migrate.ts` caches its migration promise at module scope (correct for production's single connection), so without a fresh module instance per DB, the second DB's tables would never actually get created

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
pnpm build && pnpm start -p 9876   # production (pm2 manages this)
```

See README.md for full pm2 setup instructions.

## Before testing anything in the browser

If Firestore is being used, do not change remote data. If needed, switch to the SQLite version, or to the Firestore emulator (`DB_TYPE=firestore FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`, after `docker compose up -d firestore`), for testing with Playwright or similar tools.
