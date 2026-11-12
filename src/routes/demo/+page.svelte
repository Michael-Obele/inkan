<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		ArrowRight,
		CircleCheck,
		CircleX,
		Clock,
		Play,
		RotateCcw,
		ShieldCheck
	} from '@lucide/svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Separator } from '#lib/components/ui/separator/index.js';
	import StatusPill from '#lib/components/status-pill.svelte';
	import { formatMoney } from '#lib/money';
	import { askTheAgent, getAgentConsole, resetTheDemo, runBeatNow } from '#lib/remote';
	import type { BeatOutcome } from '#lib/outcome';

	const data = $derived(await getAgentConsole());

	type Reading = {
		item: string;
		amount: { cents: number; currency: string };
		merchantSlug: string;
		recurring: boolean;
	};

	let askText = $state('Buy a whole crate of beans for 900 dollars');
	let asking = $state(false);
	let reading = $state<Reading | null>(null);
	let asked = $state<{ status: string; rule: string | null; reason: string | null } | null>(null);
	let askNote = $state<string | null>(null);

	const toneOf = (status: string): 'success' | 'warning' | 'danger' | 'neutral' =>
		status === 'captured'
			? 'success'
			: status === 'pending'
				? 'warning'
				: status === 'allowed'
					? 'neutral'
					: 'danger';
	const labelOf = (status: string) =>
		status === 'captured'
			? 'Paid'
			: status === 'pending'
				? 'Waiting for you'
				: status === 'allowed'
					? 'Allowed, not charged'
					: 'Refused';

	async function readSentence() {
		asking = true;
		askNote = null;
		asked = null;
		try {
			const result = await askTheAgent({ text: askText, send: false });
			if (!result.ok) {
				reading = null;
				askNote = 'The agent only knows the three things in the shop.';
				return;
			}
			reading = result.answer;
		} finally {
			asking = false;
		}
	}

	async function sendSentence() {
		asking = true;
		askNote = null;
		try {
			const result = await askTheAgent({ text: askText, send: true });
			if (!result.ok) {
				askNote = 'The agent only knows the three things in the shop.';
				return;
			}
			reading = result.answer;
			if (!result.sent) return;
			asked = {
				status: result.outcome.status,
				rule: result.outcome.rule,
				reason: result.outcome.reason
			};
			// A recording writes the real decision but cannot charge, and says so here.
			if (result.outcome.status === 'allowed') {
				askNote = 'The rule table allowed it. This run is a recording, so nothing was charged.';
			}
		} finally {
			asking = false;
		}
	}

	type Answer = {
		actual: BeatOutcome;
		rule: string | null;
		reason: string | null;
		requestId: string;
		matched: boolean;
	};

	let answers = $state<Record<string, Answer>>({});
	let busy = $state<string | null>(null);
	let error = $state<string | null>(null);
	let ranAll = $state(false);

	const tone: Record<BeatOutcome, 'success' | 'warning' | 'danger'> = {
		paid: 'success',
		waiting: 'warning',
		refused: 'danger'
	};

	const wording: Record<BeatOutcome, string> = {
		paid: 'Paid',
		waiting: 'Waiting for you',
		refused: 'Refused'
	};

	function seen(beat: (typeof data.beats)[number]): Answer | null {
		if (answers[beat.id]) return answers[beat.id];
		if (!beat.last) return null;
		return {
			actual: beat.last.actual,
			rule: beat.last.rule,
			reason: beat.last.reason,
			requestId: beat.last.requestId,
			matched: beat.last.actual === beat.expect
		};
	}

	const waiting = $derived(
		data.beats
			.map((beat) => ({ beat, answer: seen(beat) }))
			.filter((row) => row.answer?.actual === 'waiting')
	);

	async function run(stepId: string, drivenByAll = false) {
		if (!drivenByAll) busy = stepId;
		error = null;
		try {
			const answer = await runBeatNow({ stepId });
			if (!answer.ok) {
				error = answer.error;
				return;
			}
			const result = answer.result;
			answers[stepId] = {
				actual: result.actual,
				rule: result.rule,
				reason: result.reason,
				requestId: result.requestId,
				matched: result.matched
			};
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'the service did not answer';
		} finally {
			if (!drivenByAll) busy = null;
		}
	}

	async function runAll() {
		busy = 'all';
		ranAll = false;
		for (const beat of data.beats) {
			// The card for the beat in flight says Working, so the run has a position.
			busy = beat.id;
			await run(beat.id, true);
		}
		busy = null;
		ranAll = true;
	}

	async function reset() {
		busy = 'reset';
		error = null;
		try {
			const result = await resetTheDemo();
			if (!result.ok) {
				error = result.error;
				return;
			}
			answers = {};
			ranAll = false;
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'the service did not answer';
		} finally {
			busy = null;
		}
	}

	function when(iso: string): string {
		return iso.slice(0, 16).replace('T', ' ');
	}
