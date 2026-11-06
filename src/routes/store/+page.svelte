<script lang="ts">
	import { Repeat, Store as StoreIcon } from '@lucide/svelte';
	import { formatMoney } from '#lib/money';
	import { getShop } from '#lib/remote';

	const data = $derived(await getShop());
</script>

<svelte:head><title>The shop · inkan</title></svelte:head>

<main class="mx-auto w-full max-w-5xl px-5 pt-10 pb-24">
	<header class="-mx-5 flex flex-col gap-4 border-b border-border bg-muted/40 px-5 pb-10">
		<div class="flex items-center gap-2 text-muted-foreground">
			<StoreIcon class="size-4" />
			<span class="text-[0.6875rem] font-semibold tracking-[0.18em] uppercase">The shop</span>
		</div>

		<h1
			class="max-w-2xl font-heading text-4xl leading-[1.03] tracking-tight text-balance sm:text-5xl"
		>
			One merchant, so the allowance has something real to check.
		</h1>

		<p class="max-w-xl text-pretty text-muted-foreground">
			The agent buys from here; you never check out yourself. The handle below is all the agent is
			given. The merchant id is what the allowance actually compares, and PayPal is the one that
			supplies it.
		</p>
	</header>

	<ul class="mt-10 flex flex-col border-t border-border">
		{#each data.products as product (product.id)}
			<li
				class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-border py-6"
			>
				<div class="min-w-0">
					<h2 class="font-heading text-lg">{product.name}</h2>
					<p class="mt-1 text-sm text-muted-foreground">{product.note}</p>
					{#if product.recurring}
						<p class="mt-2 inline-flex items-center gap-1.5 text-warning">
							<Repeat class="size-3.5" />
							<span class="text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
								Repeats monthly, so it always asks you first
							</span>
						</p>
					{/if}
				</div>
				<p class="tabular shrink-0 font-mono text-xl">{formatMoney(product.price)}</p>
			</li>
		{/each}
	</ul>

	<div class="mt-8 grid gap-px border border-border bg-border sm:grid-cols-2">
		<div class="bg-background p-5">
			<p class="text-[0.625rem] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
				Handle the agent sees
			</p>
			<p class="mt-2 font-mono text-sm">{data.slug}</p>
		</div>
		<div class="bg-background p-5">
			<p class="text-[0.625rem] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
				Merchant id PayPal reports
			</p>
			<p class="mt-2 font-mono text-sm">{data.merchantId}</p>
		</div>
	</div>

	<p class="mt-4 max-w-2xl text-sm text-muted-foreground">
		A shop the allowance does not cover never has money held against it. The order is created bare,
		the payee is read back from PayPal, and only a matching merchant id reaches the card.
	</p>
</main>
