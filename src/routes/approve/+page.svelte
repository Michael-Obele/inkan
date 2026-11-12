<script lang="ts">
	import { ArrowRight, ShieldCheck } from '@lucide/svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import StatusPill from '#lib/components/status-pill.svelte';
	import { formatMoney } from '#lib/money';
	import { getAllowance } from '#lib/remote';

	const data = $derived(await getAllowance());

	/**
	 * Where a person decides. It exists as its own route because the card for one
	 * request needs a parent: without this page there was no link anywhere to the
	 * approval screen, so it could only be reached by knowing a URL.
	 */
</script>

<svelte:head><title>Approvals · inkan</title></svelte:head>

<main class="mx-auto w-full max-w-3xl px-5 pt-10 pb-24">
	<header class="flex flex-col gap-4 border-b border-border pb-8">
		<StatusPill tone={data.pendingCount > 0 ? 'warning' : 'success'} label="A person decides" />
		<h1 class="max-w-xl font-heading text-4xl leading-[1.03] tracking-tight text-balance">
			What is waiting for you.
		</h1>
		<p class="max-w-xl text-pretty text-muted-foreground">
			A request the rule table would not decide on its own stops here. Nothing is held and nothing
			is charged while it waits, and refusing costs nothing and is recorded all the same.
		</p>
	</header>

	{#if data.pendingCount === 0}
		<div class="mt-8 flex flex-col gap-4 border border-border bg-muted/40 p-6">
			<p class="font-heading text-xl">Nothing is waiting.</p>
			<p class="text-sm text-pretty text-muted-foreground">
				That is the normal state. A request only lands here when it crosses a line the allowance
				does not cover: a repeat charge at any amount, or an amount above the{' '}
				<span class="font-mono">{formatMoney(data.mandate.autoApproveAmount)}</span> that goes through
				on its own.
			</p>
			<div class="flex flex-wrap gap-3">
				<Button href="/demo">
					<ShieldCheck class="size-4" />
					Run the demo and see one arrive
				</Button>
				<Button variant="outline" href="/allowance">Read the allowance</Button>
			</div>
		</div>
	{:else}
		<ul class="mt-8 flex flex-col">
			{#each data.pending as request (request.id)}
				<li class="border-b border-border py-6 last:border-b-0">
					<a
						class="group flex flex-wrap items-center justify-between gap-4"
						href="/approve/{request.id}"
					>
						<span class="flex min-w-0 flex-col gap-1">
							<span
								class="font-heading text-lg leading-snug transition-colors group-hover:underline"
								>{request.rawRequest}</span
							>
							<span class="font-mono text-xs text-muted-foreground">{request.id}</span>
						</span>
						<span class="flex shrink-0 items-center gap-3">
							<span class="font-mono text-sm tabular">{formatMoney(request.amount)}</span>
							<ArrowRight class="size-4 text-muted-foreground" />
						</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</main>
