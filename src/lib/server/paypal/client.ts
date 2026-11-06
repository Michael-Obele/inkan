import type { Config } from '../config';
import { money, type Money } from '../../money';

export type PayPalPayee = {
	merchantId: string;
	emailAddress: string | null;
};

export type CreatedOrder = {
	orderId: string;
	status: string;
	/** Present when PayPal authorized or captured inside the create call. */
	earlyAuthorizationId: string | null;
	earlyCaptureId: string | null;
};

export type OrderView = {
	orderId: string;
	status: string;
	payee: PayPalPayee | null;
	authorizationId: string | null;
	authorizationStatus: string | null;
	captureId: string | null;
};

export type Captured = {
	captureId: string;
	status: string;
};

export type Refunded = {
	refundId: string;
	status: string;
};

export type DisputeRecord = {
	disputeId: string;
	status: string;
	reason: string | null;
	amountCents: number | null;
};

export type WebhookHeaders = {
	transmissionId: string | null;
	transmissionTime: string | null;
	transmissionSig: string | null;
	certUrl: string | null;
	authAlgo: string | null;
};

export type PayPalClient = {
	createBareOrder(input: {
		amount: Money;
		reference: string;
		requestId: string;
	}): Promise<CreatedOrder>;
	getOrder(orderId: string): Promise<OrderView>;
	confirmPaymentSource(input: { orderId: string; requestId: string }): Promise<OrderView>;
	authorizeOrder(input: { orderId: string; requestId: string }): Promise<OrderView>;
	captureAuthorization(input: { authorizationId: string; requestId: string }): Promise<Captured>;
	voidAuthorization(input: { authorizationId: string; requestId: string }): Promise<void>;
	refundCapture(input: {
		captureId: string;
		amount: Money | null;
		requestId: string;
	}): Promise<Refunded>;
	listDisputes(): Promise<DisputeRecord[]>;
	verifyWebhook(input: {
		headers: WebhookHeaders;
		body: unknown;
	}): Promise<{ verified: boolean; reason?: string }>;
};

/** The verbatim PayPal failure, because the issue code is the only evidence. */
export class PayPalError extends Error {
	readonly step: string;
	readonly status: number;
	readonly issue: string | null;
	readonly body: string;

	constructor(step: string, status: number, body: string) {
		super(`${step} failed with ${status}: ${body}`);
		this.name = 'PayPalError';
		this.step = step;
		this.status = status;
		this.issue = extractIssue(body);
		this.body = body;
	}
}

function extractIssue(body: string): string | null {
	try {
		const parsed = JSON.parse(body) as { details?: Array<{ issue?: string }> };
		return parsed.details?.[0]?.issue ?? null;
	} catch {
		return null;
	}
}

type Json = Record<string, unknown>;

type PayeeShape = { merchant_id?: string; email_address?: string };

type UnitShape = {
	payee?: PayeeShape;
	payments?: {
		captures?: Array<{ id?: string; status?: string }>;
		authorizations?: Array<{ id?: string; status?: string }>;
	};
};

type OrderShape = { id?: string; status?: string; purchase_units?: UnitShape[] };

const HOSTS = {
	sandbox: 'https://api-m.sandbox.paypal.com',
	live: 'https://api-m.paypal.com'
} as const;

function amountValue(amount: Money): string {
	return (amount.cents / 100).toFixed(2);
}

function payeeOf(order: OrderShape): PayPalPayee | null {
	const payee = order.purchase_units?.[0]?.payee;
	if (!payee?.merchant_id) return null;
	return { merchantId: payee.merchant_id, emailAddress: payee.email_address ?? null };
}

/**
 * The only module that reads the PayPal credentials. Everything the money path
 * needs is behind this interface so a replay can stand in for it unchanged.
 *
 * The sequence it exposes is the one measured on 2026-11-06. The card is never
 * attached in the create call, because doing so either captures or authorizes
 * during create and destroys the chance to check the merchant first.
 */
