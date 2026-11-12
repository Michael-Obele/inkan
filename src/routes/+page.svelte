<script lang="ts">
	import { ArrowRight, ArrowUpRight } from '@lucide/svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import CommandBlock from '#lib/components/command-block.svelte';
	import Seal from '#lib/components/seal.svelte';
	import StatusPill from '#lib/components/status-pill.svelte';
	import { formatMoney } from '#lib/money';
	import { ledgerLabel, ledgerTone } from '#lib/ledger-labels';
	import { getAllowance } from '#lib/remote';

	const data = $derived(await getAllowance());

	const capabilities = [
		{
			lead: 'A rule table decides.',
			body: 'Nine rules, checked in a fixed order. A refusal names the rule that stopped it. No model is anywhere in that path, so the same request always gets the same answer.'
		},
		{
			lead: 'A refusal costs nothing.',
			body: 'The order is created with no card attached. That is why a shop the allowance does not cover never has money held against it.'
		},
		{
			lead: 'You keep the off switch.',
			body: 'Revoking burns the live capability, so the next attempt fails because the permission is gone. Then every row stays readable.'
		},
		{
			lead: 'Every attempt is written down.',
			body: 'Including the refused ones. A refund is its own row, pointing at the payment it reverses.'
		}
	];

	const numbers = [
		{ figure: '9', label: 'rules, fixed order' },
		{ figure: '13', label: 'adversarial cases, all held' },
		{ figure: '133', label: 'tests' },
		{ figure: '0', label: 'model calls on a refusal' }
	];

	const limits = [
		'The approval link has no login. Ids are random, and that is still not a secret.',
		'No notifications. A request waits until you open the screen.',
		'One merchant, one currency, one agent, one person.',
		'Sandbox only. No real money moves, and real card details should never be entered.'
	];

	const questions = [
		{
			q: 'Do I need PayPal credentials to look at it?',
			a: 'No. Run it with DEMO_MODE=replay and the app answers from a recording of a real sandbox run. No keys, no database, no network.'
		},
		{
			q: 'Does an AI decide anything?',
			a: 'No. The model writes the receipt text and nothing else. It cannot allow a purchase, and no rule reads its output.'
		},
		{
			q: 'Can the agent raise its own limit?',
			a: 'No. Narrowing only removes room. There is no control that adds any, and the ceiling cannot be raised once lowered.'
		},
		{
			q: 'What happens when it asks for too much?',
			a: 'The request is refused before any card is attached, and the refusal is written to the ledger with the rule that stopped it.'
		},
		{
			q: 'Can I undo a revocation?',
			a: 'No. You issue a new allowance instead. An off switch that can be switched back on by the thing it stopped is not an off switch.'
		}
	];

	function when(iso: string): string {
		return `${iso.slice(5, 10)} ${iso.slice(11, 16)}`;
	}
</script>

<svelte:head>
	<title>inkan: an allowance for your AI agent</title>
	<meta
		name="description"
		content="An AI agent gets a spending allowance instead of your PayPal login. A rule table decides every request, a refusal costs nothing, and every attempt is written down."
	/>
</svelte:head>

