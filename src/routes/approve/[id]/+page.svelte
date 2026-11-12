<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { ArrowLeft, ArrowRight, Clock, ShieldCheck } from '@lucide/svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Separator } from '#lib/components/ui/separator/index.js';
	import StatusPill from '#lib/components/status-pill.svelte';
	import { formatMoney } from '#lib/money';
	import { decideApproval, getApproval } from '#lib/remote';

	const data = $derived(await getApproval(page.params.id ?? ''));

	let busy = $state(false);
	let error = $state<string | null>(null);
	let note = $state<string | null>(null);

	const decided = $derived(data.request.status !== 'pending');

	async function decide(action: 'approve' | 'deny') {
		busy = true;
		error = null;
		try {
			const result = await decideApproval({ requestId: data.request.id, action });
			if (!result.ok) {
				error = result.error;
				return;
			}
			// A recording says so and stays on the card, so the reason is readable.
			if (result.note) {
				note = result.note;
				return;
			}
			await goto('/ledger');
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'the service did not answer';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Approve a purchase · inkan</title></svelte:head>

<main class="mx-auto w-full max-w-xl px-5 pt-8 pb-24">
	<a
		class="inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase hover:text-foreground"
		href="/allowance"
	>
		<ArrowLeft class="size-3.5" />
		The allowance
	</a>

	{#if data.demoMode === 'replay'}
		<p class="mt-6 border border-border bg-muted/40 px-4 py-3 text-sm">
			<strong class="font-semibold">Replay.</strong> A recorded sandbox run.
		</p>
	{/if}

	<div class="mt-8 flex flex-col gap-3">
		<StatusPill
			tone={decided ? 'neutral' : 'warning'}
			label={decided ? data.request.status : 'A person is needed'}
		/>
		<h1 class="font-heading text-3xl leading-tight tracking-tight text-balance sm:text-4xl">
			Your agent wants to buy something
		</h1>
	</div>

	<Card.Root class="mt-8">
		<Card.Header>
			<Card.Description>It asked for exactly this</Card.Description>
			<p class="font-mono text-5xl tracking-tight tabular">{formatMoney(data.request.amount)}</p>
			<Card.Description>
				at {data.request.merchantEmail ?? data.request.merchantId ?? 'the shop'}
			</Card.Description>
		</Card.Header>

		<Card.Content class="flex flex-col gap-4">
			<blockquote
				class="border-l-2 border-border pl-4 text-sm text-pretty text-muted-foreground italic"
			>
				“{data.request.rawRequest}”
			</blockquote>

			{#if data.monthly}
				<div class="flex flex-col gap-1 border border-warning/40 bg-warning/5 p-4">
					<p class="text-[0.625rem] font-semibold tracking-[0.16em] text-warning uppercase">
						This repeats, so the real cost is
					</p>
					<p class="font-mono text-2xl tabular">
						{formatMoney(data.monthly.perMonth)} a month
					</p>
					<p class="text-sm text-muted-foreground">
						{formatMoney(data.monthly.perYear)} a year, if it runs that long.
					</p>
				</div>
			{/if}

			<div class="flex flex-col gap-2">
				<p class="eyebrow">Why you are being asked</p>
				<p class="text-sm text-pretty">{data.explanation}</p>
			</div>

			<Separator />

			<dl class="flex flex-col text-sm">
				<div class="flex items-baseline justify-between gap-4 py-1.5">
					<dt class="text-muted-foreground">Allowance ceiling</dt>
					<dd class="font-mono tabular">{formatMoney(data.mandate.ceiling)}</dd>
				</div>
				<div class="flex items-baseline justify-between gap-4 py-1.5">
					<dt class="text-muted-foreground">Already committed</dt>
					<dd class="font-mono tabular">{formatMoney(data.mandate.committed)}</dd>
				</div>
				<div class="flex items-baseline justify-between gap-4 py-1.5">
					<dt class="text-muted-foreground">Left after this</dt>
					<dd class="font-mono tabular">{formatMoney(data.mandate.remainingAfterThis)}</dd>
				</div>
				<div class="flex items-baseline justify-between gap-4 py-1.5">
					<dt class="text-muted-foreground">Goes through without asking</dt>
					<dd class="font-mono tabular">{formatMoney(data.mandate.autoApproveAmount)}</dd>
				</div>
			</dl>

			{#if data.request.failure}
				<div class="border border-destructive/40 bg-destructive/5 p-4 text-sm">
					<p class="font-semibold text-destructive">PayPal refused it</p>
					<p class="mt-1 wrap-break-word">{data.request.failure.body}</p>
				</div>
			{/if}
		</Card.Content>

		<Card.Footer class="flex-col items-stretch gap-2">
			{#if decided}
				<p class="border border-border bg-muted/40 px-4 py-3 text-sm">
					This one is already {data.request.status}. Nothing more to do.
				</p>
				<Button variant="outline" href="/ledger">
					Back to the ledger
					<ArrowRight class="size-3.5" />
				</Button>
			{:else}
				<Button size="lg" onclick={() => decide('approve')} disabled={busy}>
					<ShieldCheck class="size-4" />
					{busy ? 'Working…' : `Allow this ${formatMoney(data.request.amount)}`}
				</Button>
				<Button size="lg" variant="outline" onclick={() => decide('deny')} disabled={busy}>
					Do not allow it
				</Button>
				<a
					class="flex items-center justify-center gap-1 pt-1 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
					href="/allowance/new"
				>
					Change the allowance instead
				</a>
			{/if}

			{#if note}
				<p class="border border-border bg-muted/40 px-4 py-3 text-sm">{note}</p>
			{/if}
			{#if error}<p class="text-sm text-destructive">{error}</p>{/if}
		</Card.Footer>
	</Card.Root>

	<p class="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground">
		<Clock class="size-3.5" />
		Nothing is held until you approve. Refusing costs nothing and is recorded all the same.
	</p>
</main>
