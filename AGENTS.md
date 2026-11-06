# Agent rules for inkan

This file is loaded on every request, so it stays small. The detail lives in `agent/` and is read on demand.

## Stack

- **Bun only**: `bun` / `bunx` for every install, script and binary. No `npm`, `pnpm` or `yarn`.
- **SvelteKit 3** on Svelte 5 runes, TypeScript strict, Vite 8.
- **Tailwind v4** with semantic tokens from `src/routes/layout.css`, plus shadcn-svelte primitives installed by CLI.
- **Drizzle** on Postgres (Neon, `drizzle-orm/neon-http`). **Valibot** for payloads. **Vitest** for tests.
- **PayPal** Orders v2 behind one module, plus `@paypal/agent-toolkit`.

## Before you say it is done

- `bun check` clean. Errors fixed; warnings may stand.
- `bun run test` green. `bun test` runs Bun's own runner, not vitest, so never use it.
- `bunx prettier --write <file>` then `--check` on the files you touched only.
- Ask before `bun run dev` or `bun run build`. Michael keeps servers on known ports.

## Read before you work

| File              | Open it when                                                                |
| ----------------- | --------------------------------------------------------------------------- |
| `agent/rules.md`  | Before writing code, changing behaviour, or wording anything a person reads |
| `agent/skills.md` | Before starting a task, to pick the skill the situation names               |
| `agent/tools.md`  | Before running commands, touching PayPal, or debugging the sandbox          |

Read the one that applies. Do not guess at a rule that is written down one file away.

## Already wired, do not rebuild

- `vite.config.ts` holds every kit option, with `inspector` directly inside `sveltekit({...})`. There is no `svelte.config.js`, and `vitePlugin` was removed in SvelteKit 3.
- `sv-agentation` is mounted dev-only in `src/routes/+layout.svelte`.
- `/api/health` serves the tested `healthPayload` from `src/lib/health.ts`.
- `#lib` resolves through `imports` in `package.json`, mirrored in `paths` in `tsconfig.json` because TypeScript will not probe extensions for `imports` subpaths. `$lib` was removed in SvelteKit 3.
- `spike/` is the Gate 0 evidence and stays in the repo.
- `docs/` is private on purpose. Never un-ignore it.
