# Tickr — Claude Code instructions

## Next.js version

This project uses **Next.js 16**. Read `node_modules/next/dist/docs/` before writing any Next.js code — APIs and conventions differ from older versions. Heed deprecation notices.

## Stack

- **Next.js 16** App Router with Server Actions (`'use server'` file directive)
- **Pluggable database** behind a `TaskRepository` interface (`lib/db/`), selected at runtime via `DB_TYPE`. Only SQLite is implemented (via `better-sqlite3` + Kysely); Postgres/MySQL/Firestore are designed for but not yet built — see "Database backend" below
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

- **`DB_TYPE`** env var selects the backend. Defaults to `sqlite` (zero-config — no env var needed for the common case). `sqlite` is the only implemented backend; setting `DB_TYPE=postgres`, `mysql`, or `firestore` throws a clear "not implemented yet" error from `getRepository()` (`lib/db/factory.ts`) rather than silently falling back
- Postgres/MySQL, when implemented, will share a Kysely-based SQL layer with the SQLite adapter and read connection details from a single **`DATABASE_URL`** connection string (not discrete host/port/user/pass vars)
- **To add a new backend**: implement `TaskRepository` (`lib/db/types.ts`) in a new `lib/db/<backend>/` directory (mirror `lib/db/sqlite/`), then register it in the `switch` in `lib/db/factory.ts`
- All DB access goes through `getRepository()` from `lib/db` — `app/actions.ts`'s Server Actions are thin wrappers over it and contain no backend-specific logic themselves

## SQLite adapter

- SQLite at `./data/tasks.db`, created automatically on first run. Connection is a `better-sqlite3` instance wrapped in Kysely (`lib/db/sqlite/connection.ts`), `globalThis`-cached, with `PRAGMA foreign_keys = ON`
- Schema: `tasks`, `tags`, `task_urls`, and `task_tags` tables
- `tasks` columns: `id`, `title`, `description`, `completed`, `archived`, `due_date`, `created_at`, `updated_at`, `completed_at`, `archived_at`, `sort_order`
- `task_tags` is a join table (`task_id`, `tag_id`, `position`) — replaces the old JSON-array-in-TEXT `tasks.tags` column. `position` preserves tag display order (tag badges render in array order, so this isn't cosmetic). Both FKs cascade on delete
- `task_urls` columns: `id`, `task_id`, `url`, `label`, `created_at` — backs the Links section in the task detail panel. `task_id` cascades on delete
- Predefined tags seeded via Kysely `.onConflict().doNothing()` on every startup (user edits/deletes of predefined tags are never overwritten)
- To reset: delete `./data/tasks.db` and restart

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
