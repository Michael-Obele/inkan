<script lang="ts">
	import { cn } from '#lib/utils.js';

	/**
	 * A circular stamp, not an icon. inkan is the word for the seal a person
	 * presses onto a document to authorise it, so the mark is the product's
	 * own explanation. Ink disc outside, paper coin inside.
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
	const initials = $derived(display.replace(/[^A-Z0-9]/g, '').slice(0, 2) || 'IN');
	const slug = $derived(
		`${size}-${display}-${sub ?? 'plain'}`.toLowerCase().replace(/[^a-z0-9]+/g, '-')
	);
	const topId = $derived(`seal-top-${slug}`);
	const bottomId = $derived(`seal-bottom-${slug}`);
</script>

<div class={cn('shrink-0 text-foreground select-none', box[size], className)} aria-hidden="true">
	<svg viewBox="0 0 120 120" class="size-full" aria-hidden="true">
		<defs>
			<path id={topId} d="M 22,60 A 38,38 0 0,1 98,60" fill="none" />
			<path id={bottomId} d="M 22,60 A 38,38 0 0,0 98,60" fill="none" />
		</defs>
		<circle
			cx="60"
			cy="60"
			r="58"
			fill="none"
			stroke="currentColor"
			stroke-width="1.4"
			stroke-dasharray="0.1 5"
			stroke-linecap="round"
			opacity="0.55"
		/>
		<circle cx="60" cy="60" r="51" fill="currentColor" />
		<circle
			cx="60"
			cy="60"
			r="47.5"
			fill="none"
			style="stroke: var(--background)"
			stroke-width="1.1"
			opacity="0.85"
		/>
		<text class="font-mono" font-size="10.5" letter-spacing="3" style="fill: var(--background)">
			<textPath href={`#${topId}`} startOffset="50%" text-anchor="middle">{display}</textPath>
		</text>
		{#if sub}
			<text class="font-mono" font-size="9.5" letter-spacing="3" style="fill: var(--background)">
				<textPath href={`#${bottomId}`} startOffset="50%" text-anchor="middle">{sub}</textPath>
			</text>
		{/if}
		<circle cx="23.5" cy="60" r="1.7" style="fill: var(--background)" />
		<circle cx="96.5" cy="60" r="1.7" style="fill: var(--background)" />
		<circle cx="60" cy="60" r="30" style="fill: var(--background)" />
		<circle
			cx="60"
			cy="60"
			r="25.5"
			fill="none"
			stroke="currentColor"
			stroke-width="1"
			opacity="0.3"
		/>
		<text
			x="60"
			y="55"
			text-anchor="middle"
			dominant-baseline="central"
			class="font-heading"
			font-size="27"
			font-weight="500"
			letter-spacing="1"
			fill="currentColor">{initials}</text
		>
		<line x1="48" y1="74" x2="56" y2="74" stroke="currentColor" stroke-width="1" />
		<line x1="64" y1="74" x2="72" y2="74" stroke="currentColor" stroke-width="1" />
		<rect
			x="57.8"
			y="71.8"
			width="4.4"
			height="4.4"
			transform="rotate(45 60 74)"
			fill="currentColor"
		/>
	</svg>
</div>
