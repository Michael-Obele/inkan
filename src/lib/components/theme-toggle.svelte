<script lang="ts">
	import { Monitor, Moon, Sun } from '@lucide/svelte';
	import { resetMode, setMode, userPrefersMode } from 'mode-watcher';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { buttonVariants } from '#lib/components/ui/button/index.js';
	import { cn } from '#lib/utils.js';

	/**
	 * Three choices, not two. "System" has to be reachable again once a person
	 * has picked a side, otherwise the choice can never be undone.
	 */
	const choices = [
		{ value: 'light', label: 'Light', Icon: Sun },
		{ value: 'dark', label: 'Dark', Icon: Moon },
		{ value: 'system', label: 'System', Icon: Monitor }
	] as const;

	function choose(value: (typeof choices)[number]['value']) {
		if (value === 'system') resetMode();
		else setMode(value);
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		class={cn(
			buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
			'relative text-muted-foreground'
		)}
		aria-label="Change the theme"
	>
		<Sun class="size-4 scale-100 rotate-0 transition-transform dark:scale-0 dark:-rotate-90" />
		<Moon
			class="absolute size-4 scale-0 rotate-90 transition-transform dark:scale-100 dark:rotate-0"
		/>
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-44">
		<DropdownMenu.Label>Appearance</DropdownMenu.Label>
		<DropdownMenu.Separator />
		{#each choices as choice (choice.value)}
			<DropdownMenu.Item onclick={() => choose(choice.value)}>
				<choice.Icon class="size-3.5" />
				{choice.label}
				{#if userPrefersMode.current === choice.value}
					<DropdownMenu.Shortcut>on</DropdownMenu.Shortcut>
				{/if}
			</DropdownMenu.Item>
		{/each}
	</DropdownMenu.Content>
</DropdownMenu.Root>
