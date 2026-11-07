<script lang="ts">
	import { ArrowLeft } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { formatMoney } from '#lib/money';
	import { getAllowance, issueAllowance } from '#lib/remote';

	const data = $derived(await getAllowance());

	let purpose = $state('Restocking the shop with coffee beans');
	let ceiling = $state('60.00');
	let perPurchase = $state('25.00');
	let withoutAsking = $state('20.00');
	let expiresOn = $state(new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10));

	let busy = $state(false);
	let issues = $state<string[]>([]);

	const today = new Date().toISOString().slice(0, 10);
	const toCents = (text: string) => Math.round(Number(text) * 100);

	async function submit() {
		const amounts = [toCents(ceiling), toCents(perPurchase), toCents(withoutAsking)];
		if (!amounts.every((cents) => Number.isFinite(cents))) {
			issues = ['Enter the amounts in dollars, like 60.00.'];
			return;
		}

		busy = true;
		issues = [];
		try {
			const result = await issueAllowance({
				purpose,
				ceilingCents: amounts[0],
				perTransactionCapCents: amounts[1],
				autoApproveAmountCents: amounts[2],
				allowedMerchants: [data.storeMerchantId],
				expiresAt: expiresOn
			});
			if (!result.ok) {
				issues = result.issues;
				return;
			}
			await goto('/allowance');
		} catch (cause) {
			issues = [cause instanceof Error ? cause.message : 'the service did not answer'];
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Issue an allowance · inkan</title></svelte:head>

<main class="mx-auto w-full max-w-3xl px-5 pt-10 pb-24">
	<a
		class="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
		href="/allowance"
	>
		<ArrowLeft class="size-3" />
		The allowance
	</a>

	<h1 class="mt-5 font-heading text-4xl leading-[1.03] tracking-tight text-balance">
		Issue a new allowance.
	</h1>
	<p class="mt-3 max-w-xl text-pretty text-muted-foreground">
		The allowance in force cannot be raised. A new ceiling is a new authorization, so this makes a
		fresh one with its own terms and expiry, and stops the one it replaces. The old rows stay in the
		ledger.
	</p>

	<form
		class="mt-8 flex flex-col gap-6 border border-border bg-card p-6"
		onsubmit={(event) => {
			event.preventDefault();
			void submit();
		}}
	>
		<div class="flex flex-col gap-1.5">
			<Label for="purpose">What it is for</Label>
			<Input id="purpose" bind:value={purpose} maxlength={280} />
			<p class="text-xs text-muted-foreground">Shown to you, never compared by a rule.</p>
		</div>

		<div class="grid gap-6 sm:grid-cols-3">
			<div class="flex flex-col gap-1.5">
				<Label for="ceiling">In total, in dollars</Label>
				<Input id="ceiling" class="font-mono" inputmode="decimal" bind:value={ceiling} />
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="per-purchase">One purchase</Label>
				<Input id="per-purchase" class="font-mono" inputmode="decimal" bind:value={perPurchase} />
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="without-asking">Without asking</Label>
				<Input
					id="without-asking"
					class="font-mono"
					inputmode="decimal"
					bind:value={withoutAsking}
				/>
			</div>
		</div>

		<div class="grid gap-6 sm:grid-cols-2">
			<div class="flex flex-col gap-1.5">
				<Label for="shop">The shop</Label>
				<Input id="shop" value={data.storeSlug} readonly class="font-mono" />
				<p class="text-xs text-muted-foreground">
					Stored as the merchant id PayPal reports, {data.storeMerchantId}.
				</p>
			</div>
			<div class="flex flex-col gap-1.5">
				<Label for="expires">Good until</Label>
				<Input id="expires" type="date" min={today} bind:value={expiresOn} />
			</div>
		</div>

		<div class="flex flex-wrap items-center gap-3 border-t border-border pt-6">
			<Button type="submit" disabled={busy}>
				{busy ? 'Issuing…' : 'Issue this allowance'}
			</Button>
			<span class="text-xs text-muted-foreground">
				The current one ends when this is issued, and this cannot be undone.
			</span>
		</div>

		{#if issues.length > 0}
			<div role="alert" class="border-l-2 border-l-destructive bg-destructive/5 px-4 py-3">
				<p class="text-sm font-semibold text-destructive">Nothing was issued.</p>
				<ul class="mt-1 flex list-disc flex-col gap-1 pl-4 text-sm text-muted-foreground">
					{#each issues as issue (issue)}
						<li>{issue}</li>
					{/each}
				</ul>
			</div>
		{/if}
	</form>

	<p class="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground">
		The allowance in force is {formatMoney(data.mandate.ceiling)}, with
		{formatMoney(data.mandate.perTransactionCap)} for one purchase.
	</p>
</main>