export function createPayPalClient(config: Config, fetchImpl: typeof fetch = fetch): PayPalClient {
	const host = HOSTS[config.paypalEnvironment];
	let cachedToken: { value: string; expiresAt: number } | null = null;

	async function token(): Promise<string> {
		if (cachedToken && cachedToken.expiresAt > Date.now() + 5_000) return cachedToken.value;

		const basic = Buffer.from(`${config.paypalClientId}:${config.paypalClientSecret}`).toString(
			'base64'
		);

		const res = await fetchImpl(`${host}/v1/oauth2/token`, {
			method: 'POST',
			headers: {
				Authorization: `Basic ${basic}`,
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: 'grant_type=client_credentials'
		});

		const text = await res.text();
		if (!res.ok) throw new PayPalError('token', res.status, text);

		const parsed = JSON.parse(text) as { access_token: string; expires_in?: number };
		cachedToken = {
			value: parsed.access_token,
			expiresAt: Date.now() + (parsed.expires_in ?? 300) * 1000
		};
		return cachedToken.value;
	}

	async function call<T extends Json>(
		step: string,
		path: string,
		init: { method: 'GET' | 'POST'; body?: unknown; requestId?: string }
	): Promise<T> {
		const access = await token();
		const headers: Record<string, string> = {
			Authorization: `Bearer ${access}`,
			'Content-Type': 'application/json'
		};
		if (init.requestId) headers['PayPal-Request-Id'] = init.requestId;

		const res = await fetchImpl(`${host}${path}`, {
			method: init.method,
			headers,
			body: init.body === undefined ? undefined : JSON.stringify(init.body)
		});

		const text = await res.text();
		if (!res.ok) throw new PayPalError(step, res.status, text);
		return (text ? JSON.parse(text) : {}) as T;
	}

	function viewOf(order: OrderShape): OrderView {
		const unit = order.purchase_units?.[0];
		const authorization = unit?.payments?.authorizations?.[0];
		const capture = unit?.payments?.captures?.[0];
		return {
			orderId: order.id ?? '',
			status: order.status ?? 'UNKNOWN',
			payee: payeeOf(order),
			authorizationId: authorization?.id ?? null,
			authorizationStatus: authorization?.status ?? null,
			captureId: capture?.id ?? null
		};
	}

	return {
		async createBareOrder({ amount, reference, requestId }) {
			const order = await call<OrderShape>('create_order', '/v2/checkout/orders', {
				method: 'POST',
				requestId,
				body: {
					intent: 'AUTHORIZE',
					purchase_units: [
						{
							custom_id: reference,
							amount: { currency_code: amount.currency, value: amountValue(amount) }
						}
					]
					// No payment_source on purpose: see the note above.
				}
			});

			const unit = order.purchase_units?.[0];
			return {
				orderId: order.id ?? '',
				status: order.status ?? 'UNKNOWN',
				earlyAuthorizationId: unit?.payments?.authorizations?.[0]?.id ?? null,
				earlyCaptureId: unit?.payments?.captures?.[0]?.id ?? null
			};
		},

		async getOrder(orderId) {
			return viewOf(
				await call<OrderShape>('get_order', `/v2/checkout/orders/${orderId}`, { method: 'GET' })
			);
		},

		async confirmPaymentSource({ orderId, requestId }) {
			const { name, number, expiry, securityCode } = config.testCard;
			const result = await call<OrderShape>(
				'confirm_payment_source',
				`/v2/checkout/orders/${orderId}/confirm-payment-source`,
				{
					method: 'POST',
					requestId,
					body: {
						payment_source: {
							card: {
								name,
								number,
								expiry,
								security_code: securityCode
							}
						}
					}
				}
			);
			return viewOf(result);
		},

		async authorizeOrder({ orderId, requestId }) {
			return viewOf(
				await call<OrderShape>('authorize_order', `/v2/checkout/orders/${orderId}/authorize`, {
					method: 'POST',
					requestId
				})
			);
		},

		async captureAuthorization({ authorizationId, requestId }) {
			const captured = await call<{
				id?: string;
				status?: string;
				purchase_units?: Array<{
					payments?: { captures?: Array<{ id?: string; status?: string }> };
				}>;
			}>('capture_authorization', `/v2/payments/authorizations/${authorizationId}/capture`, {
				method: 'POST',
				requestId
			});

			const nested = captured.purchase_units?.[0]?.payments?.captures?.[0]?.id;
			const captureId = nested ?? captured.id;
			if (!captureId) throw new PayPalError('capture_authorization', 200, JSON.stringify(captured));
			return { captureId, status: captured.status ?? 'COMPLETED' };
		},

		async voidAuthorization({ authorizationId, requestId }) {
			await call<Json>(
				'void_authorization',
				`/v2/payments/authorizations/${authorizationId}/void`,
				{
					method: 'POST',
					requestId
				}
			);
		},

		async refundCapture({ captureId, amount, requestId }) {
			const body = amount
				? { amount: { currency_code: amount.currency, value: amountValue(amount) } }
				: undefined;
			const refunded = await call<{ id?: string; status?: string }>(
				'refund_capture',
				`/v2/payments/captures/${captureId}/refund`,
				{ method: 'POST', requestId, body }
			);
			return { refundId: refunded.id ?? '', status: refunded.status ?? 'COMPLETED' };
		},

		async listDisputes() {
			const result = await call<{ items?: Array<Json> }>(
				'list_disputes',
				'/v1/customer/disputes?page_size=20',
				{ method: 'GET' }
			);
			return (result.items ?? []).map((item) => ({
				disputeId: String(item.dispute_id ?? ''),
				status: String(item.status ?? ''),
				reason: item.reason ? String(item.reason) : null,
				amountCents: centsFrom(item.dispute_amount)
			}));
		},

		async verifyWebhook({ headers, body }) {
			if (!config.paypalWebhookId) {
				return { verified: false, reason: 'PAYPAL_WEBHOOK_ID is not configured' };
			}
			if (!headers.transmissionId || !headers.transmissionSig || !headers.certUrl) {
				return { verified: false, reason: 'missing webhook signature headers' };
			}

			const result = await call<{ verification_status?: string }>(
				'verify_webhook',
				'/v1/notifications/verify-webhook-signature',
				{
					method: 'POST',
					body: {
						auth_algo: headers.authAlgo,
						cert_url: headers.certUrl,
						transmission_id: headers.transmissionId,
						transmission_sig: headers.transmissionSig,
						transmission_time: headers.transmissionTime,
						webhook_id: config.paypalWebhookId,
						webhook_event: body
					}
				}
			);

			const verified = result.verification_status === 'SUCCESS';
			return verified ? { verified } : { verified, reason: result.verification_status };
		}
	};
}

function centsFrom(value: unknown): number | null {
	if (!value || typeof value !== 'object') return null;
	const amount = value as { value?: string; currency_code?: string };
	if (!amount.value) return null;
	const parsed = Number.parseFloat(amount.value);
	if (Number.isNaN(parsed)) return null;
	return Math.round(parsed * 100);
}

export function zeroMoney(currency = 'USD'): Money {
	return money(0, currency);
}
