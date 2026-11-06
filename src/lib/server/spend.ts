import type { Config } from './config';
import { merchantIdFor } from './config';
import { createStore, type CapabilityStore } from './capability';
import { money, type Money } from '../money';
import { evaluate, type Intent } from './policy';
import type { PayPalClient } from './paypal/client';
import { PayPalError } from './paypal/client';
import {
	amountOf,
	decisionFields,
	intentFields,
	statusForVerdict,
	toLedgerInsert,
	type Store
} from './store';
import { committedSpendCents, idempotencyKey, type RequestStatus } from './requests';
import type { MandateRow, SpendRequestRow } from './store';

export type RequestPaymentInput = {
	mandateId: string;
	agentId: string;
	/** The agent's own words. Stored verbatim, never trusted. */
	request: string;
	/** What the agent says it wants to buy. */
	amount: Money;
	merchantSlug: string;
	category: string;
	recurring: boolean;
};

export type RequestPaymentResult = {
	requestId: string;
	status: RequestStatus;
	verdict: 'allow' | 'ask' | 'deny';
	rule: string;
	reason: string;
	captureId?: string;
	captureError?: { issue: string | null; body: string };
};

export type SpendDeps = {
	store: Store;
	paypal: PayPalClient;
	capabilities: CapabilityStore;
	config: Config;
	now?: () => Date;
	/** Called when a capture succeeds, so the receipt writer can run out of band. */
	onCaptured?: (requestId: string) => void;
};

/** The path an allowed purchase walks. Each step is ledgered. */
export async function settle(
	deps: SpendDeps,
	requestId: string
): Promise<{ captureId: string } | { error: { issue: string | null; body: string } }> {
	const now = deps.now ?? (() => new Date());
	const request = await deps.store.getRequest(requestId);
	if (!request) throw new Error(`no spend request ${requestId}`);
	// Only an allowed request can be paid: a pending one has no human decision yet.
	if (request.status !== 'allowed') {
		throw new Error(`request ${requestId} is ${request.status}, so it cannot be paid`);
	}

	const mandate = await deps.store.getMandate(request.mandateId);
	if (!mandate) throw new Error(`no mandate ${request.mandateId}`);

	const amount = amountOf(request);
	const merchantId = request.merchantId ?? '';
	const capability = deps.capabilities.issue({
		mandateId: mandate.id,
		reference: request.id,
		amount,
		merchantId
	});

	const consumed = deps.capabilities.consume(capability.token, { amount, merchantId }, now());
	if (!consumed.ok) {
		await deps.store.appendLedger(
			toLedgerInsert({
				spendRequestId: request.id,
				mandateId: mandate.id,
				kind: 'failed',
				amount,
				merchantId,
				paypalId: null,
				externalId: null,
				payload: { stage: 'capability', reason: consumed.reason },
				occurredAt: now()
			})
		);
		await deps.store.updateRequest(request.id, {
			status: 'failed',
			failure: { issue: consumed.reason, body: '' },
			resolvedAt: now()
		});
		return { error: { issue: consumed.reason, body: '' } };
	}

	// Step 1: bare order. Nothing is held, and no card is attached.
	let order;
	try {
		order = await deps.paypal.createBareOrder({
			amount,
			reference: request.id,
			requestId: `inkan-${request.id}-create`
		});
	} catch (error) {
		return failAt(deps, request, mandate, amount, merchantId, 'create_order', error, now);
	}

	await deps.store.updateRequest(request.id, { paypalOrderId: order.orderId });

	// A hold here would mean the card went into the create call, which must not happen.
	if (order.earlyAuthorizationId || order.earlyCaptureId) {
		const body = 'PayPal authorized or captured during create; the merchant was never checked';
		await deps.store.appendLedger(
			toLedgerInsert({
				spendRequestId: request.id,
				mandateId: mandate.id,
				kind: 'failed',
				amount,
				merchantId,
				paypalId: order.orderId,
				externalId: null,
				payload: { stage: 'guard', body },
				occurredAt: now()
			})
		);
		await deps.store.updateRequest(request.id, {
			status: 'failed',
			failure: { issue: 'EARLY_SETTLEMENT', body },
			resolvedAt: now()
		});
		return { error: { issue: 'EARLY_SETTLEMENT', body } };
	}

	// Step 2: ask PayPal who is being paid, before any money is held.
	let view;
	try {
		view = await deps.paypal.getOrder(order.orderId);
	} catch (error) {
		return failAt(deps, request, mandate, amount, merchantId, 'get_order', error, now);
	}

	const actualMerchant = view.payee?.merchantId ?? null;
	if (actualMerchant !== merchantId) {
		const body = `PayPal reports payee ${actualMerchant ?? '(none)'}, the mandate expected ${merchantId}`;
		await release(deps, request, mandate, amount, merchantId, order.orderId, null, body, now);
		return { error: { issue: 'MERCHANT_MISMATCH', body } };
	}

	await deps.store.updateRequest(request.id, { merchantEmail: view.payee?.emailAddress ?? null });

	// Step 3: attach the card. Still nothing held.
	try {
		await deps.paypal.confirmPaymentSource({
			orderId: order.orderId,
			requestId: `inkan-${request.id}-confirm`
		});
	} catch (error) {
		return failAt(deps, request, mandate, amount, merchantId, 'confirm_payment_source', error, now);
	}

	// Step 4: the hold.
	let authorized;
	try {
		authorized = await deps.paypal.authorizeOrder({
			orderId: order.orderId,
			requestId: `inkan-${request.id}-authorize`
		});
	} catch (error) {
		return failAt(deps, request, mandate, amount, merchantId, 'authorize_order', error, now);
	}

	const authorizationId = authorized.authorizationId ?? view.authorizationId;
	if (!authorizationId) {
		const body = 'PayPal did not return an authorization id';
		await release(deps, request, mandate, amount, merchantId, order.orderId, null, body, now);
		return { error: { issue: 'NO_AUTHORIZATION', body } };
	}

	await deps.store.updateRequest(request.id, { paypalAuthorizationId: authorizationId });
	await deps.store.appendLedger(
		toLedgerInsert({
			spendRequestId: request.id,
			mandateId: mandate.id,
			kind: 'authorized',
			amount,
			merchantId,
			paypalId: authorizationId,
			externalId: null,
			payload: { orderId: order.orderId },
			occurredAt: now()
		})
	);

	// Step 5: re-read, because a merchant can change between authorize and capture.
	try {
		const recheck = await deps.paypal.getOrder(order.orderId);
		if (recheck.payee && recheck.payee.merchantId !== merchantId) {
			const body = `Payee changed to ${recheck.payee.merchantId} after authorization`;
			await release(
				deps,
				request,
				mandate,
				amount,
				merchantId,
				order.orderId,
				authorizationId,
				body,
				now
			);
			return { error: { issue: 'MERCHANT_MISMATCH', body } };
		}
	} catch (error) {
		if (error instanceof PayPalError) {
			await release(
				deps,
				request,
				mandate,
				amount,
				merchantId,
				order.orderId,
				authorizationId,
				error.body,
				now
			);
			return { error: { issue: error.issue, body: error.body } };
		}
		throw error;
	}

	// Step 6: capture.
	let captured;
	try {
		captured = await deps.paypal.captureAuthorization({
			authorizationId,
			requestId: `inkan-${request.id}-capture`
		});
	} catch (error) {
		if (error instanceof PayPalError) {
			// A capture that PayPal refuses gets its hold released, never left hanging.
			await release(
				deps,
				request,
				mandate,
				amount,
				merchantId,
				order.orderId,
				authorizationId,
				error.body,
				now
			);
			return { error: { issue: error.issue, body: error.body } };
		}
		throw error;
	}

	await deps.store.updateRequest(request.id, {
		status: 'captured',
		resolvedAt: now()
	});
	await deps.store.appendLedger(
		toLedgerInsert({
			spendRequestId: request.id,
			mandateId: mandate.id,
			kind: 'captured',
			amount,
			merchantId,
			paypalId: captured.captureId,
			externalId: null,
			payload: { orderId: order.orderId, authorizationId },
			occurredAt: now()
		})
	);

	deps.onCaptured?.(request.id);
	return { captureId: captured.captureId };
}

