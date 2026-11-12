import { agentLog, serviceLog } from './log';
import { money } from '../money';
import { asMandate } from './mandate-actions';
import { evaluate } from './policy';
import { committedSpendCents } from './requests';
import { settle, type SpendDeps } from './spend';
import { amountOf, toLedgerInsert } from './store';

/**
 * A human decision on one pending request. Approving is what moves money, and
 * it is recorded as a human action so an audit can tell it from a policy verdict.
 */
export type DecisionResult =
	| { ok: true; status: 'denied' }
	| { ok: true; status: 'captured'; captureId: string }
	/** Recorded, but nothing was charged, because the run is a recording. */
	| { ok: true; status: 'recorded'; reason: string }
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

	// Approving is a second chance for the room to be gone: other approvals may
	// have settled since this one was queued. Re-decide against what is committed now.
	const mandateRow = await deps.store.getMandate(row.mandateId);
	if (!mandateRow) return { ok: false, status: 404, reason: 'no such mandate' };

	const captured = await deps.store.sumCaptured(row.mandateId);
	const refunded = await deps.store.sumRefunded(row.mandateId);
	const committed = money(committedSpendCents(captured.cents, refunded.cents), captured.currency);

	const intent = row.intent ?? {
		amount,
		merchantId: row.merchantId ?? '',
		category: 'goods',
		recurring: false,
		description: row.rawRequest
	};
	const decision = evaluate({
		intent,
		mandate: asMandate(mandateRow),
		now,
		committedSpend: committed
	});

	if (decision.verdict === 'deny') {
		await deps.store.updateRequest(row.id, {
			status: 'denied',
			decidedBy: 'policy',
			decidingRule: decision.rule,
			reason: decision.reason,
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
				payload: { rule: decision.rule, because: 'rechecked_on_approve' },
				occurredAt: now
			})
		);
		agentLog(`approval refused for ${row.id}: ${decision.rule}, nothing was held`);
		return { ok: false, status: 409, reason: decision.reason };
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

	// A recording has no live PayPal behind it, so settling would fail and the screen
	// would blame PayPal. The decision is real and stays on the ledger; the charge is
	// the one thing a recording cannot do, and it says so instead of inventing a refusal.
	if (deps.config.demoMode === 'replay') {
		return {
			ok: true,
			status: 'recorded',
			reason:
				'Approved and written to the ledger. This run is a recording, so no money moved. Start it with sandbox keys to settle for real.'
		};
	}

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
