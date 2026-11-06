import { money, type Money } from '../../money';
import type { PayPalClient, WebhookHeaders } from './client';
import { toLedgerInsert, type Store } from '../store';
import type { LedgerEventKind } from '../db/schema';

export type PayPalWebhook = {
	id?: string;
	event_type?: string;
	create_time?: string;
	resource?: {
		id?: string;
		status?: string;
		amount?: { value?: string; currency_code?: string };
		supplementary_data?: { related_ids?: { order_id?: string; authorization_id?: string } };
		dispute_id?: string;
		reason?: string;
		dispute_amount?: { value?: string; currency_code?: string };
	};
};

export type WebhookOutcome =
	| { accepted: true; kind: LedgerEventKind | null; duplicate: boolean }
	| { accepted: false; reason: string };

/**
 * Maps PayPal's event names onto ledger rows. Anything not listed is accepted
 * and ignored, because an unrecognised event is not a failure.
 */
const EVENT_KINDS: Record<string, LedgerEventKind> = {
	'PAYMENT.CAPTURE.COMPLETED': 'captured',
	'PAYMENT.CAPTURE.REFUNDED': 'refunded',
	'PAYMENT.CAPTURE.REVERSED': 'refunded',
	'PAYMENT.CAPTURE.DENIED': 'failed',
	'PAYMENT.AUTHORIZATION.VOIDED': 'hold_released',
	'CUSTOMER.DISPUTE.CREATED': 'disputed',
	'CUSTOMER.DISPUTE.UPDATED': 'disputed'
};

function cents(value: string | undefined): number | null {
	if (!value) return null;
	const parsed = Number.parseFloat(value);
	return Number.isNaN(parsed) ? null : Math.round(parsed * 100);
}

function amountOf(event: PayPalWebhook): Money {
	const source = event.resource?.dispute_amount ?? event.resource?.amount;
	return money(cents(source?.value) ?? 0, source?.currency_code ?? 'USD');
}

export async function handleWebhook(
	deps: { store: Store; paypal: PayPalClient; now?: () => Date },
	headers: WebhookHeaders,
	rawBody: string
): Promise<WebhookOutcome> {
	const now = deps.now ?? (() => new Date());

	let body: PayPalWebhook;
	try {
		body = JSON.parse(rawBody) as PayPalWebhook;
	} catch {
		return { accepted: false, reason: 'body is not JSON' };
	}

	// Signature first: an unverified webhook can claim any payment it likes.
	const verification = await deps.paypal.verifyWebhook({ headers, body });
	if (!verification.verified) {
		return { accepted: false, reason: verification.reason ?? 'signature rejected' };
	}

	const eventType = body.event_type ?? '';
	const kind = EVENT_KINDS[eventType];
	if (!kind) return { accepted: true, kind: null, duplicate: false };

	const orderId = body.resource?.supplementary_data?.related_ids?.order_id ?? null;
	const resourceId = body.resource?.id ?? null;

	// Join the event to a spend request through the order it belongs to.
	const request = orderId ? await deps.store.findRequestByOrderId(orderId) : null;
	const fromLedger =
		!request && resourceId ? await deps.store.findLedgerByPayPalId(resourceId) : null;

	const spendRequestId = request?.id ?? fromLedger?.spendRequestId ?? null;
	const mandateId = request?.mandateId ?? fromLedger?.mandateId ?? null;
	if (!mandateId) {
		// Nothing to attach it to. Accepted so PayPal stops retrying, but recorded nowhere.
		return { accepted: true, kind: null, duplicate: false };
	}

	const existing = body.id ? await deps.store.findLedgerByExternalId(body.id) : null;
	if (existing) return { accepted: true, kind, duplicate: true };

	await deps.store.appendLedger(
		toLedgerInsert({
			spendRequestId,
			mandateId,
			kind,
			amount: amountOf(body),
			merchantId: request?.merchantId ?? null,
			paypalId: resourceId,
			externalId: body.id ?? null,
			payload: body,
			occurredAt: body.create_time ? new Date(body.create_time) : now()
		})
	);

	if (request) {
		if (kind === 'refunded' && request.status === 'captured') {
			await deps.store.updateRequest(request.id, { status: 'refunded', resolvedAt: now() });
		}
		if (kind === 'captured' && request.status === 'allowed') {
			await deps.store.updateRequest(request.id, { status: 'captured', resolvedAt: now() });
		}
		if (kind === 'failed' && request.status !== 'captured') {
			await deps.store.updateRequest(request.id, {
				status: 'failed',
				failure: { issue: 'WEBHOOK_DENIED', body: JSON.stringify(body) },
				resolvedAt: now()
			});
		}
	}

	return { accepted: true, kind, duplicate: false };
}

export function webhookHeaders(headers: Headers): WebhookHeaders {
	return {
		transmissionId: headers.get('paypal-transmission-id'),
		transmissionTime: headers.get('paypal-transmission-time'),
		transmissionSig: headers.get('paypal-transmission-sig'),
		certUrl: headers.get('paypal-cert-url'),
		authAlgo: headers.get('paypal-auth-algo')
	};
}
