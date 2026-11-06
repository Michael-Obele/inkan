<script lang="ts">
	import { cn } from '#lib/utils.js';

	/**
	 * A hanko, not an icon. inkan is the word for the seal a person presses onto a
	 * document to authorise it, so the mark is the product's own explanation.
	 */
	let {
		size = 'md',
		label = 'inkan',
		sublabel,
		class: className
	}: {
		size?: 'sm' | 'md' | 'lg';
		label?: string;
		sublabel?: string;
		class?: string;
	} = $props();

	const box = {
		sm: 'size-11 text-[0.5rem]',
		md: 'size-20 text-[0.6875rem]',
		lg: 'size-32 text-xs sm:size-40 sm:text-sm'
	};
</script>

<div
	class={cn(
		'grid shrink-0 place-items-center border-2 border-seal text-seal select-none',
		box[size],
		className
	)}
	aria-hidden="true"
>
	<div
		class="flex size-full flex-col items-center justify-center gap-0.5 border border-seal/70 font-mono leading-none tracking-[0.22em] uppercase"
	>
		<span class="pl-[0.22em] font-medium">{label}</span>
		{#if sublabel}
			<span class="pl-[0.22em] text-[0.65em] tracking-[0.18em] opacity-80">{sublabel}</span>
		{/if}
	</div>
</div>