<main class="mx-auto w-full max-w-6xl px-5 sm:px-8">
	<section
		class="grid gap-8 border-b border-border py-16 sm:py-24 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-16"
	>
		<div
			class="flex items-center gap-4 lg:col-start-2 lg:row-start-1 lg:flex-col lg:items-end lg:gap-3"
		>
			<div class="shrink-0 seal-mark">
				<Seal size="md" label="inkan" sublabel="2026" />
			</div>
			<p
				class="max-w-56 text-[0.75rem] leading-relaxed text-muted-foreground lg:max-w-44 lg:text-right"
			>
				inkan is the seal a person presses onto a document to authorise it.
			</p>
		</div>

		<div class="flex flex-col lg:col-start-1 lg:row-start-1">
			<p class="eyebrow text-muted-foreground">PayPal AI Hackathon 2026</p>

			<h1
				class="mt-5 max-w-3xl font-heading text-[2.75rem] leading-[0.98] tracking-[-0.02em] sm:text-6xl lg:text-[4.25rem]"
			>
				An allowance for your AI agent.
			</h1>

			<p class="mt-7 measure text-[1.0625rem] leading-relaxed">
				Agents now buy things for people, and the passkey proves it was you. Nothing records what
				the agent was allowed to do. So this gives it an allowance: a purpose, a ceiling, one shop,
				an expiry. It asks. A rule table answers. You can read every attempt, and stop it.
			</p>

			<div class="mt-9 flex flex-wrap items-center gap-3">
				<Button href="/allowance" size="lg">
					Open the allowance
					<ArrowRight class="size-3.5" />
				</Button>
				<Button href="/demo" variant="outline" size="lg">Run the demo</Button>
			</div>

			<p class="mt-6 text-[0.8125rem] text-muted-foreground">
				Sandbox only. This site runs the live sandbox; the replay needs no keys and no database.
			</p>

			<details class="mt-8 max-w-xl">
				<summary
					class="cursor-pointer text-[0.8125rem] text-muted-foreground underline underline-offset-4 hover:text-foreground"
				>
					Run it yourself, offline
				</summary>
				<div class="mt-4">
					<CommandBlock
						label="No keys, no database"
						lines={[
							'git clone https://github.com/Michael-Obele/inkan.git',
							'cd inkan && bun install',
							'bun run dev'
						]}
					/>
					<p class="mt-3 text-[0.8125rem] text-muted-foreground">
						A clone with no <code class="font-mono">.env</code> replays the recorded sandbox run, so every
						screen works before you configure anything.
					</p>
				</div>
			</details>
		</div>
	</section>

	<section
		class="grid gap-10 py-16 ruled sm:py-20 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] md:gap-12 lg:gap-16"
	>
		<h2 class="font-heading text-2xl leading-tight tracking-tight sm:text-3xl">What it is</h2>

		<dl class="flex flex-col">
			{#each capabilities as item (item.lead)}
				<div class="border-b border-border py-4 first:border-t first:pt-5">
					<dt class="text-[0.9375rem] font-medium">{item.lead}</dt>
					<dd class="mt-1 measure text-[0.9375rem] leading-relaxed text-muted-foreground">
						{item.body}
					</dd>
				</div>
			{/each}
		</dl>
	</section>

	<section
		class="grid gap-10 py-16 ruled sm:py-20 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] md:gap-12 lg:gap-16"
	>
		<div class="flex flex-col gap-4">
			<h2 class="font-heading text-2xl leading-tight tracking-tight sm:text-3xl">
				What the agent is allowed
			</h2>
			<p class="measure text-[0.9375rem] leading-relaxed text-muted-foreground">
				Read live from the service. Every value below is data the rule table compares against, so
				you can work out any verdict from this card alone.
			</p>
		</div>

		<div class="border border-border bg-card">
			<div class="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
				<p class="eyebrow text-muted-foreground">Spending authority</p>
				<StatusPill
					tone={data.mandate.status === 'active' ? 'success' : 'danger'}
					label={data.mandate.status}
				/>
			</div>

			<dl class="divide-y divide-border">
				<div class="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-4 px-5 py-3.5">
					<dt class="text-[0.8125rem] text-muted-foreground">For</dt>
					<dd class="text-[0.9375rem]">{data.mandate.purpose}</dd>
				</div>
				<div class="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-4 px-5 py-3.5">
					<dt class="text-[0.8125rem] text-muted-foreground">Only at</dt>
					<dd class="figure text-[0.875rem]">{data.storeSlug}</dd>
				</div>
				<div class="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-4 px-5 py-3.5">
					<dt class="text-[0.8125rem] text-muted-foreground">In total</dt>
					<dd class="figure text-[0.9375rem]">{formatMoney(data.mandate.ceiling)}</dd>
				</div>
				<div class="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-4 px-5 py-3.5">
					<dt class="text-[0.8125rem] text-muted-foreground">One purchase</dt>
					<dd class="figure text-[0.9375rem]">{formatMoney(data.mandate.perTransactionCap)}</dd>
				</div>
				<div class="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-4 px-5 py-3.5">
					<dt class="text-[0.8125rem] text-muted-foreground">Without asking</dt>
					<dd class="figure text-[0.9375rem]">{formatMoney(data.mandate.autoApproveAmount)}</dd>
				</div>
				<div class="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-4 px-5 py-3.5">
					<dt class="text-[0.8125rem] text-muted-foreground">Good until</dt>
					<dd class="figure text-[0.9375rem]">{data.mandate.expiresAt.slice(0, 10)}</dd>
				</div>
			</dl>

			<div class="border-t border-border px-5 py-4">
				<p class="text-[0.8125rem] text-muted-foreground">
					{formatMoney(data.spent)} of {formatMoney(data.mandate.ceiling)} committed. A refund returns
					money to the ceiling. It does not re-open an approval.
				</p>
			</div>
		</div>
	</section>

	<section
		class="grid gap-10 py-16 ruled sm:py-20 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] md:gap-12 lg:gap-16"
	>
		<div class="flex flex-col gap-4">
			<h2 class="font-heading text-2xl leading-tight tracking-tight sm:text-3xl">
				What it has tried
			</h2>
			<p class="measure text-[0.9375rem] leading-relaxed text-muted-foreground">
				The most recent rows from the ledger, including the ones that were refused.
			</p>
			<a
				class="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
				href="/ledger"
			>
				Read all {data.ledgerCount}
				{data.ledgerCount === 1 ? 'event' : 'events'}
				<ArrowUpRight class="size-3.5" />
			</a>
		</div>

		{#if data.recent.length > 0}
			<div>
				<div
					class="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-border pb-2 eyebrow text-muted-foreground"
				>
					<span>What happened</span>
					<span class="text-right">When</span>
				</div>
				<ul>
					{#each data.recent as row (row.id)}
						<li
							class="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 border-b border-border py-3"
						>
							<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
								<StatusPill tone={ledgerTone(row.kind)} label={ledgerLabel(row.kind)} />
								<span class="figure text-[0.9375rem]">{formatMoney(row.amount)}</span>
							</div>
							<span class="text-right figure text-[0.75rem] text-muted-foreground"
								>{when(row.at)}</span
							>
						</li>
					{/each}
				</ul>
			</div>
		{:else}
			<div class="border border-border px-5 py-8">
				<p class="font-heading text-xl">Nothing has been bought yet</p>
				<p class="mt-1 text-[0.9375rem] text-muted-foreground">
					Run the four beats and the ledger fills in from what happened.
				</p>
				<Button href="/demo" variant="outline" class="mt-5">
					Run the agent
					<ArrowRight class="size-3.5" />
				</Button>
			</div>
		{/if}
	</section>

	<section class="border-y border-border bg-muted/50">
		<div class="mx-auto flex max-w-6xl flex-col gap-10 px-5 py-16 sm:px-8 sm:py-20">
			<div class="flex max-w-3xl flex-col gap-4">
				<h2 class="font-heading text-[1.75rem] leading-tight tracking-tight sm:text-4xl">
					One refusal, in full
				</h2>
				<p class="measure text-[0.9375rem] leading-relaxed">
					The agent asked for an annual bundle. The single-purchase limit said no. Nothing was held
					against the card.
				</p>
			</div>

			<dl class="grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-3">
				<div class="flex flex-col gap-2 bg-background px-5 py-5">
					<dt class="eyebrow text-muted-foreground">Asked for</dt>
					<dd class="figure text-2xl">$340.00</dd>
				</div>
				<div class="flex flex-col gap-2 bg-background px-5 py-5">
					<dt class="eyebrow text-muted-foreground">One purchase allows</dt>
					<dd class="figure text-2xl">{formatMoney(data.mandate.perTransactionCap)}</dd>
				</div>
				<div class="flex flex-col gap-2 bg-background px-5 py-5">
					<dt class="eyebrow text-muted-foreground">Held against the card</dt>
					<dd class="figure text-2xl">$0.00</dd>
				</div>
			</dl>

			<div class="flex flex-col gap-3 border-l-2 border-destructive pl-5">
				<p class="figure text-[0.8125rem] text-destructive">over_per_txn_cap</p>
				<p class="measure text-[0.9375rem] leading-relaxed">
					There was nothing to release, because no card was attached yet. A refusal also costs
					nothing to produce: no model runs, so it does not depend on a network call, and the row is
					written like any other.
				</p>
			</div>

			<div>
				<Button href="/demo" size="lg">
					Run the four beats
					<ArrowRight class="size-3.5" />
				</Button>
			</div>
		</div>
	</section>

	<section class="py-16 ruled sm:py-20">
		<h2 class="font-heading text-2xl leading-tight tracking-tight sm:text-3xl">By the numbers</h2>
		<p class="mt-3 measure text-[0.9375rem] leading-relaxed text-muted-foreground">
			Measured on this machine, not estimated.
		</p>

		<dl class="mt-8 grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
			{#each numbers as item (item.label)}
				<div class="flex flex-col gap-1.5 bg-background px-5 py-6">
					<dt class="figure text-3xl">{item.figure}</dt>
					<dd class="eyebrow text-muted-foreground">{item.label}</dd>
				</div>
			{/each}
		</dl>
	</section>

	<section
		class="grid gap-10 py-16 ruled sm:py-20 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] md:gap-12 lg:gap-16"
	>
		<div class="flex flex-col gap-4">
			<h2 class="font-heading text-2xl leading-tight tracking-tight sm:text-3xl">
				What this does not do
			</h2>
			<p class="measure text-[0.9375rem] leading-relaxed text-muted-foreground">
				Written down so each one is a decision you can check, and not something you find out later.
			</p>
		</div>

		<ul class="flex flex-col">
			{#each limits as limit, index (limit)}
				<li class="flex gap-4 border-b border-border py-4 first:border-t">
					<span class="shrink-0 figure text-[0.75rem] text-muted-foreground"
						>{String(index + 1).padStart(2, '0')}</span
					>
					<span class="text-[0.9375rem] leading-relaxed">{limit}</span>
				</li>
			{/each}
		</ul>
	</section>

	<section
		class="grid gap-10 py-16 ruled sm:py-20 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] md:gap-12 lg:gap-16"
	>
		<h2 class="font-heading text-2xl leading-tight tracking-tight sm:text-3xl">Questions</h2>

		<div class="flex flex-col">
			{#each questions as question (question.q)}
				<details class="group border-b border-border first:border-t">
					<summary
						class="flex cursor-pointer items-center justify-between gap-4 py-4 text-[0.9375rem] font-medium"
					>
						{question.q}
						<span
							class="figure text-muted-foreground transition-transform group-open:rotate-45"
							aria-hidden="true">+</span
						>
					</summary>
					<p class="measure pb-5 text-[0.9375rem] leading-relaxed text-muted-foreground">
						{question.a}
					</p>
				</details>
			{/each}
		</div>
	</section>

	<section class="flex flex-col gap-6 py-16 ruled sm:py-20">
		<h2 class="max-w-3xl font-heading text-3xl leading-tight tracking-tight sm:text-4xl">
			Run the demo
		</h2>
		<p class="measure text-[0.9375rem] leading-relaxed text-muted-foreground">
			One button runs four attempts: a payment, one that waits for you, two refusals, and a refund.
			Every row comes from a call that actually happened, with the identifiers PayPal returned.
		</p>
		<div class="flex flex-wrap items-center gap-3">
			<Button href="/demo" size="lg">
				Start the demo
				<ArrowRight class="size-3.5" />
			</Button>
			<Button href="/ledger" variant="outline" size="lg">Open the ledger</Button>
		</div>
	</section>
</main>
