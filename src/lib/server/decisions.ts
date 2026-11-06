import { agentLog, serviceLog } from './log';
import { settle, type SpendDeps } from './spend';
import { amountOf, toLedgerInsert } from './store';

/**
 * A human decision on one pending request. Approving is what moves money, and
 * it is recorded as a human action so an audit can tell it from a policy verdict.
 */
export type DecisionResult =
	| { ok: true; status: 'denied' }
	| { ok: true; status: 'captured'; captureId: string }
	| { ok: false; status: number; reason: string; detail?: unknown };

export async function decideRequest(
	deps: SpendDeps,
	spendRequestId: string,
	action: 'approve' | 'deny'
): Promise<DecisionResult> {
	const now = new Date();
	const row = await deps.store.getRequest(spendRequestId);
	if (!row) return { ok: false, status: 404, reason: 'no such request' };
	if (row.status !== 'pending') {
		return { ok: false, status: 409, reason: `this request is already ${row.status}` };
	}

	const amount = amountOf(row);

	if (action === 'deny') {
		await deps.store.updateRequest(row.id, {
			status: 'denied',
			decidedBy: 'human',
			decidingRule: 'needs_human',
			reason: 'You refused this one.',
			resolvedAt: now
		});
		await deps.store.appendLedger(
			toLedgerInsert({
				spendRequestId: row.id,
				mandateId: row.mandateId,
				kind: 'denied',
				amount,
				merchantId: row.merchantId,
				paypalId: null,
				externalId: null,
				payload: { by: 'human' },
				occurredAt: now
			})
		);
		agentLog(`human refused ${row.id}, nothing was held`);
		return { ok: true, status: 'denied' };
	}

	await deps.store.updateRequest(row.id, {
		status: 'allowed',
		decidedBy: 'human',
		decidingRule: 'needs_human',
		reason: 'You approved this one.',
		resolvedAt: now
	});
	await deps.store.appendLedger(
		toLedgerInsert({
			spendRequestId: row.id,
			mandateId: row.mandateId,
			kind: 'approved',
			amount,
			merchantId: row.merchantId,
			paypalId: null,
			externalId: null,
			payload: { by: 'human' },
			occurredAt: now
		})
	);

	serviceLog(`human approved ${row.id}, settling ${amount.cents}c`);

	try {
		const settled = await settle(deps, row.id);
		if ('captureId' in settled)
			return { ok: true, status: 'captured', captureId: settled.captureId };
		return { ok: false, status: 502, reason: 'PayPal refused the payment', detail: settled.error };
	} catch (error) {
		return {
			ok: false,
			status: 500,
			reason: error instanceof Error ? error.message : String(error)
		};
	}
}
