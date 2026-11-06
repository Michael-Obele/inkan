<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '#lib/utils.js';

	export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

	let {
		tone = 'neutral',
		label,
		class: className,
		children
	}: { tone?: Tone; label?: string; class?: string; children?: Snippet } = $props();

	const tones: Record<Tone, string> = {
		success: 'text-success',
		warning: 'text-warning',
		danger: 'text-destructive',
		info: 'text-info',
		neutral: 'text-muted-foreground'
	};
</script>

<span
	class={cn(
		'inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-[0.14em] uppercase',
		tones[tone],
		className
	)}
>
	<span class="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true"></span>
	{#if children}
		{@render children()}
	{:else}
		{label}
	{/if}
</span>