</script>

<svelte:head><title>The agent · inkan</title></svelte:head>

<main class="mx-auto w-full max-w-5xl px-5 pt-10 pb-24">
	<header class="-mx-5 flex flex-col gap-5 border-b border-border bg-muted/40 px-5 pb-10">
		<StatusPill tone="info" label="Agent console" />

		<h1
			class="max-w-3xl font-heading text-4xl leading-[1.03] tracking-tight text-balance sm:text-5xl"
		>
			Give the agent a job, then watch it try.
		</h1>

		<p class="max-w-2xl text-pretty text-muted-foreground">
			This runner holds no PayPal credential. It asks in dollars and names a shop; the service turns
			that name into a merchant id, decides with the rule table, and only then pays. Four beats, the
			same four the video is cut from.
		</p>

		<div class="flex flex-wrap items-center gap-3">
			<Button onclick={runAll} disabled={busy !== null}>
				<Play class="size-3.5" />
				{busy === 'all' ? 'Running the four beats…' : 'Run all four beats'}
			</Button>

			{#if data.demoMode === 'live'}
				<Button variant="outline" onclick={reset} disabled={busy !== null}>
					<RotateCcw class="size-3.5" />
					{busy === 'reset' ? 'Clearing…' : 'Start the story again'}
				</Button>
			{/if}

			<a
				class="text-[0.6875rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase underline underline-offset-4 hover:text-foreground"
				href="/ledger">Open the ledger</a
			>
		</div>

		{#if error}
			<p class="text-sm text-destructive">{error}</p>
		{/if}
	</header>

	<Card.Root class="mt-8">
		<Card.Header>
			<StatusPill tone="info" label="Ask it yourself" />
			<Card.Title class="font-heading text-xl">Give the agent something to buy</Card.Title>
			<Card.Description>
				It reads your words against the three things in the shop. The price comes from the shop,
				never from your sentence.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			<form
				class="flex flex-wrap items-end gap-3"
				onsubmit={(event) => {
					event.preventDefault();
					void readSentence();
				}}
			>
				<div class="flex min-w-0 flex-1 flex-col gap-1.5">
					<Label for="ask">Your words</Label>
					<Input
						id="ask"
						bind:value={askText}
						maxlength={280}
						placeholder="Buy a whole crate of beans for 900 dollars"
					/>
				</div>
				<Button type="submit" variant="outline" disabled={asking}>Read it</Button>
			</form>

			{#if reading}
				<div class="flex flex-wrap items-center gap-3 border border-border bg-muted/40 px-4 py-3">
					<p class="text-sm">
						I read that as one {reading.item},
						<span class="font-mono">{formatMoney(reading.amount)}</span> from
						<span class="font-mono">{reading.merchantSlug}</span>. The number in your words is not
						used.
					</p>
					<Button onclick={sendSentence} disabled={asking}>
						{asking ? 'Sending…' : 'Send it'}
					</Button>
				</div>
			{/if}

			{#if askNote}
				<p class="text-sm text-muted-foreground">{askNote}</p>
			{/if}

			{#if asked}
				<div class="flex flex-wrap items-center gap-3 border border-border px-4 py-3 text-sm">
					<StatusPill tone={toneOf(asked.status)} label={labelOf(asked.status)} />
					<span class="font-mono text-xs">{asked.rule}</span>
					<span class="text-muted-foreground">{asked.reason}</span>
				</div>
			{/if}
		</Card.Content>
	</Card.Root>

	{#if waiting.length > 0}
		<Card.Root class="mt-8 border-l-2 border-l-warning">
			<Card.Header>
				<StatusPill tone="warning" label="A person is needed" />
				<Card.Title class="font-heading text-xl">The agent is stopped, waiting for you</Card.Title>
				<Card.Description>
					Nothing is held and nothing is charged. One request crossed the line that only a human may
					cross, so it sits until you decide.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-wrap gap-3">
				{#each waiting as row (row.beat.id)}
					<Button href="/approve/{row.answer?.requestId}">
						Review {formatMoney(row.beat.amount)}
						<ArrowRight class="size-3.5" />
					</Button>
				{/each}
			</Card.Content>
		</Card.Root>
	{/if}

	<div class="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
		<section class="flex flex-col gap-2">
			<h2 class="eyebrow">The four beats</h2>

			<ol class="flex flex-col">
				{#each data.beats as beat (beat.id)}
					{@const answer = seen(beat)}
					<li
						class="grid grid-cols-[auto_minmax(0,1fr)] gap-4 border-b border-border py-6 last:border-b-0"
					>
						<span
							class="grid size-8 shrink-0 place-items-center border border-border font-mono text-xs text-muted-foreground"
							aria-hidden="true">{beat.index}</span
						>

						<div class="flex min-w-0 flex-col gap-3">
							<div class="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
								<p class="max-w-xl font-heading text-lg leading-snug">“{beat.say}”</p>
								<p class="shrink-0 font-mono text-sm tabular">{formatMoney(beat.amount)}</p>
							</div>

							<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
								{#if answer}
									<StatusPill tone={tone[answer.actual]} label={wording[answer.actual]} />
								{:else}
									<StatusPill tone="neutral" label="Not attempted" />
								{/if}

								<span class="text-xs text-muted-foreground">
									the script expects <span class="text-foreground">{beat.expect}</span>
								</span>

								{#if beat.recurring}
									<span class="text-xs text-muted-foreground">repeats monthly</span>
								{/if}

								{#if answer?.rule}
									<span class="font-mono text-[0.6875rem] text-muted-foreground">{answer.rule}</span
									>
								{/if}
							</div>

							{#if answer?.reason}
								<p class="max-w-xl text-sm text-pretty text-muted-foreground">{answer.reason}</p>
							{/if}

							<div class="flex flex-wrap items-center gap-3">
								<Button
									size="sm"
									variant="outline"
									onclick={() => run(beat.id)}
									disabled={busy !== null}
								>
									{busy === beat.id || (!answer && busy === 'all')
										? 'Working…'
										: answer
											? 'Run it again'
											: 'Run this beat'}
								</Button>

								{#if answer?.actual === 'waiting'}
									<a
										class="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
										href="/approve/{answer.requestId}"
									>
										Open the approval card
										<ArrowRight class="size-3" />
									</a>
								{/if}

								{#if answer && !answer.matched}
									<span class="text-xs text-destructive">
										drifted from the script, and that is worth knowing
									</span>
								{/if}
							</div>
						</div>
					</li>
				{/each}
			</ol>

			{#if ranAll}
				<div
					class="mt-2 flex flex-wrap items-center justify-between gap-3 border border-border bg-muted/40 px-4 py-3"
				>
					<p class="text-sm text-muted-foreground">
						Four attempts, three refusals, one that needed a person. Every one is in the ledger.
					</p>
					<Button size="sm" variant="link" onclick={() => goto('/ledger')}>
						Read the ledger
						<ArrowRight class="size-3" />
					</Button>
				</div>
			{/if}
		</section>

		<aside class="flex flex-col gap-4">
			<Card.Root size="sm">
				<Card.Header>
					<StatusPill
						tone={data.mandate.status === 'active' ? 'success' : 'danger'}
						label={data.mandate.status}
					/>
					<Card.Title class="font-heading text-lg">What the agent is allowed</Card.Title>
				</Card.Header>
				<Card.Content class="flex flex-col">
					<dl class="flex flex-col text-sm">
						<div class="flex items-baseline justify-between gap-4 py-2">
							<dt class="text-muted-foreground">For</dt>
							<dd class="text-right">{data.mandate.purpose}</dd>
						</div>
						<Separator />
						<div class="flex items-baseline justify-between gap-4 py-2">
							<dt class="text-muted-foreground">Ceiling</dt>
							<dd class="font-mono tabular">{formatMoney(data.mandate.ceiling)}</dd>
						</div>
						<Separator />
						<div class="flex items-baseline justify-between gap-4 py-2">
							<dt class="text-muted-foreground">One purchase</dt>
							<dd class="font-mono tabular">{formatMoney(data.mandate.perTransactionCap)}</dd>
						</div>
						<Separator />
						<div class="flex items-baseline justify-between gap-4 py-2">
							<dt class="text-muted-foreground">Without asking</dt>
							<dd class="font-mono tabular">{formatMoney(data.mandate.autoApproveAmount)}</dd>
						</div>
						<Separator />
						<div class="flex items-baseline justify-between gap-4 py-2">
							<dt class="text-muted-foreground">Only at</dt>
							<dd class="font-mono text-xs">{data.storeSlug}</dd>
						</div>
						<Separator />
						<div class="flex items-baseline justify-between gap-4 py-2">
							<dt class="text-muted-foreground">Left</dt>
							<dd class="font-mono tabular">{formatMoney(data.mandate.remaining)}</dd>
						</div>
					</dl>
				</Card.Content>
				<Card.Footer>
					<p class="text-xs text-muted-foreground">
						Agent <span class="font-mono">{data.agentId}</span> &middot; expires
						{data.mandate.expiresAt.slice(0, 10)}
					</p>
				</Card.Footer>
			</Card.Root>

			<Card.Root size="sm">
				<Card.Header>
					<div class="flex items-center gap-2">
						<ShieldCheck class="size-4 text-muted-foreground" />
						<Card.Title class="font-heading text-lg">Why this is not a mock</Card.Title>
					</div>
					<Card.Description>
						The runner is started without a single PayPal variable in its environment. The money
						path exists only inside the service.
					</Card.Description>
				</Card.Header>
			</Card.Root>

			{#if data.tape}
				<Card.Root size="sm">
					<Card.Header>
						<Card.Title class="font-heading text-lg">The recorded run</Card.Title>
						<Card.Description>
							<code class="font-mono text-xs">tape.json</code> holds one real sandbox run, captured
							{when(data.tape.recordedAt)}. The replay mode serves these bytes instead of inventing
							answers.
						</Card.Description>
					</Card.Header>
					<Card.Content class="flex flex-col gap-3">
						<ul class="flex flex-col gap-1.5 text-xs">
							{#each data.tape.steps as entry, index (index)}
								<li class="flex items-center gap-2">
									{#if entry.ok}
										<CircleCheck class="size-3 shrink-0 text-success" />
									{:else}
										<CircleX class="size-3 shrink-0 text-destructive" />
									{/if}
									<span class="font-mono text-muted-foreground">{entry.step}</span>
								</li>
							{/each}
						</ul>

						<details class="group">
							<summary
								class="cursor-pointer text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
							>
								Show the JSON
							</summary>
							<pre
								class="mt-3 max-h-64 overflow-auto border border-border bg-muted/40 p-3 font-mono text-[0.6875rem] leading-relaxed"><code
									>{data.tape.json}</code
								></pre>
						</details>
					</Card.Content>
				</Card.Root>
			{:else}
				<Card.Root size="sm">
					<Card.Header>
						<Card.Title class="font-heading text-lg">No recording yet</Card.Title>
						<Card.Description>
							Run <code class="font-mono text-xs">bun run record:tape</code> against the sandbox to fill
							the replay.
						</Card.Description>
					</Card.Header>
				</Card.Root>
			{/if}

			{#if data.demoMode === 'replay'}
				<p class="flex items-start gap-2 text-xs text-muted-foreground">
					<Clock class="mt-0.5 size-3.5 shrink-0" />
					Replay mode. The beats answer from the recording, and a replay cannot be reset.
				</p>
			{/if}
		</aside>
	</div>
</main>