async function failAt(
	deps: SpendDeps,
	request: SpendRequestRow,
	mandate: MandateRow,
	amount: Money,
	merchantId: string,
	stage: string,
	error: unknown,
	now: () => Date
): Promise<{ error: { issue: string | null; body: string } }> {
	const issue = error instanceof PayPalError ? error.issue : null;
	const body = error instanceof PayPalError ? error.body : String(error);

	await deps.store.appendLedger(
		toLedgerInsert({
			spendRequestId: request.id,
			mandateId: mandate.id,
			kind: 'failed',
			amount,
			merchantId,
			paypalId: null,
			externalId: null,
			payload: { stage, body },
			occurredAt: now()
		})
	);
	await deps.store.updateRequest(request.id, {
		status: 'failed',
		failure: { issue: issue ?? stage, body },
		resolvedAt: now()
	});
	return { error: { issue, body } };
}

/** A release is a ledger row, not a refund, because nothing ever settled. */
async function release(
	deps: SpendDeps,
	request: SpendRequestRow,
	mandate: MandateRow,
	amount: Money,
	merchantId: string,
	orderId: string,
	authorizationId: string | null,
	reason: string,
	now: () => Date
): Promise<void> {
	if (authorizationId) {
		try {
			await deps.paypal.voidAuthorization({
				authorizationId,
				requestId: `inkan-${request.id}-void`
			});
		} catch {
			// The hold expires on its own, and the ledger records that we tried.
		}
	}

	await deps.store.appendLedger(
		toLedgerInsert({
			spendRequestId: request.id,
			mandateId: mandate.id,
			kind: 'hold_released',
			amount,
			merchantId,
			paypalId: authorizationId ?? orderId,
			externalId: null,
			payload: { reason },
			occurredAt: now()
		})
	);
	await deps.store.updateRequest(request.id, {
		status: 'failed',
		failure: { issue: 'RELEASED', body: reason },
		resolvedAt: now()
	});
}

