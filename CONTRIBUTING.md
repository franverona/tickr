# Contributing

## Setup

Requires Node 22.22.2+ and pnpm 11 (`corepack enable`).

```bash
pnpm install
pnpm dev
```

SQLite works with no config. For Postgres, MySQL or the Firestore emulator, run `docker compose up -d <service>` and copy `.env.example` to `.env.local` (see [README](README.md#database)).

## Before opening a PR

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm format:check
pnpm test
```

Cross-backend tests skip unless the docker-compose databases are running. CI runs them all, plus `pnpm build` and a production smoke test.

## Commits and PRs

- [Conventional Commits](https://www.conventionalcommits.org/) (`feat(scope): …`, `fix: …`, `docs: …`), enforced by commitlint.
- One change per PR. PRs are squash-merged and need the `ci` check.
- Add or update tests in `__tests__/` for new logic.
- Comment only what the code can't say: the why, not the what.

## Dependencies

Dependabot patch/minor updates auto-merge, except 0.x minor bumps. docker-compose image bumps never do: sync `ci.yml`'s service images by hand and check the container still starts.
