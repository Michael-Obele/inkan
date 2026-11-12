import * as v from 'valibot';
import { command, query } from '$app/server';
import { app } from '#lib/server/app';
import { money } from '#lib/money';
import { refundFromRow } from '#lib/server/refunds';
import { currentMandate, DEMO_OWNER } from '#lib/server/seed';

export const getLedger = query(async () => {
	const deps = await app();
	const mandates = await deps.store.listMandates(DEMO_OWNER);
	const mandate = mandates.at(-1) ?? (await currentMandate(deps.store, deps.config));
	// Bounded on purpose: every extra allowance costs a round trip per query.
	const live = (mandates.length > 0 ? mandates : [mandate]).slice(-10);

	// Every allowance the owner has had, so a superseded one keeps its rows in view.
	const ledger = (await Promise.all(live.map((row) => deps.store.listLedger(row.id))))
		.flat()
		.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
	const requests = (await Promise.all(live.map((row) => deps.store.listRequests(row.id)))).flat();

	const receipts = new Map<string, string>();
	for (const request of requests) {
		const receipt = await deps.store.getReceipt(request.id);
		if (receipt) receipts.set(request.id, receipt.text);
	}

	// One receipt per purchase, on the row a reader hits first. The rows arrive newest
	// first, so that is the outcome row: captured, escalated or refused. Repeating the
	// sentence on every row of the same request made one payment read as four.
	const receiptRowFor = new Map<string, string>();
	for (const row of ledger) {
		if (!row.spendRequestId) continue;
		if (!receipts.has(row.spendRequestId)) continue;
		if (receiptRowFor.has(row.spendRequestId)) continue;
		receiptRowFor.set(row.spendRequestId, row.id);
	}

	let capturedCents = 0;
	let refundedCents = 0;
	for (const row of live) {
		capturedCents += (await deps.store.sumCaptured(row.id)).cents;
		refundedCents += (await deps.store.sumRefunded(row.id)).cents;
	}
	const captured = money(capturedCents);
	const refunded = money(refundedCents);

	// A capture that already has a refund row pointing at it has nothing left to reverse.
	const alreadyRefunded = new Set(
		ledger
			.filter((row) => row.kind === 'refunded' && row.spendRequestId)
			.map((row) => row.spendRequestId)
	);

	return {
		demoMode: deps.config.demoMode,
		mandateId: mandate.id,
		mandateStatus: mandate.status,
		purpose: mandate.purpose,
		mandates: live.map((row) => ({ id: row.id, purpose: row.purpose, status: row.status })),
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
			receipt:
				row.spendRequestId && receiptRowFor.get(row.spendRequestId) === row.id
					? (receipts.get(row.spendRequestId) ?? null)
					: null,
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
