import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryStore } from './store.memory';
import { createStore } from './capability';
import { money } from '../money';
import { createMandateRecord } from './mandate';
import { requestPayment, settle, type SpendDeps } from './spend';
import { loadConfig } from './config';
import { PayPalError, type CreatedOrder, type OrderView, type PayPalClient } from './paypal/client';

const PAYEE = '8NJ2CK2C6DN3S';
const NOW = new Date('2026-11-06T12:00:00.000Z');

type Calls = string[];

/** A client that answers correctly and remembers what was asked, in order. */
function fakePayPal(
	options: { payeeId?: string; payOnCreate?: boolean; refuseCapture?: boolean } = {}
) {
	const calls: Calls = [];
	const payeeId = options.payeeId ?? PAYEE;

	const client: PayPalClient = {
		async createBareOrder(): Promise<CreatedOrder> {
			calls.push('createBareOrder');
			return {
				orderId: 'ORDER123',
				status: options.payOnCreate ? 'COMPLETED' : 'CREATED',
				earlyAuthorizationId: options.payOnCreate ? 'AUTHEARLY' : null,
				earlyCaptureId: null
			};
		},
		async getOrder(): Promise<OrderView> {
			calls.push('getOrder');
			return {
				orderId: 'ORDER123',
				status: 'APPROVED',
				payee: { merchantId: payeeId, emailAddress: 'shop@example.com' },
				authorizationId: null,
				authorizationStatus: null,
				captureId: null
			};
		},
		async confirmPaymentSource(): Promise<OrderView> {
			calls.push('confirmPaymentSource');
			return {
				orderId: 'ORDER123',
				status: 'APPROVED',
				payee: { merchantId: payeeId, emailAddress: 'shop@example.com' },
				authorizationId: null,
				authorizationStatus: null,
				captureId: null
			};
		},
		async authorizeOrder(): Promise<OrderView> {
			calls.push('authorizeOrder');
			return {
				orderId: 'ORDER123',
				status: 'COMPLETED',
				payee: { merchantId: payeeId, emailAddress: 'shop@example.com' },
				authorizationId: 'AUTH123',
				authorizationStatus: 'CREATED',
				captureId: null
			};
		},
		async captureAuthorization() {
			calls.push('captureAuthorization');
			if (options.refuseCapture) {
				throw new PayPalError(
					'capture_authorization',
					422,
					'{"details":[{"issue":"CAPTURE_FAILED"}]}'
				);
			}
			return { captureId: 'CAPTURE123', status: 'COMPLETED' };
		},
		async voidAuthorization() {
			calls.push('voidAuthorization');
		},
		async refundCapture() {
			calls.push('refundCapture');
			return { refundId: 'REFUND123', status: 'COMPLETED' };
		},
		async listDisputes() {
			calls.push('listDisputes');
			return [];
		},
		async verifyWebhook() {
			return { verified: true };
		}
	};

	return { client, calls };
}

/**
 * The money path under test is the live one. A replay never settles, by design, so
 * the config is built live here and the PayPal client is the only thing faked.
 */
const config = {
	...loadConfig({ DEMO_MODE: 'replay', STORE_MERCHANT_ID: PAYEE }),
	demoMode: 'live' as const
};

let store: ReturnType<typeof createMemoryStore>;
let deps: SpendDeps;
let calls: Calls;

async function seedMandate(overrides: Partial<Parameters<typeof createMandateRecord>[0]> = {}) {
	const record = createMandateRecord({
		id: 'mnd_1',
		ownerId: 'usr_1',
		agentId: 'agt_1',
		purpose: 'Restocking the shop with coffee',
		allowedCategories: ['goods'],
		ceiling: money(12000),
		perTransactionCap: money(5000),
		autoApproveAmount: money(2000),
		allowedMerchants: [PAYEE],
		expiresAt: new Date('2026-11-13T00:00:00.000Z'),
		...overrides
	});

	return store.createMandate({
		id: record.id,
		ownerId: record.ownerId,
		agentId: record.agentId,
		purpose: record.purpose,
		allowedCategories: record.allowedCategories,
		ceilingCents: record.ceiling.cents,
		ceilingCurrency: record.ceiling.currency,
		perTransactionCapCents: record.perTransactionCap.cents,
		perTransactionCapCurrency: record.perTransactionCap.currency,
		autoApproveAmountCents: record.autoApproveAmount.cents,
		autoApproveAmountCurrency: record.autoApproveAmount.currency,
		allowedMerchants: record.allowedMerchants,
		expiresAt: record.expiresAt
	});
}

beforeEach(async () => {
	store = createMemoryStore();
	const fake = fakePayPal();
	calls = fake.calls;
	deps = {
		store,
		paypal: fake.client,
		capabilities: createStore({ ttlSeconds: 120, now: () => NOW }),
		config,
		now: () => NOW
	};
	await seedMandate();
});

