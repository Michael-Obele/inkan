<script lang="ts">
	import { page } from '$app/state';
	import { cn } from '#lib/utils.js';
	import StatusPill from './status-pill.svelte';
	import ThemeToggle from './theme-toggle.svelte';

	let { demoMode }: { demoMode: 'live' | 'replay' } = $props();

	const links = [
		{ href: '/allowance', label: 'Allowance' },
		{ href: '/demo', label: 'Agent' },
		{ href: '/ledger', label: 'Ledger' },
		{ href: '/store', label: 'Shop' }
	];

	/** The wordmark is home. The nav is the product, never the front door. */
	function isActive(href: string): boolean {
		return page.url.pathname.startsWith(href);
	}
</script>

<header class="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
	<div
		class="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 px-5 py-2 sm:h-14 sm:flex-nowrap sm:px-8 sm:py-0"
	>
		<a class="group order-1 flex items-center gap-2.5" href="/" aria-label="inkan, the front page">
			<span
				class="grid size-6 place-items-center border border-foreground text-[0.5rem] font-medium tracking-widest text-foreground transition-colors group-hover:bg-foreground group-hover:text-background"
				aria-hidden="true">IN</span
			>
			<span class="font-heading text-[1.0625rem] leading-none tracking-tight">inkan</span>
		</a>

		<div class="order-2 ml-auto flex items-center gap-3 border-l border-border pl-4 sm:order-3">
			<StatusPill
				class="hidden md:inline-flex"
				tone={demoMode === 'live' ? 'success' : 'neutral'}
				label={demoMode}
			/>
			<ThemeToggle />
		</div>

		<nav
			class="order-3 -mx-5 mt-2 flex w-full items-stretch border-t border-border sm:order-2 sm:mx-0 sm:mt-0 sm:w-auto sm:border-0"
			aria-label="Sections"
		>
			{#each links as link (link.href)}
				{@const current = isActive(link.href)}
				<a
					href={link.href}
					class={cn(
						'inline-flex h-10 flex-1 items-center justify-center px-3 text-[0.8125rem] transition-colors sm:h-8 sm:flex-none',
						current
							? 'bg-foreground text-background'
							: 'text-muted-foreground hover:bg-muted hover:text-foreground'
					)}
					aria-current={current ? 'page' : undefined}
				>
					{link.label}
				</a>
			{/each}
		</nav>
	</div>
</header>
