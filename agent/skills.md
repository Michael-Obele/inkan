# Skills

Around ninety personal skills are installed in every workspace, not in this repo. Their names and descriptions already sit in your context, so do not improvise a workflow that a skill already defines: load the skill and follow it.

If a skill below is missing from your harness, say so and carry on without it. Do not fake its output.

## Always

- Starting any work, or asked what was decided before → `sepia`. Recall before answering, persist durable decisions and preferences after.
- Any `.svelte` or `.svelte.ts` file → `svelte-code-writer`, for documentation lookup and code analysis.
- Before reporting a change as done, committing, or opening a PR → `forge-review-gates`.
- Before building a feature or changing behaviour → `brainstorming`.
- Before adding a dependency or a new abstraction → `ponytail`. Ask whether it needs to exist at all.

## Build

- Multi-step work from a spec → `writing-plans` · shaping a module's interface → `codebase-design` · checking a state model or UI idea → `prototype` · naming and recording decisions → `domain-modeling` · restructuring modules → `improve-codebase-architecture`
- Stress-testing a plan before committing to it → `grilling` · a hard problem that needs first principles → `ultrathink`
- Svelte reactivity or performance → `svelte-core-bestpractices`
- A new page or component in shadcn-svelte → `shadcn-sveltekit-design` · design tokens and theming → `tailwind-design-system`
- Visual direction or typography → `frontend-design` · palettes, styles, charts → `ui-ux-pro-max` · polishing existing UI → `impeccable`
- Accessibility → `fixing-accessibility` · page load and Core Web Vitals → `web-perf`
- Landing page, pricing or checkout → `conversion-psychology` · marketing copy → `copywriting`

## Backend and auth

- Auth from scratch → `create-auth-skill` · config, sessions, adapters → `better-auth-best-practices`
- Orgs, teams, RBAC → `organization-best-practices` · email verification and password reset → `email-and-password-best-practices` · MFA, TOTP, backup codes → `two-factor-authentication-best-practices`
- CAPTCHA on a form → `turnstile-spin` · Cloudflare deploys → `wrangler` + `workers-best-practices` · Workers, Durable Objects, Agents SDK, transactional email → `cloudflare` · `durable-objects` · `agents-sdk` · `cloudflare-email-service`

## Quality

- Feature test-first → `tdd` · a hard bug or perf regression → `diagnosing-bugs` · superseded `as` casts in tests → `migrate-to-shoehorn`
- Unused code, duplication, changed-code risk → `fallow`
- Reviewing a branch or PR since a point → `code-review` · compressed review comments → `caveman-review` · commit messages → `caveman-commit` · merge or rebase conflict → `resolving-merge-conflicts` · pre-commit hooks → `setup-pre-commit`

## Research and web

- Scraping, crawling or watching a page → `tomoshibi` · verified multi-source research → `deep-research` · primary-source research saved into the repo → `research`
- GitHub operations → `gh-cli` · browser automation → `effing-use` · a setup step only a human can perform → `wizard`

## Context economy

- Long session and fewer tokens wanted → `caveman` · compressing memory or instruction files → `caveman-compress` · ending a session with context intact → `handoff` (+ `claude-handoff`)
- Delegating to subagents → `cavecrew` · parallel workers → `swarm-orchestration` + `subagent-driven-development` · authoring a new skill → `writing-skills` + `writing-for-agents` + `skill-creator` · a capability we lack → `find-skills`
