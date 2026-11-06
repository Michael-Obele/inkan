<script lang="ts">
	import { ArrowRight, ArrowUpRight } from '@lucide/svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import Seal from '#lib/components/seal.svelte';
	import StatusPill from '#lib/components/status-pill.svelte';
	import { formatMoney } from '#lib/money';
	import { ledgerLabel, ledgerTone } from '#lib/ledger-labels';
	import { getAllowance } from '#lib/remote';

	const data = $derived(await getAllowance());

	const steps = [
		{
			n: '01',
			title: 'The agent asks, holding nothing',
			body: 'It names a shop and an amount in dollars. It has no PayPal client id, no secret, and no card. The runner refuses to start if it can see one.'
		},
		{
			n: '02',
			title: 'The service resolves the merchant itself',
			body: 'A handle becomes a merchant id only through a registry the caller cannot reach. Then nine rules run in a fixed order, and the first one that answers decides.'
		},
		{
			n: '03',
			title: 'Money moves through a hold, never a guess',
			body: 'A bare order is created with no card. PayPal reports the payee. If it matches, a single-use capability is spent on one amount and one merchant, and only then is it captured.'
		},
		{
			n: '04',
			title: 'You keep the off switch',
			body: 'What the rules will not allow waits for a person. Revoking a mandate burns the live capability, so the next attempt fails because the permission is gone, not because a flag flipped.'
		}
	];

	const limits = [
		'No authentication on the approval link. The id is random, and it is still not a secret.',
		'No notifications. A request waits, and nothing tells you until you open the screen.',
		'One merchant, one currency, one agent, one person. This is a demonstration of a mechanism.',
		'Sandbox only. No real money moves, and no real card should ever be entered.'
	];

	function when(iso: string): string {
		return `${iso.slice(5, 10)} ${iso.slice(11, 16)}`;
	}
</script>

<svelte:head>
	<title>inkan — an allowance for an AI agent</title>
	<meta
		name="description"
		content="inkan gives an AI agent a spending allowance instead of your PayPal login. A deterministic rule table decides, ambiguity waits for a person, and every attempt lands in a ledger."
	/>
</svelte:head>

