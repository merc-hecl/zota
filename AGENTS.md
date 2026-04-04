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

- Keep solutions simple and maintainable; avoid unnecessary abstractions.
- Prefer small, focused changes over broad refactors.
- Do not manually edit generated artifacts under `.scaffold/build`.
- Reuse existing module boundaries instead of introducing parallel patterns.
- For UI behavior changes in chat panel, verify both sidebar and floating views.
- Keep naming explicit and behavior predictable.

## Quality Gate Before Commit

- Run `npm run lint:check`.
- Run `npm run build`.
- If behavior changed, sanity-check related UI flows.

## Release Conventions

- Follow Conventional Commits style used in history (for example
  `feat(scope): ...`, `fix(scope): ...`, `chore: ...`).
- For version releases, update both:
  - `README.md` (English changelog section)
  - `doc/README-zhCN.md` (Chinese changelog section)
- The release notes for a new version should include all user-facing changes
  since the previous release tag.
- Bump `package.json` version.
- Use uppercase `V` tags (for example `V0.0.8`), which trigger
  `.github/workflows/release.yml`.
