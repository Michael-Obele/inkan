import { money } from '../money';
import { agentLog, serviceLog } from './log';
import { narrowMandate, revokeMandate, type Mandate, type Narrowing } from './mandate';
import { evaluate } from './policy';
import { committedSpendCents } from './requests';
import type { SpendDeps } from './spend';
import { amountOf, toLedgerInsert, type MandateRow } from './store';

/**
 * Narrowing and revoking, lifted out of the HTTP route so the form action, the
 * remote function and the REST endpoint cannot drift into three behaviours.
 */
export type MandateChange =
	| { kind: 'revoke' }
	/** Ends this allowance because a new one replaces it. Works even when already stopped. */
	| { kind: 'supersede'; replacedBy: string }
	| { kind: 'lower_ceiling'; ceilingCents: number }
	| { kind: 'remove_merchant'; merchantId: string }
	| { kind: 'shorten_expiry'; expiresAt: string };

export type MandateChangeResult = {
	mandate: MandateRow;
	liveCapabilitiesKilled: number;
};

/** Carries an HTTP status so the route stays a thin translator. */
export class MandateChangeError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
		this.name = 'MandateChangeError';
	}
}

export function asMandate(row: MandateRow): Mandate {
	return {
		id: row.id,
		ownerId: row.ownerId,
		agentId: row.agentId,
		purpose: row.purpose,
		allowedCategories: row.allowedCategories,
		ceiling: money(row.ceilingCents, row.ceilingCurrency),
		perTransactionCap: money(row.perTransactionCapCents, row.perTransactionCapCurrency),
		autoApproveAmount: money(row.autoApproveAmountCents, row.autoApproveAmountCurrency),
		allowedMerchants: row.allowedMerchants,
		expiresAt: row.expiresAt,
		status: row.status,
		revokedAt: row.revokedAt
	};
}

export async function changeMandate(
	deps: SpendDeps,
	mandateId: string,
	change: MandateChange
): Promise<MandateChangeResult> {
	const row = await deps.store.getMandate(mandateId);
	if (!row) throw new MandateChangeError(404, 'no such mandate');
	// Superseding is the one change that must work on a stopped allowance, because
	// that is the state a person is in when they need to issue a replacement.
	if (row.status === 'revoked' && change.kind !== 'supersede')
		throw new MandateChangeError(409, 'this mandate is already revoked');

	const current = asMandate(row);
	const now = new Date();

	if (change.kind === 'revoke' || change.kind === 'supersede') {
		if (row.status === 'revoked') {
			await deps.store.recordMandateEvent({
				mandateId: row.id,
				kind: 'revoked',
				change: null,
				at: now
			});
			return { mandate: row, liveCapabilitiesKilled: 0 };
		}

		const revoked = revokeMandate(current, now);
		const updated = await deps.store.updateMandate(row.id, {
			status: 'revoked',
			revokedAt: revoked.revokedAt
		});

		const killed = deps.capabilities.revokeMandate(row.id, now);

		// A pending request dies with the mandate, rather than being approvable later.
		for (const pending of await deps.store.listRequests(row.id)) {
			if (pending.status !== 'pending') continue;
			await deps.store.updateRequest(pending.id, { status: 'expired', resolvedAt: now });
		}

		await deps.store.recordMandateEvent({
			mandateId: row.id,
			kind: 'revoked',
			change: null,
			at: now
		});

		await deps.store.appendLedger(
			toLedgerInsert({
				spendRequestId: null,
				mandateId: row.id,
				kind: 'hold_released',
				amount: money(0, row.ceilingCurrency),
				merchantId: null,
				paypalId: null,
				externalId: null,
				payload:
					change.kind === 'supersede'
						? { event: 'mandate_superseded', replacedBy: change.replacedBy }
						: { event: 'mandate_revoked', liveCapabilitiesKilled: killed },
				occurredAt: now
			})
		);

		serviceLog(`mandate ${row.id} revoked, ${killed} live capability killed`);
		return { mandate: updated, liveCapabilitiesKilled: killed };
	}

	const narrowing: Narrowing =
		change.kind === 'lower_ceiling'
			? { kind: 'lower_ceiling', ceiling: money(change.ceilingCents, row.ceilingCurrency) }
			: change.kind === 'remove_merchant'
				? { kind: 'remove_merchant', merchantId: change.merchantId }
				: { kind: 'shorten_expiry', expiresAt: new Date(change.expiresAt) };

	// Every refusal leaves this function as one type, so no caller has to guess
	// whether a rule failure arrives as a 409 or a bare Error.
	let narrowed: Mandate;
	try {
		narrowed = narrowMandate(current, narrowing);
	} catch (cause) {
		throw new MandateChangeError(422, cause instanceof Error ? cause.message : String(cause));
	}

	const updated = await deps.store.updateMandate(row.id, {
		ceilingCents: narrowed.ceiling.cents,
		allowedMerchants: narrowed.allowedMerchants,
		expiresAt: narrowed.expiresAt
	});

	await deps.store.recordMandateEvent({
		mandateId: row.id,
		kind: 'narrowed',
		change: narrowing,
		at: now
	});

	// A pending request must not survive a narrowing that now refuses it. Without
	// this, approving it would settle past the ceiling the person just set.
	const captured = await deps.store.sumCaptured(row.id);
	const refunded = await deps.store.sumRefunded(row.id);
	const committed = money(committedSpendCents(captured.cents, refunded.cents), captured.currency);
	const narrowedMandate = asMandate(updated);

	for (const pending of await deps.store.listRequests(row.id)) {
		if (pending.status !== 'pending' || !pending.intent) continue;

		const decision = evaluate({
			intent: pending.intent,
			mandate: narrowedMandate,
			now,
			committedSpend: committed
		});

		if (decision.verdict !== 'deny') continue;

		await deps.store.updateRequest(pending.id, {
			status: 'denied',
			decidedBy: 'policy',
			decidingRule: 'mandate_narrowed',
			reason: decision.reason,
			resolvedAt: now
		});

		await deps.store.appendLedger(
			toLedgerInsert({
				spendRequestId: pending.id,
				mandateId: row.id,
				kind: 'denied',
				amount: amountOf(pending),
				merchantId: pending.merchantId,
				paypalId: null,
				externalId: null,
				payload: { rule: 'mandate_narrowed', because: decision.rule },
				occurredAt: now
			})
		);

		agentLog(`pending request ${pending.id} denied because the mandate was narrowed`);
	}

	agentLog(`mandate narrowed: ${narrowing.kind}`);
	return { mandate: updated, liveCapabilitiesKilled: 0 };
}
