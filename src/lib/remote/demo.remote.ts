import * as v from 'valibot';
import { command, query } from '$app/server';
import { app } from '#lib/server/app';
import { outcomeOf, resetDemo, runBeat } from '#lib/server/demo';
import { money } from '#lib/money';
import { recordedTape } from '#lib/server/paypal/recorded';
import { SCENARIO } from '#lib/server/scenario';
import { DEMO_MANDATE_ID, seedMandate } from '#lib/server/seed';
import type { RequestStatus } from '#lib/server/requests';

/**
 * The agent console. Every beat is read back from what actually happened, so a
 * reload shows the real state rather than a remembered one.
 */
export const getAgentConsole = query(async () => {
	const deps = await app();
	const mandate = await seedMandate(deps.store, deps.config);
	const requests = await deps.store.listRequests(DEMO_MANDATE_ID);
	const captured = await deps.store.sumCaptured(DEMO_MANDATE_ID);
	const refunded = await deps.store.sumRefunded(DEMO_MANDATE_ID);
	// What is left of the allowance, which is the ceiling minus what is still committed.
	const committedCents = captured.cents - refunded.cents;

	const beats = SCENARIO.map((step, index) => {
		const match = requests.find((row) => row.rawRequest === step.say) ?? null;
		return {
			index: index + 1,
			id: step.id,
			say: step.say,
			amount: money(step.amountCents),
			merchantSlug: step.merchantSlug,
			recurring: step.recurring,
			expect: step.expect,
			last: match
				? {
						requestId: match.id,
						status: match.status,
						actual: outcomeOf(match.status as RequestStatus),
						verdict: match.verdict,
						rule: match.decidingRule,
						reason: match.reason
					}
				: null
		};
	});

	const tape = recordedTape();

	return {
		demoMode: deps.config.demoMode,
		mandate: {
			purpose: mandate.purpose,
			status: mandate.status,
			ceiling: money(mandate.ceilingCents, mandate.ceilingCurrency),
			perTransactionCap: money(mandate.perTransactionCapCents, mandate.perTransactionCapCurrency),
			autoApproveAmount: money(mandate.autoApproveAmountCents, mandate.autoApproveAmountCurrency),
			remaining: money(mandate.ceilingCents - committedCents, mandate.ceilingCurrency),
			expiresAt: mandate.expiresAt.toISOString()
		},
		storeSlug: deps.config.storeSlug,
		agentId: mandate.agentId,
		beats,
		pending: beats.filter((beat) => beat.last?.actual === 'waiting'),
		tape: tape
			? {
					recordedAt: tape.recordedAt,
					steps: tape.entries.map((entry) => ({ step: entry.step, ok: entry.ok })),
					json: JSON.stringify(tape, null, 2)
				}
			: null
	};
});

/**
 * The button the presenter presses instead of starting a second terminal. Same
 * `requestPayment` the runner calls, idempotent by key, so a double click is not
 * a double charge.
 */
export const runBeatNow = command(
	v.object({ stepId: v.pipe(v.string(), v.minLength(1)) }),
	async ({ stepId }) => {
		const deps = await app();
		try {
			const result = await runBeat(deps, stepId);
			void getAgentConsole().refresh();
			return { ok: true as const, result };
		} catch (cause) {
			return {
				ok: false as const,
				error: cause instanceof Error ? cause.message : String(cause)
			};
		}
	}
);

/** Throws the rehearsal away. Refused in replay, where the tape order matters. */
export const resetTheDemo = command(async () => {
	const deps = await app();
	try {
		await resetDemo(deps);
		void getAgentConsole().refresh();
		return { ok: true as const };
	} catch (cause) {
		return {
			ok: false as const,
			error: cause instanceof Error ? cause.message : String(cause)
		};
	}
});
