<script lang="ts">
	import {
		ArrowRight,
		CircleCheck,
		Clock,
		ExternalLink,
		Play,
		Receipt,
		ShieldX,
		Store,
		Wallet
	} from '@lucide/svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import StatusPill from '#lib/components/status-pill.svelte';
	import { formatMoney } from '#lib/money';
	import { ledgerLabel, ledgerTone } from '#lib/ledger-labels';
	import { getAllowance, lowerCeiling, stopAgent } from '#lib/remote';

	const data = $derived(await getAllowance());

	let busy = $state(false);
	let confirming = $state(false);
	let note = $state<string | null>(null);
	let error = $state<string | null>(null);

	// Follows the server value until the person edits it, then stops.
	let ceilingInput = $state<string | null>(null);

	const revoked = $derived(data.mandate.status === 'revoked');
	const remaining = $derived(data.mandate.ceiling.cents - data.spent.cents);
	const usedPercent = $derived(
		data.mandate.ceiling.cents === 0
			? 0
			: Math.min(100, Math.round((data.spent.cents / data.mandate.ceiling.cents) * 100))
	);
	const ceilingValue = $derived(ceilingInput ?? (data.mandate.ceiling.cents / 100).toFixed(2));

	const rules = $derived([
		{ label: 'For', value: data.mandate.purpose, mono: false },
		{ label: 'Only at', value: data.storeSlug, mono: true },
		{ label: 'Good until', value: data.mandate.expiresAt.slice(0, 10), mono: true },
		{ label: 'Ceiling', value: formatMoney(data.mandate.ceiling), mono: true },
		{ label: 'One purchase', value: formatMoney(data.mandate.perTransactionCap), mono: true },
		{ label: 'Without asking', value: formatMoney(data.mandate.autoApproveAmount), mono: true }
	]);

	async function saveCeiling() {
		const cents = Math.round(Number.parseFloat(ceilingValue) * 100);
		if (!Number.isFinite(cents) || cents <= 0) {
			error = 'Enter an amount in dollars, like 80.00.';
			return;
		}
		if (cents >= data.mandate.ceiling.cents) {
			error = `That is not lower than the ceiling of ${formatMoney(data.mandate.ceiling)}. Narrowing only removes room to spend.`;
			return;
		}

		busy = true;
		error = null;
		note = null;
		try {
			const result = await lowerCeiling({ ceilingCents: cents });
			if (!result.ok) {
				error = result.error;
				return;
			}
			note = `Ceiling lowered to ${formatMoney({ cents, currency: data.mandate.ceiling.currency })}. The ledger records the change.`;
			ceilingInput = null;
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'the service did not answer';
		} finally {
			busy = false;
		}
	}

	async function revoke() {
		busy = true;
		error = null;
		note = null;
		try {
			const result = await stopAgent();
			if (!result.ok) {
				error = result.error;
				return;
			}
			note = `Stopped. ${result.liveCapabilitiesKilled} live capability killed.`;
			confirming = false;
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'the service did not answer';
		} finally {
			busy = false;
		}
	}

	function when(iso: string): string {
		return iso.slice(5, 16).replace('T', ' ');
	}
</script>

<svelte:head><title>The allowance · inkan</title></svelte:head>

