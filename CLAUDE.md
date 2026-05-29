# Tickr — Claude Code instructions

## Next.js version

This project uses **Next.js 16**. Read `node_modules/next/dist/docs/` before writing any Next.js code — APIs and conventions differ from older versions. Heed deprecation notices.

## Stack

- **Next.js 16** App Router with Server Actions (`'use server'` file directive)
- **SQLite** via `better-sqlite3` — synchronous, server-side only, singleton via `globalThis`
- **Tailwind CSS v4**
- **TypeScript**
- `@uiw/react-md-editor` — loaded via `next/dynamic` with `{ ssr: false }`

## Project structure

```
app/
  actions.ts       # all DB operations (Server Actions)
  page.tsx         # main UI — single page app
  layout.tsx
  globals.css
components/
  TaskCard.tsx     # task list item
  TaskDetail.tsx   # right-panel detail view
  CreateTaskModal.tsx
  TagSelector.tsx  # inline tag picker with create flow
  TagBadge.tsx
  Logo.tsx
  MdEditor.tsx     # dynamic imports for react-md-editor
lib/
  db.ts            # SQLite singleton, schema, seeding
  types.ts         # Task and Tag interfaces
  constants.ts     # PREDEFINED_TAGS and COLOR_PALETTE
data/
  tasks.db         # created at runtime, gitignored
```

## Key conventions

- **Server Actions** for all DB reads and writes — no API routes
- **Tag colors** are stored as full Tailwind class strings (e.g. `"bg-blue-600 text-blue-100 border-blue-500"`). All color options must appear as literals in `COLOR_PALETTE` in `lib/constants.ts` so Tailwind v4 bundles them
- `better-sqlite3` is excluded from webpack bundling via `serverExternalPackages` in `next.config.ts`

## Database

- SQLite at `./data/tasks.db`, created automatically on first run
- Schema: `tasks` and `tags` tables
- Predefined tags seeded with `INSERT OR IGNORE` on every startup
- To reset: delete `./data/tasks.db` and restart

## Running

```bash
npm run dev           # development
npm run build && npm start -- -p 9876   # production (pm2 manages this)
```

See README.md for full pm2 setup instructions.
