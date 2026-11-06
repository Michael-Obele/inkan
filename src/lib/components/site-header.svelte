<script lang="ts">
	import { page } from '$app/state';
	import { Play, Receipt, Store, Wallet } from '@lucide/svelte';
	import StatusPill from './status-pill.svelte';
	import ThemeToggle from './theme-toggle.svelte';
	import { cn } from '#lib/utils.js';

	let { demoMode }: { demoMode: 'live' | 'replay' } = $props();

	const links = [
		{ href: '/', label: 'Allowance', Icon: Wallet },
		{ href: '/demo', label: 'Agent', Icon: Play },
		{ href: '/ledger', label: 'Ledger', Icon: Receipt },
		{ href: '/store', label: 'Shop', Icon: Store }
	];

	function isActive(href: string): boolean {
		return href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
	}
</script>

<header
	class="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur supports-backdrop-filter:bg-background/70"
>
	<div class="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-5">
		<a class="flex items-center gap-2.5" href="/" aria-label="inkan, the overview">
			<span
				class="grid size-7 place-items-center border border-foreground bg-foreground text-[0.55rem] font-bold tracking-[0.18em] text-background"
				aria-hidden="true">IN</span
			>
			<span class="font-heading text-lg leading-none">inkan</span>
		</a>

		<nav class="ml-auto flex items-center gap-1" aria-label="Sections">
			{#each links as link (link.href)}
				{@const current = isActive(link.href)}
				<a
					href={link.href}
					class={cn(
						'inline-flex h-8 items-center gap-1.5 px-2.5 text-[0.6875rem] font-semibold tracking-[0.12em] uppercase transition-colors',
						current
							? 'bg-foreground text-background'
							: 'text-muted-foreground hover:bg-muted hover:text-foreground'
					)}
					aria-current={current ? 'page' : undefined}
				>
					<link.Icon class="size-3.5 sm:hidden" />
					<span class="hidden sm:inline">{link.label}</span>
				</a>
			{/each}
		</nav>

		<div class="flex items-center gap-2 border-l border-border pl-3">
			<StatusPill
				class="hidden sm:inline-flex"
				tone={demoMode === 'live' ? 'success' : 'neutral'}
				label={demoMode}
			/>
			<ThemeToggle />
		</div>
	</div>
</header>
