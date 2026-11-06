<script lang="ts">
	import { ArrowRight, Receipt } from '@lucide/svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Table from '#lib/components/ui/table/index.js';
	import StatusPill from '#lib/components/status-pill.svelte';
	import { formatMoney } from '#lib/money';
	import { ledgerLabel, ledgerTone } from '#lib/ledger-labels';
	import { getLedger, refundCapture } from '#lib/remote';

	const data = $derived(await getLedger());

	let busy = $state<string | null>(null);
	let error = $state<string | null>(null);
	let note = $state<string | null>(null);

	const spent = $derived(data.captured.cents - data.refunded.cents);

	async function refund(ledgerEventId: string) {
		busy = ledgerEventId;
		error = null;
		note = null;
		try {
			const result = await refundCapture({ ledgerEventId });
			if (!result.ok) {
				error = result.error;
				return;
			}
			note = `Refunded. PayPal returned ${result.refundId}.`;
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'the service did not answer';
		} finally {
			busy = null;
		}
	}

	function when(iso: string): string {
		return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
	}
</script>

<svelte:head><title>What it bought · inkan</title></svelte:head>

<main class="mx-auto w-full max-w-5xl px-5 pt-10 pb-24">
	<header class="-mx-5 flex flex-col gap-4 border-b border-border bg-muted/40 px-5 pb-10">
		<div class="flex items-center gap-2 text-muted-foreground">
			<Receipt class="size-4" />
			<span class="text-[0.6875rem] font-semibold tracking-[0.18em] uppercase">The ledger</span>
		</div>

		<h1
			class="max-w-2xl font-heading text-4xl leading-[1.03] tracking-tight text-balance sm:text-5xl"
		>
			Every attempt, refused ones included.
		</h1>

		<p class="max-w-xl text-pretty text-muted-foreground">
			Nothing here is edited or removed. A refusal is a row, not a silence, and a refund is a new
			row that points at the payment it reverses.
		</p>
	</header>

	{#if data.demoMode === 'replay'}
		<p class="mt-6 border border-border bg-muted/40 px-4 py-3 text-sm">
			<strong class="font-semibold">Replay.</strong> A recorded sandbox run. No live payment is made.
		</p>
	{/if}

	<div class="mt-8 grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-3">
		<div class="bg-background p-5">
			<p class="text-[0.625rem] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
				Paid out
			</p>
			<p class="tabular mt-2 font-mono text-2xl">{formatMoney(data.captured)}</p>
		</div>
		<div class="bg-background p-5">
			<p class="text-[0.625rem] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
				Refunded
			</p>
			<p class="tabular mt-2 font-mono text-2xl">{formatMoney(data.refunded)}</p>
		</div>
		<div class="bg-background p-5">
			<p class="text-[0.625rem] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
				Net committed
			</p>
			<p class="tabular mt-2 font-mono text-2xl">
				{formatMoney({ cents: spent, currency: data.captured.currency })}
			</p>
		</div>
	</div>

	{#if data.pending.length > 0}
		<Card.Root class="mt-6 border-l-2 border-l-warning">
			<Card.Header>
				<StatusPill tone="warning" label="Waiting for you" />
				<Card.Title class="font-heading text-lg">Nothing is held on these yet</Card.Title>
			</Card.Header>
			<Card.Content class="flex flex-col divide-y divide-border">
				{#each data.pending as item (item.id)}
					<a
						class="flex items-center justify-between gap-4 py-3 text-sm transition-colors hover:text-foreground"
						href="/approve/{item.id}"
					>
						<span>{item.rawRequest}</span>
						<ArrowRight class="size-4 shrink-0 text-muted-foreground" />
					</a>
				{/each}
			</Card.Content>
		</Card.Root>
	{/if}

	{#if data.rows.length === 0}
		<div class="mt-10 flex flex-col items-start gap-3 border border-border p-8">
			<p class="font-heading text-xl">Nothing has happened yet</p>
			<p class="max-w-md text-sm text-muted-foreground">
				Start the agent and every attempt will appear here, the refused ones included.
			</p>
			<Button href="/demo" variant="outline">
				Run the agent
				<ArrowRight class="size-3.5" />
			</Button>
		</div>
	{:else}
		<div class="mt-10 overflow-x-auto">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="w-30">When</Table.Head>
						<Table.Head>What happened</Table.Head>
						<Table.Head class="w-28 text-right">Amount</Table.Head>
						<Table.Head class="w-56">PayPal</Table.Head>
						<Table.Head class="w-24"><span class="sr-only">Actions</span></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.rows as row (row.id)}
						<Table.Row class="align-top">
							<Table.Cell class="font-mono text-xs whitespace-nowrap text-muted-foreground">
								{when(row.at)}
							</Table.Cell>
							<Table.Cell>
								<StatusPill tone={ledgerTone(row.kind)} label={ledgerLabel(row.kind)} />
								{#if row.receipt}
									<p class="mt-1.5 max-w-lg text-sm text-pretty text-muted-foreground">
										{row.receipt}
									</p>
								{/if}
							</Table.Cell>
							<Table.Cell class="tabular text-right font-mono whitespace-nowrap">
								{formatMoney(row.amount)}
							</Table.Cell>
							<Table.Cell class="text-xs">
								{#if row.paypalId}
									<span class="font-mono break-all text-muted-foreground">{row.paypalId}</span>
								{:else}
									<span class="text-muted-foreground">not on PayPal</span>
								{/if}
							</Table.Cell>
							<Table.Cell class="text-right">
								{#if row.canRefund}
									<Button
										size="sm"
										variant="outline"
										disabled={busy === row.id}
										onclick={() => refund(row.id)}
									>
										{busy === row.id ? 'Working…' : 'Refund'}
									</Button>
								{/if}
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	{/if}

	{#if error}<p class="mt-4 text-sm text-destructive">{error}</p>{/if}
	{#if note}<p class="mt-4 text-sm text-muted-foreground">{note}</p>{/if}
</main>
