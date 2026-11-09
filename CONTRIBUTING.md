# Contributing

Thanks for helping with Tickr. Bug reports, ideas and pull requests are all welcome.

## Reporting a bug

Search the existing issues first. If it's new, open an issue with:

- What you did, what you expected and what happened instead
- Your database backend (`DB_TYPE`) and browser
- Screenshots or server logs if they help

## Suggesting a feature

Open an issue describing the problem it solves before writing code. Tickr is a small, local tool, so features that add configuration or narrow use cases may be declined. Agreeing on the idea first saves you wasted work.

## Security issues

Don't open a public issue. Report it privately through the repository's **Security** tab ("Report a vulnerability").

## Pull requests

1. For anything beyond a small fix, open or comment on an issue first.
2. Branch from `main` and keep the PR to one change.
3. Add or update tests for new logic.
4. Make sure `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm format:check` and `pnpm test` pass. CI must be green before merging.
5. Use [Conventional Commits](https://www.conventionalcommits.org/) for the title (`feat(scope): …`, `fix: …`, `docs: …`). PRs are squash-merged, so the title becomes the commit.
6. Describe what changed and why, link the issue (`Fixes #123`), and add screenshots for UI changes.

Comment only what the code can't say: the why, not the what.

Changes that touch the database must work on every backend (SQLite, Postgres, MySQL and Firestore), and exports must keep importing across them.
