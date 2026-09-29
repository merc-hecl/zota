# AGENTS.md

This file provides project-specific guidance for AI coding agents working on
`zota`.

## Project Overview

- `zota` is a Zotero plugin for chatting with AI about PDFs and library items.
- Stack: TypeScript + `zotero-plugin-scaffold`.
- Main entry is in `src/`, with build output generated under `.scaffold/build`.

## Repository Layout

- `src/modules/chat`: chat session logic, persistence, export, PDF/document flow.
- `src/modules/providers`: built-in model providers and provider abstractions.
- `src/modules/ui/chat-panel`: sidebar/floating chat UI, events, rendering.
- `src/modules/preferences`: settings UI and preference helpers.
- `addon/`: static addon assets (icons, locale files, manifest-related resources).
- `doc/`: human-facing docs, including Chinese README.

## Setup & Commands

- Install deps: `npm install`
- Dev mode: `npm run start`
- Build + type check: `npm run build`
- Lint check: `npm run lint:check`
- Auto-fix lint/format: `npm run lint:fix`
- Tests: `npm run test`
- Package release artifact: `npm run release`

## Working Rules for This Repo


- Do not manually edit generated artifacts under `.scaffold/build`.

- For UI behavior changes in chat panel, verify both sidebar and floating views.

- Keep naming explicit.

### Testing Rules

All testing rules share one intent: tests must verify real user-facing
behavior, never implementation details.

- **E2E-first**: E2E tests are the preferred (ideally sole) testing
  mechanism. Use them to verify complex features work. Every E2E test must
  end with a verifiable, repeatable artifact (log, screenshot, exported
  file, ...) proving the feature actually ran.
- **No after-the-fact unit tests**: NEVER write unit tests after the code
  exists. If a system must be tested in isolation, FIRST write down all the
  ways it could fail, THEN write the code against that list.
- **Harmful test smells** — never write these:
  - Tautological tests: they restate the implementation and prove nothing.
  - Change-detector tests: they fail on any change, not just real
    regressions.
- **No reflexive regression tests**: do not add a regression test for a bug
  fix unless there is a genuine gap in behavior coverage.

## Quality Gate Before Commit

- Run `npm run lint:check`.
- Run `npm run build`.
- If behavior changed, sanity-check related UI flows.

## Release Conventions

- Follow the Gitmoji commit convention (https://gitmoji.dev/): begin each
  commit with the matching emoji, then a short imperative description
  (for example `✨ add chat history export`, `🐛 fix floating panel drag`,
  `📝 update README`, `⬆️ upgrade deps for Zotero 10`).
- For version releases, update both:
  - `README.md` (English changelog section)
  - `doc/README-zhCN.md` (Chinese changelog section)
- The release notes for a new version should include all user-facing changes
  since the previous release tag.
- Bump `package.json` version.
- Use uppercase `V` tags (for example `V0.0.8`), which trigger
  `.github/workflows/release.yml`.
