import { describe, expect, test } from 'vitest';
import { money } from '../money';
import { createStore } from './capability';
import { loadConfig } from './config';
import { changeMandate, MandateChangeError } from './mandate-actions';
import { seedMandate } from './seed';
import { toLedgerInsert } from './store';
import { createMemoryStore } from './store.memory';

/**
 * Narrowing is the one write a person makes on the allowance screen, and the
 * expensive mistake it can make is touching the record of what was already
 * spent. These tests pin that down.
 */
async function setup() {
	const config = loadConfig({ DEMO_MODE: 'replay' });
	const store = createMemoryStore();
	const mandate = await seedMandate(store, config);

	const deps = {
		store,
		capabilities: createStore({ ttlSeconds: 120 }),
		paypal: {} as never,
		config
	};

	return { config, store, mandate, deps };
}

async function recordSpend(
	store: ReturnType<typeof createMemoryStore>,
	mandateId: string,
	cents: number
) {
	await store.appendLedger(
		toLedgerInsert({
			spendRequestId: null,
			mandateId,
			kind: 'captured',
			amount: money(cents),
			merchantId: '8NJ2CK2C6DN3S',
			paypalId: `CAP-${cents}`,
			externalId: null,
			payload: {},
			occurredAt: new Date('2026-11-06T12:00:00Z')
		})
	);
}

describe('changing the ceiling', () => {
	test('lowers the ceiling and leaves the money already spent alone', async () => {
		const { store, mandate, deps } = await setup();
		await recordSpend(store, mandate.id, 1800);

		const spentBefore = await store.sumCaptured(mandate.id);
		const ledgerBefore = await store.listLedger(mandate.id);

		const result = await changeMandate(deps, mandate.id, {
			kind: 'lower_ceiling',
			ceilingCents: 8000
		});

		expect(result.mandate.ceilingCents).toBe(8000);
		expect(await store.sumCaptured(mandate.id)).toEqual(spentBefore);
		expect(await store.listLedger(mandate.id)).toHaveLength(ledgerBefore.length);
	});

	test('refuses a ceiling that is not lower, and changes nothing', async () => {
		const { store, mandate, deps } = await setup();

		await expect(
			changeMandate(deps, mandate.id, { kind: 'lower_ceiling', ceilingCents: 12000 })
		).rejects.toThrow(MandateChangeError);

		await expect(
			changeMandate(deps, mandate.id, { kind: 'lower_ceiling', ceilingCents: 99999 })
		).rejects.toThrow(/only lower the ceiling/);

		const after = await store.getMandate(mandate.id);
		expect(after?.ceilingCents).toBe(12000);
	});

	test('narrows again from the new ceiling', async () => {
		const { store, mandate, deps } = await setup();

		await changeMandate(deps, mandate.id, { kind: 'lower_ceiling', ceilingCents: 8000 });
		const second = await changeMandate(deps, mandate.id, {
			kind: 'lower_ceiling',
			ceilingCents: 6000
		});

		expect(second.mandate.ceilingCents).toBe(6000);
	});

	test('records one narrowing event per change', async () => {
		const { store, mandate, deps } = await setup();
		const before = await store.countMandateEvents(mandate.id);

		await changeMandate(deps, mandate.id, { kind: 'lower_ceiling', ceilingCents: 8000 });

		expect(await store.countMandateEvents(mandate.id)).toBe(before + 1);
	});

	test('re-decides a waiting request, and only closes the ones now refused', async () => {
		const { store, mandate, deps } = await setup();

		const tooBig = await store.createRequest({
			mandateId: mandate.id,
			agentId: 'coffee-runner',
			idempotencyKey: 'pending-too-big',
			rawRequest: 'Buy the annual wholesale bundle for 50 dollars.',
			amountCents: 5000,
			amountCurrency: 'USD',
			intent: {
				amount: money(5000),
				merchantId: '8NJ2CK2C6DN3S',
				category: 'goods',
				recurring: false,
				description: 'Buy the annual wholesale bundle for 50 dollars.'
			},
			merchantId: '8NJ2CK2C6DN3S',
			status: 'pending'
		});

		const smallRepeat = await store.createRequest({
			mandateId: mandate.id,
			agentId: 'coffee-runner',
			idempotencyKey: 'pending-small',
			rawRequest: 'Sign up for the 5 dollar monthly coffee subscription.',
			amountCents: 500,
			amountCurrency: 'USD',
			intent: {
				amount: money(500),
				merchantId: '8NJ2CK2C6DN3S',
				category: 'goods',
				recurring: true,
				description: 'Sign up for the 5 dollar monthly coffee subscription.'
			},
			merchantId: '8NJ2CK2C6DN3S',
			status: 'pending'
		});

		await changeMandate(deps, mandate.id, { kind: 'lower_ceiling', ceilingCents: 3000 });

		const closed = await store.getRequest(tooBig.id);
		expect(closed?.status).toBe('denied');
		expect(closed?.decidingRule).toBe('mandate_narrowed');

		const stillWaiting = await store.getRequest(smallRepeat.id);
		expect(stillWaiting?.status).toBe('pending');
	});
});
