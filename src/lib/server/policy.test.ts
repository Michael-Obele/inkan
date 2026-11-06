import { describe, expect, it } from 'vitest';
import { createMandateRecord, type Mandate } from './mandate';
import { money } from '../money';
import { evaluate, type Intent } from './policy';

const NOW = new Date('2026-11-06T12:00:00.000Z');
const PAYEE = '8NJ2CK2C6DN3S';

function buildMandate(overrides: Partial<Mandate> = {}): Mandate {
	return {
		...createMandateRecord({
			id: 'mnd_1',
			ownerId: 'usr_1',
			agentId: 'agt_1',
			purpose: 'Restocking the shop with coffee',
			allowedCategories: ['goods'],
			ceiling: money(12000),
			perTransactionCap: money(5000),
			autoApproveAmount: money(2000),
			allowedMerchants: [PAYEE],
			expiresAt: new Date('2026-11-13T00:00:00.000Z')
		}),
		...overrides
	};
}

function buildIntent(overrides: Partial<Intent> = {}): Intent {
	return {
		amount: money(4500),
		merchantId: PAYEE,
		category: 'goods',
		recurring: false,
		description: 'One bag of coffee beans',
		...overrides
	};
}

function run(
	overrides: {
		intent?: Partial<Intent>;
		mandate?: Partial<Mandate>;
		committedCents?: number;
	} = {}
) {
	return evaluate({
		intent: buildIntent(overrides.intent),
		mandate: buildMandate(overrides.mandate),
		now: NOW,
		committedSpend: money(overrides.committedCents ?? 0)
	});
}

describe('policy engine', () => {
	it('denies a revoked mandate and names the rule', () => {
		expect(run({ mandate: { status: 'revoked', revokedAt: NOW } })).toMatchObject({
			verdict: 'deny',
			rule: 'mandate_revoked'
		});
	});

	it('denies a request after the expiry', () => {
		expect(run({ mandate: { expiresAt: new Date(NOW.getTime() - 1) } })).toMatchObject({
			verdict: 'deny',
			rule: 'mandate_expired'
		});
	});

	it('lets a request through at the exact expiry instant', () => {
		expect(run({ mandate: { expiresAt: NOW } }).rule).not.toBe('mandate_expired');
	});

	it('denies a currency the mandate does not use', () => {
		expect(run({ intent: { amount: money(4500, 'EUR') } })).toMatchObject({
			verdict: 'deny',
			rule: 'currency_mismatch'
		});
	});

	it('denies a merchant that is not on the list', () => {
		expect(run({ intent: { merchantId: 'SOMEONEELSE' } })).toMatchObject({
			verdict: 'deny',
			rule: 'merchant_not_allowed'
		});
	});

	it('denies a merchant name that only contains an allowed one', () => {
		const nearMisses = [`${PAYEE}S`, PAYEE.slice(0, -1), `${PAYEE} store`, `x${PAYEE}`];
		for (const merchantId of nearMisses) {
			expect(run({ intent: { merchantId } })).toMatchObject({ rule: 'merchant_not_allowed' });
		}
	});

	it('denies a category the mandate does not cover', () => {
		expect(run({ intent: { category: 'electronics' } })).toMatchObject({
			verdict: 'deny',
			rule: 'category_not_allowed'
		});
	});

	it('allows any category when the mandate names none', () => {
		expect(
			run({ mandate: { allowedCategories: [] }, intent: { category: 'electronics' } }).rule
		).not.toBe('category_not_allowed');
	});

	it('denies a single purchase over the per-transaction cap', () => {
		expect(run({ intent: { amount: money(5001) } })).toMatchObject({
			verdict: 'deny',
			rule: 'over_per_txn_cap'
		});
	});

	it('lets the cap itself reach the next rule', () => {
		expect(run({ intent: { amount: money(5000) } }).rule).not.toBe('over_per_txn_cap');
	});

	it('denies a purchase that would cross the ceiling', () => {
		expect(run({ committedCents: 8000, intent: { amount: money(4500) } })).toMatchObject({
			verdict: 'deny',
			rule: 'over_ceiling'
		});
	});

	it('allows a purchase that lands exactly on the ceiling', () => {
		expect(run({ committedCents: 7500, intent: { amount: money(4500) } }).rule).not.toBe(
			'over_ceiling'
		);
	});

	it('denies the second half of a split purchase that each half would pass alone', () => {
		const mandate = {
			perTransactionCap: money(6000),
			ceiling: money(10000),
			autoApproveAmount: money(1000)
		};
		expect(run({ mandate, committedCents: 0, intent: { amount: money(6000) } }).verdict).not.toBe(
			'deny'
		);
		expect(run({ mandate, committedCents: 6000, intent: { amount: money(6000) } })).toMatchObject({
			rule: 'over_ceiling'
		});
	});

	it('auto-approves a small one-off purchase inside the limit', () => {
		expect(run({ intent: { amount: money(1500) } })).toMatchObject({
			verdict: 'allow',
			rule: 'auto_approve'
		});
	});

	it('auto-approves exactly at the limit', () => {
		expect(run({ intent: { amount: money(2000) } })).toMatchObject({
			verdict: 'allow',
			rule: 'auto_approve'
		});
	});

	it('asks for one cent over the limit', () => {
		expect(run({ intent: { amount: money(2001) } })).toMatchObject({
			verdict: 'ask',
			rule: 'needs_human'
		});
	});

	it('always asks for a repeat charge, however small', () => {
		expect(run({ intent: { amount: money(100), recurring: true } })).toMatchObject({
			verdict: 'ask',
			rule: 'needs_human'
		});
	});

	it('gives the same answer twice for the same inputs', () => {
		expect(run()).toEqual(run());
	});
});
