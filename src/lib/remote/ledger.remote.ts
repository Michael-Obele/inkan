import * as v from 'valibot';
import { command, query } from '$app/server';
import { app } from '#lib/server/app';
import { money } from '#lib/money';
import { refundFromRow } from '#lib/server/refunds';
import { DEMO_MANDATE_ID, seedMandate } from '#lib/server/seed';

export const getLedger = query(async () => {
	const deps = await app();
	await seedMandate(deps.store, deps.config);

	const mandate = await deps.store.getMandate(DEMO_MANDATE_ID);
	const ledger = await deps.store.listLedger(DEMO_MANDATE_ID);
	const requests = await deps.store.listRequests(DEMO_MANDATE_ID);

	const receipts = new Map<string, string>();
	for (const request of requests) {
		const receipt = await deps.store.getReceipt(request.id);
		if (receipt) receipts.set(request.id, receipt.text);
	}

	const captured = await deps.store.sumCaptured(DEMO_MANDATE_ID);
	const refunded = await deps.store.sumRefunded(DEMO_MANDATE_ID);

	// A capture that already has a refund row pointing at it has nothing left to reverse.
	const alreadyRefunded = new Set(
		ledger
			.filter((row) => row.kind === 'refunded' && row.spendRequestId)
			.map((row) => row.spendRequestId)
	);

	return {
		demoMode: deps.config.demoMode,
		mandateStatus: mandate?.status ?? 'active',
		purpose: mandate?.purpose ?? '',
		captured,
		refunded,
		rows: ledger.map((row) => ({
			id: row.id,
			kind: row.kind,
			at: row.occurredAt.toISOString(),
			amount: money(row.amountCents, row.amountCurrency),
			merchantId: row.merchantId,
			paypalId: row.paypalId,
			spendRequestId: row.spendRequestId,
			receipt: row.spendRequestId ? (receipts.get(row.spendRequestId) ?? null) : null,
			canRefund:
				row.kind === 'captured' && !alreadyRefunded.has(row.spendRequestId) && row.paypalId !== null
		})),
		pending: requests
			.filter((request) => request.status === 'pending')
			.map((request) => ({ id: request.id, rawRequest: request.rawRequest }))
	};
});

/** Refunds are a human action on a row, never something the agent may ask for. */
export const refundCapture = command(
	v.object({ ledgerEventId: v.pipe(v.string(), v.minLength(1)) }),
	async ({ ledgerEventId }) => {
		const deps = await app();
		const result = await refundFromRow(
			{ store: deps.store, paypal: deps.paypal },
			{ ledgerEventId, by: 'human' }
		);

		if (!result.ok) {
			const error =
				result.reason === 'agent_cannot_refund'
					? 'Only a person may refund a payment.'
					: result.reason;
			return { ok: false as const, error };
		}

		void getLedger().refresh();
		return { ok: true as const, refundId: result.refundId, ledgerEventId: result.ledgerEventId };
	}
);