<main class="mx-auto w-full max-w-6xl px-5 sm:px-8">
	<!-- The masthead. A document header, not a screenshot above a gradient. -->
	<section
		class="grid gap-8 border-b border-border py-16 sm:py-24 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-16"
	>
		<!-- The seal sits in the margin at wide sizes, like a stamp on a letter. -->
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
				The agent cannot pay.
				<span class="block text-muted-foreground"> The capability lives with the allowance. </span>
			</h1>

			<p class="mt-8 measure text-[1.0625rem] leading-relaxed">
				Agents now buy inside Perplexity and ChatGPT, and the passkey proves it was you. What
				nothing records is what the agent was allowed to do. So this gives it an allowance instead:
				a purpose, a ceiling, one merchant, an expiry. A rule table decides every request, anything
				ambiguous waits for a person, and every attempt lands in a ledger you can read.
			</p>

			<div class="mt-10 flex flex-wrap items-center gap-3">
				<Button href="/allowance" size="lg">
					Open the allowance
					<ArrowRight class="size-3.5" />
				</Button>
				<Button href="/demo" variant="outline" size="lg">Watch it refuse</Button>
			</div>

			<p class="mt-6 text-[0.8125rem] text-muted-foreground">
				Sandbox only &middot; no credentials needed &middot; a recorded run replays offline
			</p>
		</div>
	</section>

	<!-- 01. The artefact. The document itself is the hero image. -->
	<section
		class="grid gap-10 py-16 ruled sm:py-20 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:gap-12 lg:gap-16"
	>
		<div class="flex flex-col gap-5">
			<p class="eyebrow text-muted-foreground">01 &mdash; The artefact</p>
			<h2 class="font-heading text-3xl leading-tight tracking-tight sm:text-4xl">
				A record, not a setting.
			</h2>
			<p class="measure leading-relaxed text-muted-foreground">
				This is the allowance the demo runs on, read live from the service. Every value below is
				data the rule table compares against, so you can predict any verdict from the paper alone.
				Narrowing only ever removes room to spend; there is no control that widens it.
			</p>
			<a
				class="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
				href="/allowance"
			>
				Change the rules yourself
				<ArrowUpRight class="size-3.5" />
			</a>
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
					money to the ceiling and does not re-open an approval.
				</p>
			</div>
		</div>
	</section>

	<!-- 02. The record. Real rows, real PayPal identifiers. -->
	<section
		class="grid gap-10 py-16 ruled sm:py-20 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:gap-12 lg:gap-16"
	>
		<div class="flex flex-col gap-5">
			<p class="eyebrow text-muted-foreground">02 &mdash; The record</p>
			<h2 class="font-heading text-3xl leading-tight tracking-tight sm:text-4xl">
				Every attempt, including the no.
			</h2>
			<p class="measure leading-relaxed text-muted-foreground">
				A refusal is a row, not a silence. The ledger is append-only, so nothing is edited and
				nothing is removed, and a refund appears as its own event pointing at the payment it
				reverses.
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
					Run the four beats and the ledger fills from what actually happened.
				</p>
				<Button href="/demo" variant="outline" class="mt-5">
					Run the agent
					<ArrowRight class="size-3.5" />
				</Button>
			</div>
		{/if}
	</section>

	<!-- The refusal. The one beat a viewer remembers, so it gets its own stage. -->
	<section class="border-y border-border bg-muted/50">
		<div class="mx-auto flex max-w-6xl flex-col gap-10 px-5 py-16 sm:px-8 sm:py-20">
			<p class="eyebrow text-muted-foreground">The moment that matters</p>

			<h2 class="max-w-4xl font-heading text-[2rem] leading-[1.1] tracking-[-0.015em] sm:text-5xl">
				The agent asked for an annual bundle. The single-purchase limit said no, before any money
				moved.
			</h2>

			<!-- Three figures in one register, so the comparison reads as a row, not a sentence. -->
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
					The order is created bare, with no card attached, so a refusal has nothing to release. It
					also costs nothing and returns immediately, because no model is anywhere near the
					decision, and it is written down like every other attempt.
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

	<!-- 03. How it works. A spec list, deliberately not three cards with icons. -->
	<section class="py-16 ruled sm:py-20">
		<p class="eyebrow text-muted-foreground">03 &mdash; How it works</p>
		<h2 class="mt-5 max-w-3xl font-heading text-3xl leading-tight tracking-tight sm:text-4xl">
			Four steps, and the agent holds no credential at any of them.
		</h2>

		<ol class="mt-12 grid gap-px border border-border bg-border sm:grid-cols-2">
			{#each steps as step (step.n)}
				<li class="flex flex-col gap-3 bg-background p-6 sm:p-8">
					<span class="figure text-[0.75rem] text-muted-foreground">{step.n}</span>
					<h3 class="font-heading text-xl leading-snug">{step.title}</h3>
					<p class="text-[0.9375rem] leading-relaxed text-muted-foreground">{step.body}</p>
				</li>
			{/each}
		</ol>
	</section>

	<!-- The boundary. Saying what it does not do is the cheapest credibility there is. -->
	<section
		class="grid gap-10 py-16 ruled sm:py-20 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:gap-12 lg:gap-16"
	>
		<div class="flex flex-col gap-5">
			<p class="eyebrow text-muted-foreground">04 &mdash; The boundary</p>
			<h2 class="font-heading text-3xl leading-tight tracking-tight sm:text-4xl">
				What this does not do.
			</h2>
			<p class="measure leading-relaxed text-muted-foreground">
				Named on purpose, so each one is a decision rather than an omission. A prototype that states
				its own edges is easier to trust than one that does not.
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

	<!-- Close. One action, and what happens when you take it. -->
	<section class="flex flex-col gap-6 py-16 ruled sm:py-20">
		<h2 class="max-w-3xl font-heading text-3xl leading-tight tracking-tight sm:text-4xl">
			One button runs the whole story: a payment, an escalation, two refusals, and a refund you can
			issue yourself.
		</h2>
		<p class="measure text-[0.9375rem] leading-relaxed text-muted-foreground">
			No keys, no database and no network. The recorded run replays answers PayPal actually gave, so
			it works on a train.
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
