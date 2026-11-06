import { describe, expect, it } from 'vitest';
import { money } from '../money';
import {
	assertTransition,
	canTransition,
	committedSpendCents,
	idempotencyKey,
	isTerminal,
	type IdempotencyInput,
	type RequestStatus
} from './requests';

const INPUT: IdempotencyInput = {
	mandateId: 'mnd_1',
	agentId: 'agt_1',
	rawRequest: 'Buy one bag of coffee beans',
	amount: money(4500),
	merchantId: '8NJ2CK2C6DN3S'
};

describe('idempotency key', () => {
	it('is stable for the same request', () => {
		expect(idempotencyKey(INPUT)).toBe(idempotencyKey({ ...INPUT }));
	});

	it('collapses surrounding and repeated whitespace', () => {
		expect(idempotencyKey({ ...INPUT, rawRequest: '  Buy   one bag of coffee beans \n' })).toBe(
			idempotencyKey(INPUT)
		);
	});

	it('changes when the amount changes', () => {
		expect(idempotencyKey({ ...INPUT, amount: money(4501) })).not.toBe(idempotencyKey(INPUT));
	});

	it('changes when the merchant changes', () => {
		expect(idempotencyKey({ ...INPUT, merchantId: 'OTHERMERCHANT' })).not.toBe(
			idempotencyKey(INPUT)
		);
	});

	it('changes when the agent or the mandate changes', () => {
		expect(idempotencyKey({ ...INPUT, agentId: 'agt_2' })).not.toBe(idempotencyKey(INPUT));
		expect(idempotencyKey({ ...INPUT, mandateId: 'mnd_2' })).not.toBe(idempotencyKey(INPUT));
	});

	it('changes when the words change', () => {
		expect(idempotencyKey({ ...INPUT, rawRequest: 'Buy two bags of coffee beans' })).not.toBe(
			idempotencyKey(INPUT)
		);
	});

	it('distinguishes amounts that are different lengths in the same currency', () => {
		expect(idempotencyKey({ ...INPUT, amount: money(450) })).not.toBe(idempotencyKey(INPUT));
	});

	it('does not let field boundaries blur into each other', () => {
		const a = idempotencyKey({ ...INPUT, mandateId: 'ab', agentId: 'c' });
		const b = idempotencyKey({ ...INPUT, mandateId: 'a', agentId: 'bc' });
		expect(a).not.toBe(b);
	});
});

describe('state machine', () => {
	const legal: Array<[RequestStatus, RequestStatus]> = [
		['pending', 'allowed'],
		['pending', 'denied'],
		['pending', 'expired'],
		['allowed', 'captured'],
		['allowed', 'failed'],
		['allowed', 'expired'],
		['failed', 'allowed'],
		['captured', 'refunded']
	];

	const illegal: Array<[RequestStatus, RequestStatus]> = [
		['denied', 'allowed'],
		['denied', 'captured'],
		['expired', 'allowed'],
		['captured', 'failed'],
		['refunded', 'captured'],
		['pending', 'captured'],
		['failed', 'captured'],
		['allowed', 'refunded']
	];

	it.each(legal)('allows %s to %s', (from, to) => {
		expect(canTransition(from, to)).toBe(true);
		expect(() => assertTransition(from, to)).not.toThrow();
	});

	it.each(illegal)('refuses %s to %s', (from, to) => {
		expect(canTransition(from, to)).toBe(false);
		expect(() => assertTransition(from, to)).toThrow(/cannot move/);
	});

	it('treats denied, expired and refunded as final', () => {
		expect(isTerminal('denied')).toBe(true);
		expect(isTerminal('expired')).toBe(true);
		expect(isTerminal('refunded')).toBe(true);
	});

	it('treats pending and failed as still in play', () => {
		expect(isTerminal('pending')).toBe(false);
		expect(isTerminal('failed')).toBe(false);
	});
});

describe('committed spend', () => {
	it('counts captured minus refunded', () => {
		expect(committedSpendCents(12000, 3000)).toBe(9000);
	});

	it('does not go negative when a refund exceeds a capture', () => {
		expect(committedSpendCents(1000, 4000)).toBe(-3000);
	});

	it('is zero before anything is captured', () => {
		expect(committedSpendCents(0, 0)).toBe(0);
	});
});
