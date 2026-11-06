import { money, type Money } from '../money';
import type { PayPalClient } from './paypal/client';
import { amountOf, toLedgerInsert, type Store } from './store';

export type RefundDeps = {
	store: Store;
	paypal: PayPalClient;
	now?: () => Date;
};

export type RefundResult =
	| { ok: true; refundId: string; ledgerEventId: string }
	| { ok: false; reason: string; detail?: string };

/**
 * A refund is a human action on one ledger row. It is deliberately not
 * reachable from the runner, which is adversarial case 9.
 */
export async function refundFromRow(
	deps: RefundDeps,
	input: { ledgerEventId: string; by: 'human' }
): Promise<RefundResult> {
	if (input.by !== 'human') return { ok: false, reason: 'agent_cannot_refund' };

	const now = deps.now ?? (() => new Date());

	const event = await deps.store.getLedgerEvent(input.ledgerEventId);
	if (!event) return { ok: false, reason: 'no such ledger row' };
	if (event.kind !== 'captured')
		return { ok: false, reason: 'only a captured row can be refunded' };
	if (!event.paypalId) return { ok: false, reason: 'that row has no capture id' };

	const amount: Money = amountOf(event);

	try {
		const refunded = await deps.paypal.refundCapture({
			captureId: event.paypalId,
			amount,
			requestId: `inkan-refund-${event.id}`
		});

		const row = await deps.store.appendLedger(
			toLedgerInsert({
				spendRequestId: event.spendRequestId,
				mandateId: event.mandateId,
				kind: 'refunded',
				amount,
				merchantId: event.merchantId,
				paypalId: refunded.refundId,
				externalId: null,
				payload: { refundOf: event.paypalId, status: refunded.status },
				occurredAt: now()
			})
		);

		if (event.spendRequestId) {
			await deps.store.updateRequest(event.spendRequestId, {
				status: 'refunded',
				resolvedAt: now()
			});
		}

		return { ok: true, refundId: refunded.refundId, ledgerEventId: row.id };
	} catch (error) {
		return { ok: false, reason: 'paypal refused the refund', detail: String(error) };
	}
}

/**
 * Disputes are read from PayPal rather than invented, so a row can only claim a
 * dispute that PayPal actually knows about.
 */
export async function syncDisputes(
	deps: RefundDeps,
	input: { mandateId: string }
): Promise<{ recorded: number }> {
	const now = deps.now ?? (() => new Date());
	const disputes = await deps.paypal.listDisputes();
	let recorded = 0;

	for (const dispute of disputes) {
		const existing = await deps.store.findLedgerByPayPalId(dispute.disputeId);
		if (existing) continue;

		await deps.store.appendLedger(
			toLedgerInsert({
				spendRequestId: null,
				mandateId: input.mandateId,
				kind: 'disputed',
				amount: money(dispute.amountCents ?? 0),
				merchantId: null,
				paypalId: dispute.disputeId,
				externalId: null,
				payload: dispute,
				occurredAt: now()
			})
		);
		recorded += 1;
	}

	return { recorded };
}
