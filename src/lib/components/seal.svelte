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
		sm: 'size-11',
		md: 'size-20',
		lg: 'size-32 sm:size-40'
	};

	const display = $derived(label.toUpperCase());
	const sub = $derived(sublabel?.toUpperCase());
</script>

<div class={cn('shrink-0 text-seal select-none', box[size], className)} aria-hidden="true">
	<svg viewBox="0 0 100 100" class="size-full" fill="none" aria-hidden="true">
		<rect
			x="1.5"
			y="1.5"
			width="97"
			height="97"
			stroke="currentColor"
			stroke-width="1.2"
			stroke-dasharray="0.1 4.5"
			stroke-linecap="round"
			opacity="0.9"
		/>
		<rect x="7" y="7" width="86" height="86" stroke="currentColor" stroke-width="5" />
		<rect x="15" y="15" width="70" height="70" stroke="currentColor" stroke-width="1.25" />
		<circle cx="15" cy="15" r="2" fill="currentColor" />
		<circle cx="85" cy="15" r="2" fill="currentColor" />
		<circle cx="15" cy="85" r="2" fill="currentColor" />
		<circle cx="85" cy="85" r="2" fill="currentColor" />
		<text
			x="51"
			y={sub ? '45' : '56'}
			text-anchor="middle"
			dominant-baseline="middle"
			class="font-mono"
			font-size="16"
			font-weight="500"
			letter-spacing="2"
			fill="currentColor">{display}</text
		>
		{#if sub}
			<line x1="27" y1="58" x2="42" y2="58" stroke="currentColor" stroke-width="1.25" />
			<line x1="58" y1="58" x2="73" y2="58" stroke="currentColor" stroke-width="1.25" />
			<rect
				x="47.2"
				y="55.2"
				width="5.6"
				height="5.6"
				transform="rotate(45 50 58)"
				fill="currentColor"
			/>
			<text
				x="51"
				y="74"
				text-anchor="middle"
				dominant-baseline="middle"
				class="font-mono"
				font-size="10.5"
				letter-spacing="2"
				fill="currentColor">{sub}</text
			>
		{/if}
	</svg>
</div>