/**
 * The runner's only route to money. Idempotent by key, decided by the rule
 * engine, and it never takes a merchant id from the caller.
 */
export async function requestPayment(
	deps: SpendDeps,
	input: RequestPaymentInput
): Promise<RequestPaymentResult> {
	const now = deps.now ?? (() => new Date());
	const at = now();

	const mandate = await deps.store.getMandate(input.mandateId);
	if (!mandate) throw new Error(`no mandate ${input.mandateId}`);

	// A handle the caller chose becomes an id only through the registry. An unknown
	// handle keeps an empty id, so the rule table refuses it and the refusal is
	// recorded like any other rather than vanishing.
	const merchantId = merchantIdFor(deps.config, input.merchantSlug) ?? '';

	const key = idempotencyKey({
		mandateId: input.mandateId,
		agentId: input.agentId,
		rawRequest: input.request,
		amount: input.amount,
		merchantId
	});

	const existing = await deps.store.findRequestByKey(key);
	if (existing) {
		return {
			requestId: existing.id,
			status: existing.status as RequestStatus,
			verdict: (existing.verdict ?? 'ask') as 'allow' | 'ask' | 'deny',
			rule: existing.decidingRule ?? 'needs_human',
			reason: existing.reason ?? 'This request was already received.'
		};
	}

	const intent: Intent = {
		amount: input.amount,
		merchantId,
		category: input.category,
		recurring: input.recurring,
		description: input.request
	};

	const captured = await deps.store.sumCaptured(mandate.id);
	const refunded = await deps.store.sumRefunded(mandate.id);
	const committed = money(committedSpendCents(captured.cents, refunded.cents), captured.currency);

	const decision = evaluate({
		intent,
		mandate: {
			id: mandate.id,
			ownerId: mandate.ownerId,
			agentId: mandate.agentId,
			purpose: mandate.purpose,
			allowedCategories: mandate.allowedCategories,
			ceiling: money(mandate.ceilingCents, mandate.ceilingCurrency),
			perTransactionCap: money(mandate.perTransactionCapCents, mandate.perTransactionCapCurrency),
			autoApproveAmount: money(
				mandate.autoApproveAmountCents,
				maybeCurrency(mandate.autoApproveAmountCurrency)
			),
			allowedMerchants: mandate.allowedMerchants,
			expiresAt: mandate.expiresAt,
			status: mandate.status,
			revokedAt: mandate.revokedAt
		},
		now: at,
		committedSpend: committed
	});

	const row = await deps.store.createRequest({
		mandateId: mandate.id,
		agentId: input.agentId,
		idempotencyKey: key,
		rawRequest: input.request,
		...intentFields(intent, null),
		status: statusForVerdict(decision),
		...decisionFields(decision, 'policy'),
		resolvedAt: decision.verdict === 'ask' ? null : at
	});

	await deps.store.appendLedger(
		toLedgerInsert({
			spendRequestId: row.id,
			mandateId: mandate.id,
			kind: 'requested',
			amount: input.amount,
			merchantId,
			paypalId: null,
			externalId: null,
			payload: { request: input.request },
			occurredAt: at
		})
	);

	await deps.store.appendLedger(
		toLedgerInsert({
			spendRequestId: row.id,
			mandateId: mandate.id,
			kind:
				decision.verdict === 'deny'
					? 'denied'
					: decision.verdict === 'allow'
						? 'allowed'
						: 'escalated',
			amount: input.amount,
			merchantId,
			paypalId: null,
			externalId: null,
			payload: { rule: decision.rule },
			occurredAt: at
		})
	);

	const result: RequestPaymentResult = {
		requestId: row.id,
		status: row.status as RequestStatus,
		verdict: decision.verdict,
		rule: decision.rule,
		reason: decision.reason
	};

	if (decision.verdict !== 'allow') return result;

	const settled = await settle(deps, row.id);
	if ('captureId' in settled)
		return { ...result, status: 'captured', captureId: settled.captureId };
	return { ...result, status: 'failed', captureError: settled.error };
}

function maybeCurrency(value: string | null | undefined): string {
	return value ?? 'USD';
}

let shared: CapabilityStore | null = null;

/** One store per process, so a token issued in one request can be used in the next. */
export function sharedCapabilities(ttlSeconds: number): CapabilityStore {
	if (!shared) shared = createStore({ ttlSeconds });
	return shared;
}

export function resetSharedCapabilities(): void {
	shared = null;
}
