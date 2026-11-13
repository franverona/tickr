<div align="center">

<img src="./app/icon.svg" alt="Tickr logo" width="120" />

<h3>Tickr</h3>

[![CI](https://github.com/franverona/tickr/actions/workflows/ci.yml/badge.svg)](https://github.com/franverona/tickr/actions/workflows/ci.yml)

A local task management app for tracking work.

</div>

## Stack

Next.js 16, TypeScript, Tailwind CSS v4, and SQLite (default), Postgres, MySQL or Firestore.

## Features

- Active / Done / Archived tabs; Done and Archived grouped by week, with each Done week's count and median cycle time
- Quick add, drag-and-drop reordering, bulk actions (including select-all per week), tag filters with task counts, and search across tabs
- Context menu to duplicate a task or set a quick due date (also in bulk); Undo in the toast after completing or archiving
- Markdown descriptions with clickable checklists (progress shown on cards), rich paste, CSV-to-table, and `:emoji`, `@mention` and `/snippet` autocomplete
- Attachments: images and videos inline and resizable, images downloadable from a hover button; PDF, text, Markdown, CSV, JSON and ZIP as links (up to 100 MB)
- Due dates with overdue/today/soon badges and a daily browser notification
- Links per task; Jira, GitLab MR and GitHub PR links show as card badges
- Standup summary: copy last week's completed tasks with their MR/PR links
- Command palette (`Cmd/Ctrl+K`) and keyboard shortcuts (`?`)
- Export/import as ZIP (JSON or CSV, with attachments), across any backend

## Getting started

Requires Node 22.22.2+ and pnpm 11 (`corepack enable`).

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). A fresh database starts with a few predefined tags; deleted ones don't come back.

## Database

Set `DB_TYPE` (default `sqlite`). See `.env.example`.

- **SQLite**: `./data/tasks.db`, created on first run. Delete it to reset.
- **Postgres / MySQL**: set `DATABASE_URL`. Local containers: `docker compose up -d postgres` or `mysql`. To reset one, `docker compose rm -sf <service> && docker volume rm tickr_tickr-<service>-data` (not `down -v`, which wipes both).
- **Firestore**: set `FIRESTORE_SERVICE_ACCOUNT_KEY` (service-account JSON on one line). This writes to the live project; for local work run `docker compose up -d firestore` and set `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` instead. On a real project, the first task creation fails until you create the composite index linked in the server logs.

MySQL 26.7 won't open a volume created by 8.4. To keep that data, start it once on 9.7:

```bash
docker compose stop mysql
docker run -d --name tickr-mysql-hop -v tickr_tickr-mysql-data:/var/lib/mysql mysql:9.7
docker logs -f tickr-mysql-hop   # Ctrl+C once it says "ready for connections"
docker stop -t 60 tickr-mysql-hop && docker rm tickr-mysql-hop
docker compose up -d mysql
```

Postgres 18 mounts the volume one level up, so a volume created by the old Postgres 16 service starts as an empty database; the old data is still on the volume. To move it over, dump it with 16 and load it into 18:

```bash
docker compose stop postgres
docker run -d --name tickr-pg16 -e POSTGRES_PASSWORD=postgres -v tickr_tickr-postgres-data:/var/lib/postgresql/data postgres:16-alpine
docker exec tickr-pg16 pg_isready -U postgres   # repeat until it says "accepting connections"
docker exec tickr-pg16 pg_dump -U postgres -d tickr --clean --if-exists > tickr-pg16.sql
docker rm -f tickr-pg16
docker compose up -d postgres
docker exec -i tickr-postgres psql -U postgres -d tickr < tickr-pg16.sql
```

## Running with pm2

Tickr has no login, so it only listens on `127.0.0.1` and only answers `localhost` hosts. To reach it by another name, add it to `ALLOWED_HOSTS`; to expose it on a trusted network, use `pnpm exec next start -H 0.0.0.0 -p 9876`.

```bash
npm install -g pm2
pnpm build
pm2 start "pnpm start -p 9876" --name tickr
pm2 save
pm2 startup   # registers with launchd
```

To update: `git pull && pnpm install && pnpm build && pm2 restart tickr`.

## Backups

`pnpm backup` writes `backups/tickr-<date>-<time>.zip` (or into `BACKUP_DIR`) in the export format, so it restores with Import. It keeps the 30 newest; an empty backup (usually the wrong backend) is named `…-empty.zip` and never counts toward or gets removed by that rotation, so delete those by hand. Daily at 03:00:

```bash
pm2 start "pnpm backup" --name tickr-backup --cron "0 3 * * *" --no-autorestart
pm2 save
```

## Uploads

Stored in `public/uploads/` and never deleted with their task. `pnpm uploads:prune` lists unreferenced files; `--apply` deletes them. Files under a day old are kept, and it refuses to run on a backend with no tasks.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
