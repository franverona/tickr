<div align="center">

<img src="./app/icon.svg" alt="Tickr logo" width="120" />

<h3>Tickr</h3>

[![CI](https://github.com/franverona/tickr/actions/workflows/ci.yml/badge.svg)](https://github.com/franverona/tickr/actions/workflows/ci.yml)

A local task management app for tracking work.

</div>

## Stack

- **Next.js 16** (App Router, Server Actions)
- **SQLite** (default), **Postgres**, **MySQL**, or **Firestore** — pluggable via `DB_TYPE`
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
- **Attachments** — drag-and-drop or paste files into descriptions: images show inline; PDF, text, Markdown, CSV, JSON and ZIP files are added as links (up to 10 MB each, stored in `public/uploads/`)
- **Task search** — filter tasks by title, description, tag, or link label or URL in real time, across tabs
- **Command palette** (`Ctrl`/`Cmd`+`K`) — jump to any task or action from the keyboard
- **Keyboard shortcuts** — full set of shortcuts for navigation and actions; press `?` for the cheat sheet
- **Bulk actions** — select several tasks to complete, reopen, archive, unarchive, delete, or tag them at once
- **Due-date notifications** — a browser notification once a day, while the app is open, listing tasks that are overdue or due today
- **Links section** — attach labeled URLs to any task; MR/PR links get a one-click "Copy for Slack" button
- **Standup summary** — on the Done tab, copy the tasks completed in the last 7 days, with their MR/PR links, as a Markdown list
- **Editor enhancements** — paste rich content (web pages, Notion, Docs) and it's converted to Markdown automatically; paste a URL over selected text to wrap it as a Markdown link; paste CSV/TSV data to insert a formatted Markdown table; emoji (`:name`), task mention (`@`), and snippet (`/key`) autocomplete
- **Export** — download all tasks as a ZIP containing `tasks.json` or `tasks.csv` plus every uploaded file the descriptions reference
- **Import** — restore from an exported ZIP (merge, or replace everything); attachments are re-uploaded, tag labels are matched or created automatically, and timestamps are kept. `@` mention links are re-linked from JSON exports

## Getting Started

Requires **Node 22.22.2 or later** (see `.nvmrc`) and **pnpm 11** (`corepack enable` picks up the version pinned in `package.json`).

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

By default, Tickr uses SQLite — no config needed. On every backend, a fresh database (no tasks and no tags) starts with predefined tags (WIP, UAT, Pipeline, Blocked, Review); you can rename or delete them, and they won't come back. See [Database](#database) below to use Postgres, MySQL, or Firestore instead.

## Database

Pluggable via `DB_TYPE`, defaulting to `sqlite`.

### SQLite

Created automatically at `./data/tasks.db` on first run — no config needed. To reset, delete the file and restart the server.

### Postgres

Set `DB_TYPE=postgres` and `DATABASE_URL` (e.g. `postgresql://user:pass@host:5432/dbname`). For a local Postgres to test against: `docker compose up -d postgres` (see `docker-compose.yml`), then copy `.env.example` to `.env.local` and uncomment the two variables. To reset: `docker compose down -v` (drops the local container's volume), or clear the tables directly for a remote instance.

### MySQL

Set `DB_TYPE=mysql` and `DATABASE_URL` (e.g. `mysql://user:pass@host:3306/dbname`). For a local MySQL to test against: `docker compose up -d mysql` (see `docker-compose.yml`), then copy `.env.example` to `.env.local` and uncomment the two variables. To reset: `docker compose down -v` (drops the local container's volume), or clear the tables directly for a remote instance.

### Firestore

Set `DB_TYPE=firestore` and `FIRESTORE_SERVICE_ACCOUNT_KEY` (the full service-account JSON from Firebase Console → Project Settings → Service Accounts → Generate new private key, as a single-line string). There's no local/emulator mode — this always connects to the real remote Firestore project, even in dev, so use a project you don't mind writing test data to. The first `createTask` call will throw an error containing a Firebase Console link to create a required composite index — click through it once. To reset, clear the `tasks`/`tags` collections directly in the Firebase Console.

## Running as a background service (pm2)

Tickr runs on port **9876** in production mode so it doesn't collide with other dev projects on 3000.

**First-time setup:**

```bash
npm install -g pm2
pnpm build
pm2 start "pnpm start -p 9876" --name tickr
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
pnpm backup          # Write a backup ZIP to backups/ (see Backups)
```

## Backups

`pnpm backup` writes `backups/tickr-<date>-<time>.zip` (gitignored) in the same format as the Export feature: `tasks.json` plus the uploaded files the tasks reference, so it restores with the regular Import. It uses the same backend as the app (it reads `.env.local`), keeps the 30 newest backups, and writes to `BACKUP_DIR` instead when that's set (e.g. a synced or external folder).

To run it daily at 03:00 with pm2:

```bash
pm2 start "pnpm backup" --name tickr-backup --cron "0 3 * * *" --no-autorestart
pm2 save
```

## Uploads

Uploaded files are stored at `public/uploads/` (gitignored). Accepted types are images (PNG, JPEG, GIF, WebP), PDF, plain text, Markdown, CSV, JSON and ZIP, up to 10 MB each. Files referenced from task descriptions are included automatically when using the Export feature.
