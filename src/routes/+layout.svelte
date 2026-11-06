<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { Agentation, type AnnotationProps } from 'sv-agentation';
	// SvelteKit 3 renamed $app/environment to $app/env.
	import { browser, dev } from '$app/env';
	import { ModeWatcher } from 'mode-watcher';
	import SiteHeader from '#lib/components/site-header.svelte';
	import { getShell } from '#lib/remote';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// `$derived` matters: a plain `const` runs once and never picks up a query refresh.
	const shell = $derived(await getShell());

	const annotationProps: AnnotationProps = {
		toolbarPosition: 'bottom-right',
		outputMode: 'forensic',
		pauseAnimations: true,
		clearOnCopy: true,
		includeComponentContext: false,
		includeComputedStyles: false
	};

	/** mode-watcher rewrites this when the mode changes, so the browser chrome follows too. */
	const themeColors = { light: '#ffffff', dark: '#161513' };
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="theme-color" content={themeColors.dark} />
</svelte:head>

<!-- Rendered on the server too: ModeWatcher injects a blocking head script that
     applies the stored mode before first paint, which is what stops the flash. -->
<ModeWatcher defaultMode="dark" {themeColors} />

<div class="flex min-h-dvh flex-col">
	<SiteHeader demoMode={shell.demoMode} />

	<div class="flex-1">
		{@render children()}
	</div>

	<footer class="border-t border-border">
		<div
			class="mx-auto flex w-full max-w-5xl flex-col gap-2 px-5 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
		>
			<p>The agent cannot pay. The payment capability lives with the mandate.</p>
			<p class="font-mono text-[0.6875rem] tracking-tight">PayPal Orders v2 &middot; sandbox</p>
		</div>
	</footer>
</div>

{#if browser && dev}
	<Agentation {...annotationProps} />
{/if}
