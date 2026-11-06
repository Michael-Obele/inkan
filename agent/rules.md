# Rules, do and do not

Read this before writing code or changing behaviour. `AGENTS.md` keeps the always-on part short; this file holds the rest.

## Working with Michael

- **Ask before a dev server or a build.** He keeps servers on specific ports. Same for long or expensive runs.
- **Warn before a download over 300 MB.** Under that, just do it. He is often on metered mobile data.
- **Never invent project facts.** If scope, a number, a version or an outcome is unknown, ask or stay general.
- **Report findings at their real severity.** Do not soften a problem to save a fix round, and do not pre-filter what you report.
- **Keep chat replies short.** Lead with the finding and the decision needed. Long detail goes in a file.

## Svelte and TypeScript

Do:

- Runes only: `$state`, `$state.raw`, `$props()`, `$derived`, `$derived.by`, `$effect`, `$bindable()`.
- Plain event attributes: `onclick`, `onsubmit`, `onchange`.
- `$app/state`, never `$app/stores`. `$app/env` for `browser` and `dev`, never `$app/environment`.
- Remote functions for reads and mutations, in `src/lib/remote/*.remote.ts`, re-exported by name from `src/lib/remote/index.ts`.
- `form.fields.name.as('text')` bound to native inputs, letting native submit or `enhance()` drive it.
- Valibot for every payload, plus `preflight(schema)` for client checks.
- `<svelte:boundary>` around async UI.
- `+page.server.ts` / `+layout.server.ts` only for initial `load`.

Do not:

- `export let`, `$:`, `on:click`, `createEventDispatcher`, `<slot />`, `beforeUpdate`, `afterUpdate`, `<svelte:component>`, `new Component()`, `$$props`, `$$restProps`.
- Svelte stores for component state.
- A top-level `let` and expect reactivity. Use `$state()`.
- Hand-rolled `async handleSubmit`.

## UI and accessibility

- Every page passes **WCAG AAA** before it counts as done: contrast, sizes, weight, hierarchy.
- **No gradients.** Solid colours, plenty of space, quiet and professional.
- Semantic Tailwind tokens from `src/routes/layout.css`. No hardcoded hex or hsl in components.
- Responsive prefixes (`lg:flex-row`), and the `cn` helper for conditional classes.
- shadcn-svelte components come from `bunx shadcn-svelte@latest add <name>`. Never hand-write one.
- Icons: `@lucide/svelte` only, never `lucide-svelte`. Status, direction or an affordance at most. No decoration, and no AI-sparkle icons on controls; a text label should carry the meaning.

## Money and security

- Money is stored as **integers**, never floats.
- **Exactly one module reads the PayPal credentials.** Nothing else imports them.
- The agent runner never receives a `PAYPAL_*` variable. It validates its own environment at startup and throws if one is present. That absence is the product claim, so never pass the service env to the runner.
- `.env` and `spike/.env` are never committed. `.env.example` carries names and comments only.
- `docs/` holds the private plan. It is gitignored deliberately. Do not un-ignore it, and do not copy its reasoning into the public repo.
- Never put a secret in a log line, an error message, a test fixture or a chat message.

## Git

- Commit only when asked. When asked, commit everything pending.
- Conventional Commits, subject 50 characters or fewer.
- No AI attribution anywhere: no `Co-Authored-By` trailer, no "Generated with" line, and the author and committer stay Michael's own.
- Never force-push, never rewrite published history.

## Comments and writing

- Comments are **one to three lines**, and only where the code cannot speak: the why, a non-obvious constraint, a platform quirk. No narration of the next line, no numbered walkthroughs, no essay JSDoc.
- Writing for people: simple everyday words. No em dashes, no clever phrasing, no punchy one-word endings.
- README and repo prose follow the same tone as the chat replies: direct, plain, no filler.

## Dependencies

- `bun add <package>`, never a hand-edited `package.json`.
- Research before adding: Svelte 5 support, maintenance, size. If the platform or an installed package already does it, use that instead.
- Every added dependency must earn its place. The scaffold already covers styling, components, validation, tests and the database.

## Do not, in one list

Do not commit secrets. Do not un-ignore `docs/`. Do not run a build or a dev server unasked. Do not format the whole project. Do not use `npm` in any command, doc or lockfile. Do not use Prisma: this project uses Drizzle. Do not claim something works that you have not run.