<main class="mx-auto w-full max-w-5xl px-5 pt-10 pb-24">
	<header
		class="-mx-5 grid gap-10 border-b border-border bg-muted/40 px-5 pb-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-end"
	>
		<div class="flex flex-col gap-5">
			<div class="flex flex-wrap items-center gap-3">
				<StatusPill tone={revoked ? 'danger' : 'success'} label={revoked ? 'Stopped' : 'Active'} />
				<span class="text-xs text-muted-foreground">
					Agent <span class="font-mono">{data.agentId}</span>
				</span>
			</div>

			<h1
				class="max-w-2xl font-heading text-4xl leading-[1.03] tracking-tight text-balance sm:text-5xl"
			>
				An allowance, not your PayPal login.
			</h1>

			<p class="max-w-xl text-pretty text-muted-foreground">
				{data.mandate.purpose}. The agent can ask, and a deterministic rule table decides — a
				refusal touches no money, and anything ambiguous stops and waits for you.
			</p>

			<div class="flex flex-wrap items-center gap-3">
				<Button href="/demo">
					<Play class="size-3.5" />
					Run the agent
				</Button>
				<Button variant="outline" href="/ledger">
					<Receipt class="size-3.5" />
					See what it bought
				</Button>
			</div>
		</div>

		<div class="border border-border bg-card p-5">
			<p class="eyebrow">Left of the allowance</p>
			<p class="mt-2 font-mono text-4xl tracking-tight tabular">
				{formatMoney({ cents: remaining, currency: data.mandate.ceiling.currency })}
			</p>

			<div class="mt-4 h-1 w-full bg-muted" aria-hidden="true">
				<div
					class="h-full bg-foreground transition-[width] duration-500"
					style="width: {usedPercent}%"
				></div>
			</div>

			<p class="mt-2 text-xs text-muted-foreground">
				{formatMoney(data.spent)} committed of {formatMoney(data.mandate.ceiling)}. Refunds come
				back to the ceiling.
			</p>
		</div>
	</header>

	{#if data.demoMode === 'replay'}
		<p class="mt-6 flex items-start gap-2 border border-border bg-muted/40 px-4 py-3 text-sm">
			<Clock class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
			<span>
				<strong class="font-semibold">Replay.</strong> A recorded sandbox run, served from
				<code class="font-mono text-xs">tape.json</code>. No live payment is made.
			</span>
		</p>
	{/if}

	{#if data.pending.length > 0}
		<Card.Root class="mt-6 border-l-2 border-l-warning">
			<Card.Header>
				<StatusPill tone="warning" label="Waiting for you" />
				<Card.Title class="font-heading text-xl">
					{data.pending.length}
					{data.pending.length === 1 ? 'purchase needs' : 'purchases need'} a decision
				</Card.Title>
				<Card.Description>Nothing is held and nothing is charged until you say so.</Card.Description
				>
			</Card.Header>
			<Card.Content class="flex flex-col divide-y divide-border">
				{#each data.pending as row (row.id)}
					<a
						class="flex items-center justify-between gap-4 py-3 text-sm transition-colors hover:text-foreground"
						href="/approve/{row.id}"
					>
						<span class="min-w-0">
							<span class="font-mono tabular">{formatMoney(row.amount)}</span>
							<span class="text-muted-foreground"> &middot; {row.rawRequest}</span>
						</span>
						<ArrowRight class="size-4 shrink-0 text-muted-foreground" />
					</a>
				{/each}
			</Card.Content>
		</Card.Root>
	{/if}

	<section class="mt-12">
		<div class="flex items-baseline justify-between gap-4">
			<h2 class="eyebrow">The rules it is held to</h2>
			<span class="text-xs text-muted-foreground">enforced by the service, not the agent</span>
		</div>

		<dl
			class="mt-4 grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3"
		>
			{#each rules as rule (rule.label)}
				<div class="bg-background p-5">
					<dt class="eyebrow">
						{rule.label}
					</dt>
					<dd class="mt-2 text-sm" class:font-mono={rule.mono} class:tabular={rule.mono}>
						{rule.value}
					</dd>
				</div>
			{/each}
		</dl>
	</section>

	<section class="mt-12">
		<h2 class="eyebrow">Where to look next</h2>

		<div class="mt-4 grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-3">
			<a
				class="group flex flex-col gap-3 bg-background p-5 transition-colors hover:bg-muted/50"
				href="/demo"
			>
				<div class="flex items-center justify-between">
					<Wallet class="size-4 text-muted-foreground" />
					<ArrowRight
						class="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
					/>
				</div>
				<p class="font-heading text-lg">Run the agent</p>
				<p class="text-sm text-muted-foreground">
					Four attempts, one approval, three refusals. The whole story in one button.
				</p>
			</a>

			<a
				class="group flex flex-col gap-3 bg-background p-5 transition-colors hover:bg-muted/50"
				href="/ledger"
			>
				<div class="flex items-center justify-between">
					<Receipt class="size-4 text-muted-foreground" />
					<ArrowRight
						class="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
					/>
				</div>
				<p class="font-heading text-lg">Read the ledger</p>
				<p class="text-sm text-muted-foreground">
					{data.ledgerCount}
					{data.ledgerCount === 1 ? 'event' : 'events'} on the record, refused ones included. Refunds
					hang off the row they reverse.
				</p>
			</a>

			<a
				class="group flex flex-col gap-3 bg-background p-5 transition-colors hover:bg-muted/50"
				href="/store"
			>
				<div class="flex items-center justify-between">
					<Store class="size-4 text-muted-foreground" />
					<ArrowRight
						class="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
					/>
				</div>
				<p class="font-heading text-lg">Visit the shop</p>
				<p class="text-sm text-muted-foreground">
					The one merchant the allowance covers, and the three things it sells.
				</p>
			</a>
		</div>
	</section>

	{#if data.recent.length > 0}
		<section class="mt-12">
			<div class="flex items-baseline justify-between gap-4">
				<h2 class="eyebrow">Most recent</h2>
				<a
					class="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
					href="/ledger"
				>
					Everything
					<ExternalLink class="size-3" />
				</a>
			</div>

			<ul class="mt-4 flex flex-col border-t border-border">
				{#each data.recent as row (row.id)}
					<li
						class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border py-3"
					>
						<div class="flex items-center gap-3">
							<StatusPill tone={ledgerTone(row.kind)} label={ledgerLabel(row.kind)} />
							<span class="font-mono text-sm tabular">{formatMoney(row.amount)}</span>
						</div>
						<span class="font-mono text-xs text-muted-foreground">{when(row.at)}</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<section class="mt-12 grid gap-px border border-border bg-border lg:grid-cols-2">
		<div class="flex flex-col gap-4 bg-background p-6">
			<div>
				<h2 class="font-heading text-xl">Lower the allowance</h2>
				<p class="mt-1 text-sm text-muted-foreground">
					Narrowing is instant and permanent. There is no way to raise it — a budget you can raise
					on request is not a budget.
				</p>
			</div>

			{#if revoked}
				<p class="border border-border bg-muted/40 px-4 py-3 text-sm">
					This allowance is stopped. Nothing can be spent with it, and the record stays readable.
				</p>
			{:else}
				<form class="flex flex-wrap items-end gap-3" onsubmit={(event) => event.preventDefault()}>
					<div class="flex flex-col gap-1.5">
						<Label for="ceiling">New ceiling, in dollars</Label>
						<div class="flex items-center gap-2">
							<span class="font-mono text-sm text-muted-foreground">$</span>
							<Input
								id="ceiling"
								class="w-28 font-mono"
								inputmode="decimal"
								value={ceilingValue}
								oninput={(event) => (ceilingInput = event.currentTarget.value)}
							/>
						</div>
					</div>
					<Button onclick={saveCeiling} disabled={busy}>
						{busy ? 'Saving…' : 'Save'}
					</Button>
				</form>

				<p class="flex items-center gap-1.5 text-xs text-muted-foreground">
					<CircleCheck class="size-3.5" />
					{formatMoney(data.spent)} of {formatMoney(data.mandate.ceiling)} is already committed.
				</p>
			{/if}
		</div>

		<div class="flex flex-col gap-4 bg-background p-6">
			<div>
				<h2 class="font-heading text-xl">Stop the agent</h2>
				<p class="mt-1 text-sm text-muted-foreground">
					Revoking kills the live capability, so the next attempt fails because the permission is
					gone rather than because a flag flipped. It cannot be undone.
				</p>
			</div>

			{#if revoked}
				<p class="border border-border bg-muted/40 px-4 py-3 text-sm">
					Stopped. The ledger and the receipts stay readable.
				</p>
			{:else if confirming}
				<div class="flex flex-col gap-3 border border-destructive/40 bg-destructive/5 p-4">
					<p class="text-sm">Revoke this allowance now? Nothing further can be bought with it.</p>
					<div class="flex flex-wrap gap-2">
						<Button variant="destructive" onclick={revoke} disabled={busy}>
							{busy ? 'Working…' : 'Yes, revoke it'}
						</Button>
						<Button variant="outline" onclick={() => (confirming = false)} disabled={busy}>
							Keep it
						</Button>
					</div>
				</div>
			{:else}
				<Button
					variant="destructive"
					class="w-fit"
					onclick={() => (confirming = true)}
					disabled={busy}
				>
					<ShieldX class="size-3.5" />
					Stop this agent now
				</Button>
			{/if}
		</div>
	</section>

	{#if error}<p class="mt-4 text-sm text-destructive">{error}</p>{/if}
	{#if note}<p class="mt-4 text-sm text-muted-foreground">{note}</p>{/if}
</main>
