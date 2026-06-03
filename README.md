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
- **Overdue date indicator**
- **Image support** — drag-and-drop or paste images into descriptions (stored in `public/uploads/`)
- **Export** — download all tasks as a ZIP containing `tasks.json` or `tasks.csv` plus any referenced images
- **Import** — restore from an exported ZIP; images are re-uploaded and tag labels are matched or created automatically

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The SQLite database is created automatically at `./data/tasks.db` on first run. Predefined tags (WIP, UAT, Pipeline, Blocked, Review) are seeded on startup.

## Running as a background service (pm2)

Tickr runs on port **9876** in production mode so it doesn't collide with other dev projects on 3000.

**First-time setup:**

```bash
npm install -g pm2
npm run build
pm2 start "npm start -- -p 9876" --name tickr
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
npm install
npm run build
pm2 restart tickr
```

## Scripts

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm test             # Run unit tests (Vitest)
npm run test:watch   # Run tests in watch mode
npm run lint         # ESLint
npm run format       # Prettier (write)
npm run format:check # Prettier (check)
```

## Data

The database lives at `./data/tasks.db` and is excluded from version control. To reset, delete the file and restart the server.

Uploaded images are stored at `public/uploads/` (gitignored). They are included automatically when using the Export feature.