function ask(
	overrides: {
		amountCents?: number;
		merchantSlug?: string;
		recurring?: boolean;
		request?: string;
	} = {}
) {
	return requestPayment(deps, {
		mandateId: 'mnd_1',
		agentId: 'agt_1',
		request: overrides.request ?? 'Buy one bag of coffee beans',
		amount: money(overrides.amountCents ?? 1500),
		merchantSlug: overrides.merchantSlug ?? 'demo-store',
		category: 'goods',
		recurring: overrides.recurring ?? false
	});
}

describe('request payment', () => {
	it('refuses a merchant handle that is not in the registry without calling PayPal', async () => {
		const result = await ask({ merchantSlug: 'some-other-shop' });
		expect(result).toMatchObject({ verdict: 'deny', rule: 'merchant_not_allowed' });
		expect(calls).toEqual([]);
	});

	it('escalates an amount over the auto-approve limit and spends nothing', async () => {
		const result = await ask({ amountCents: 4500 });
		expect(result).toMatchObject({ status: 'pending', verdict: 'ask', rule: 'needs_human' });
		expect(calls).toEqual([]);
	});

	it('walks the measured sequence for an allowed purchase', async () => {
		const result = await ask({ amountCents: 1500 });

		expect(result).toMatchObject({ status: 'captured', captureId: 'CAPTURE123' });
		// The card is only attached after the merchant has been read and checked.
		expect(calls).toEqual([
			'createBareOrder',
			'getOrder',
			'confirmPaymentSource',
			'authorizeOrder',
			'getOrder',
			'captureAuthorization'
		]);
	});

	it('records the whole story in the ledger', async () => {
		const result = await ask({ amountCents: 1500 });
		const ledger = await store.listLedger('mnd_1');
		const kinds = ledger.map((row) => row.kind).sort();

		expect(kinds).toEqual(['allowed', 'authorized', 'captured', 'requested']);
		expect(ledger.every((row) => row.spendRequestId === result.requestId)).toBe(true);
	});

	it('returns the same request for a retry instead of paying twice', async () => {
		const first = await ask({ amountCents: 1500 });
		const second = await ask({ amountCents: 1500 });

		expect(second.requestId).toBe(first.requestId);
		expect(calls.filter((call) => call === 'captureAuthorization')).toHaveLength(1);
		expect(await store.sumCaptured('mnd_1')).toEqual(money(1500));
	});

	it('treats the same request worded with extra spaces as the same purchase', async () => {
		const first = await ask({ amountCents: 1500 });
		const second = await requestPayment(deps, {
			mandateId: 'mnd_1',
			agentId: 'agt_1',
			request: '  Buy one bag of coffee beans  ',
			amount: money(1500),
			merchantSlug: 'demo-store',
			category: 'goods',
			recurring: false
		});
		expect(second.requestId).toBe(first.requestId);
	});

	it('releases the hold when PayPal names a different merchant', async () => {
		const fake = fakePayPal({ payeeId: 'SOMEONEELSE' });
		deps.paypal = fake.client;

		const result = await ask({ amountCents: 1500 });

		expect(result.status).toBe('failed');
		expect(fake.calls).toEqual(['createBareOrder', 'getOrder']);
		expect(fake.calls).not.toContain('confirmPaymentSource');
		const ledger = await store.listLedger('mnd_1');
		expect(ledger.some((row) => row.kind === 'hold_released')).toBe(true);
	});

	it('refuses to continue when PayPal settles inside the create call', async () => {
		const fake = fakePayPal({ payOnCreate: true });
		deps.paypal = fake.client;

		const result = await ask({ amountCents: 1500 });

		expect(result.status).toBe('failed');
		expect(fake.calls).toEqual(['createBareOrder']);
		expect(await store.sumCaptured('mnd_1')).toEqual(money(0));
	});

	it('releases the hold when the capture is refused', async () => {
		const fake = fakePayPal({ refuseCapture: true });
		deps.paypal = fake.client;

		const result = await ask({ amountCents: 1500 });

		expect(result.status).toBe('failed');
		expect(fake.calls).toContain('voidAuthorization');
		const ledger = await store.listLedger('mnd_1');
		expect(ledger.some((row) => row.kind === 'hold_released')).toBe(true);
	});

	it('counts a capture against the ceiling for the next request', async () => {
		await ask({ amountCents: 2000, request: 'Buy one bag of coffee beans' });
		const second = await ask({ amountCents: 2000, request: 'Buy a second bag of coffee beans' });
		expect(second.status).toBe('captured');
		expect(await store.sumCaptured('mnd_1')).toEqual(money(4000));
	});

	it('stops at the ceiling once enough has been captured', async () => {
		await seedMandate({ ceiling: money(3000) });
		await ask({ amountCents: 2000, request: 'Buy one bag of coffee beans' });
		const second = await ask({ amountCents: 2000, request: 'Buy a second bag of coffee beans' });

		expect(second).toMatchObject({ verdict: 'deny', rule: 'over_ceiling' });
	});

	it('refuses to settle a request that is not in the allowed state', async () => {
		const result = await ask({ amountCents: 4500 });
		await expect(settle(deps, result.requestId)).rejects.toThrow(/cannot be paid/);
	});
});
