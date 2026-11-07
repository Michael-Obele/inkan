import * as v from 'valibot';
import { command, query } from '$app/server';
import { app } from '#lib/server/app';
import { outcomeOf, resetDemo, runBeat } from '#lib/server/demo';
import { compose } from '#lib/server/compose';
import { requestPayment } from '#lib/server/spend';
import { money } from '#lib/money';
import { recordedTape } from '#lib/server/paypal/recorded';
import { SCENARIO } from '#lib/server/scenario';
import { currentMandate } from '#lib/server/seed';
import type { RequestStatus } from '#lib/server/requests';

/**
 * The agent console. Every beat is read back from what actually happened, so a
 * reload shows the real state rather than a remembered one.
 */
export const getAgentConsole = query(async () => {
	const deps = await app();
	const mandate = await currentMandate(deps.store, deps.config);
	const requests = await deps.store.listRequests(mandate.id);
	const captured = await deps.store.sumCaptured(mandate.id);
	const refunded = await deps.store.sumRefunded(mandate.id);
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
			// Floored like the allowance screen: a ceiling below what is spent leaves nothing.
			remaining: money(Math.max(0, mandate.ceilingCents - committedCents), mandate.ceilingCurrency),
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

/**
 * Reads a sentence against the shop. The reading comes back on its own, and the
 * request is only made when the person sends it. The price and the shop come from
 * the catalogue, never from the sentence.
 */
export const askTheAgent = command(
	v.object({
		text: v.pipe(v.string(), v.minLength(2), v.maxLength(280)),
		send: v.boolean()
	}),
	async ({ text, send }) => {
		const deps = await app();
		const composed = compose(text);
		if (composed.kind === 'no_match') return { ok: false as const, reason: 'no_match' as const };

		const answer = {
			item: composed.item.name,
			amount: composed.amount,
			merchantSlug: composed.merchantSlug,
			recurring: composed.recurring
		};

		if (!send) return { ok: true as const, sent: false as const, answer };

		// A recorded run is a fixed sequence, so a new request would desync the tape.
		if (deps.config.demoMode === 'replay') {
			return { ok: false as const, reason: 'replay' as const, answer };
		}

		const mandate = await currentMandate(deps.store, deps.config);
		const result = await requestPayment(deps, {
			mandateId: mandate.id,
			agentId: mandate.agentId,
			request: text,
			amount: composed.amount,
			merchantSlug: composed.merchantSlug,
			category: composed.category,
			recurring: composed.recurring
		});

		void getAgentConsole().refresh();

		return {
			ok: true as const,
			sent: true as const,
			answer,
			outcome: {
				requestId: result.requestId,
				status: result.status,
				verdict: result.verdict,
				rule: result.rule,
				reason: result.reason
			}
		};
	}
);
