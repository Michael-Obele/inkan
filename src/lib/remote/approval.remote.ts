import * as v from 'valibot';
import { command, query } from '$app/server';
import { error } from '@sveltejs/kit';
import { app } from '#lib/server/app';
import { decideRequest } from '#lib/server/decisions';
import { getLedger } from './ledger.remote';
import { money } from '#lib/money';
import { template } from '#lib/server/receipts';

/**
 * The approval card. It answers four questions in one glance: what, why, what it
 * costs now and per month, and how it compares with what the mandate allows.
 */
export const getApproval = query(v.pipe(v.string(), v.minLength(1)), async (id) => {
	const deps = await app();
	const request = await deps.store.getRequest(id);
	if (!request) error(404, 'No such request');

	const mandate = await deps.store.getMandate(request.mandateId);
	if (!mandate) error(404, 'No such mandate');

	const amount = money(request.amountCents, request.amountCurrency);
	const captured = await deps.store.sumCaptured(mandate.id);
	const refunded = await deps.store.sumRefunded(mandate.id);
	const monthlyCents = request.intent?.recurring ? amount.cents : null;

	// What is left after this one, which is not the same as what has been spent.
	const committedCents = captured.cents - refunded.cents;
	const remainingAfterThisCents = mandate.ceilingCents - committedCents - amount.cents;

	const explanation = template({
		merchantEmail: request.merchantEmail ?? null,
		amount: `$${(amount.cents / 100).toFixed(2)}`,
		reason: request.reason ?? 'It matched what the allowance covers.',
		recurring: Boolean(request.intent?.recurring),
		decidingRule: request.decidingRule,
		status: request.status,
		monthly: monthlyCents === null ? null : `$${(monthlyCents / 100).toFixed(2)}`
	});

	return {
		request: {
			id: request.id,
			status: request.status,
			amount,
			merchantId: request.merchantId,
			merchantEmail: request.merchantEmail,
			rawRequest: request.rawRequest,
			recurring: Boolean(request.intent?.recurring),
			category: request.intent?.category ?? 'goods',
			rule: request.decidingRule,
			reason: request.reason,
			failure: request.failure,
			createdAt: request.createdAt.toISOString()
		},
		explanation,
		mandate: {
			id: mandate.id,
			purpose: mandate.purpose,
			ceiling: money(mandate.ceilingCents, mandate.ceilingCurrency),
			autoApproveAmount: money(mandate.autoApproveAmountCents, mandate.autoApproveAmountCurrency),
			committed: money(committedCents, captured.currency),
			remainingAfterThis: money(remainingAfterThisCents, mandate.ceilingCurrency)
		},
		monthly:
			monthlyCents === null
				? null
				: {
						perMonth: money(monthlyCents, amount.currency),
						perYear: money(monthlyCents * 12, amount.currency)
					},
		demoMode: deps.config.demoMode
	};
});

/** Approving is the only path from a pending request to money moving. */
export const decideApproval = command(
	v.object({
		requestId: v.pipe(v.string(), v.minLength(1)),
		action: v.picklist(['approve', 'deny'])
	}),
	async ({ requestId, action }) => {
		const deps = await app();
		const result = await decideRequest(deps, requestId, action);

		if (!result.ok) return { ok: false as const, error: result.reason };

		void getApproval(requestId).refresh();
		void getLedger().refresh();
		return {
			ok: true as const,
			status: result.status,
			captureId: 'captureId' in result ? result.captureId : null,
			note: 'reason' in result ? result.reason : null
		};
	}
);
