<div align="center">

<img src="./app/icon.svg" alt="Tickr logo" width="120" />

<h3>Tickr</h3>

[![CI](https://github.com/franverona/tickr/actions/workflows/ci.yml/badge.svg)](https://github.com/franverona/tickr/actions/workflows/ci.yml)

A local task management app for tracking work.

</div>

## Stack

- **Next.js 16** (App Router, Server Actions)
- **SQLite** via `better-sqlite3`
- **Tailwind CSS v4**
- **TypeScript**
- **@uiw/react-md-editor** for markdown descriptions

## Features

- **Active / Done / Archived** task tabs
- **Inline editing** — title, description (Markdown), tags, due date
- **Tag system** — create tags with a color picker; rename, recolor, or delete tags via the Tags modal
- **Mark complete / reopen / archive / unarchive / delete**
- **Drag-and-drop reordering** of active tasks
- **Due date indicators** — color-coded badges for overdue, due today, and due soon
- **Image support** — drag-and-drop or paste images into descriptions (stored in `public/uploads/`)
- **Task search** — filter tasks by title or description in real time
- **Links section** — attach labeled URLs to any task; MR/PR links get a one-click "Copy for Slack" button
- **Editor enhancements** — paste rich content (web pages, Notion, Docs) and it's converted to Markdown automatically; paste a URL over selected text to wrap it as a Markdown link; paste CSV/TSV data to insert a formatted Markdown table; emoji (`:name`), task mention (`@`), and snippet (`/key`) autocomplete
- **Export** — download all tasks as a ZIP containing `tasks.json` or `tasks.csv` plus any referenced images
- **Import** — restore from an exported ZIP; images are re-uploaded and tag labels are matched or created automatically

## Getting Started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

The SQLite database is created automatically at `./data/tasks.db` on first run. Predefined tags (WIP, UAT, Pipeline, Blocked, Review) are seeded on startup.

## Running as a background service (pm2)

Tickr runs on port **9876** in production mode so it doesn't collide with other dev projects on 3000.

**First-time setup:**

```bash
npm install -g pm2
pnpm build
pm2 start "pnpm start -- -p 9876" --name tickr
pm2 save
pm2 startup   # follow the printed command to register with launchd
```

Open [http://localhost:9876](http://localhost:9876).

**Day-to-day commands:**

```bash
pm2 status          # check if tickr is running
pm2 logs tickr      # tail logs
pm2 restart tickr   # restart after a rebuild
pm2 stop tickr      # stop
pm2 delete tickr    # remove from pm2 entirely
```

**Updating the app:**

```bash
git pull
pnpm install
pnpm build
pm2 restart tickr
```

## Scripts

```bash
pnpm dev             # Start dev server
pnpm build           # Production build
pnpm test            # Run unit tests (Vitest)
pnpm test:watch      # Run tests in watch mode
pnpm lint            # ESLint
pnpm format          # Prettier (write)
pnpm format:check    # Prettier (check)
```

## Data

The database lives at `./data/tasks.db` and is excluded from version control. To reset, delete the file and restart the server.

Uploaded images are stored at `public/uploads/` (gitignored). They are included automatically when using the Export feature.
