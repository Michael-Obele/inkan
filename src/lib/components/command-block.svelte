<script lang="ts">
	/**
	 * A command block with a copy button. When the clipboard is blocked (an
	 * insecure origin, or a browser policy) it selects the text instead, so there
	 * is still a way to get the commands out.
	 */
	let { lines, label }: { lines: string[]; label: string } = $props();

	let pre: HTMLElement | null = $state(null);
	let status: 'idle' | 'copied' | 'selected' = $state('idle');
	let timer: ReturnType<typeof setTimeout> | undefined;

	function flash(next: typeof status) {
		status = next;
		clearTimeout(timer);
		timer = setTimeout(() => (status = 'idle'), 2400);
	}

	function selectContents(): boolean {
		if (!pre) return false;
		const range = document.createRange();
		range.selectNodeContents(pre);
		const selection = window.getSelection();
		if (!selection) return false;
		selection.removeAllRanges();
		selection.addRange(range);
		return true;
	}

	async function copy() {
		try {
			await navigator.clipboard.writeText(lines.join('\n'));
			flash('copied');
		} catch {
			flash(selectContents() ? 'selected' : 'idle');
		}
	}
</script>

<div class="relative border border-border bg-muted/40">
	<div class="flex items-center justify-between gap-4 border-b border-border px-4 py-2">
		<p class="eyebrow text-muted-foreground">{label}</p>
		<button
			type="button"
			class="cursor-pointer px-1 eyebrow text-muted-foreground transition-colors hover:text-foreground"
			onclick={copy}
		>
			{#if status === 'copied'}
				Copied
			{:else if status === 'selected'}
				Selected
			{:else}
				Copy
			{/if}
		</button>
	</div>
	<pre bind:this={pre} class="overflow-x-auto px-4 py-3.5 text-[0.8125rem] leading-relaxed"><code
			>{#each lines as line, index (index)}<span class="block"
					><span class="mr-3 text-muted-foreground select-none" aria-hidden="true">$</span
					>{line}</span
				>{/each}</code
		></pre>
</div>
