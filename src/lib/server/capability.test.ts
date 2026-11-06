import { beforeEach, describe, expect, it } from 'vitest';
import { createStore, DEFAULT_TTL_SECONDS } from './capability';
import { money } from '../money';

const PAYEE = '8NJ2CK2C6DN3S';
const OTHER = 'OTHERMERCHANT';

let clock: Date;

beforeEach(() => {
	clock = new Date('2026-11-06T12:00:00.000Z');
});

function store(ttlSeconds = 60) {
	return createStore({ ttlSeconds, now: () => clock });
}

function issueOne(target = store(), amount = money(1500), mandateId = 'mnd_1') {
	return target.issue({ mandateId, reference: 'req_1', amount, merchantId: PAYEE });
}

describe('capability store', () => {
	it('defaults to a two minute lifetime', () => {
		const target = createStore({ now: () => clock });
		const issued = issueOne(target);
		expect(DEFAULT_TTL_SECONDS).toBe(120);
		expect(issued.expiresAt.getTime() - issued.issuedAt.getTime()).toBe(120_000);
	});

	it('issues a url-safe token of at least 32 bytes', () => {
		const issued = issueOne();
		expect(issued.token).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(issued.token.length).toBeGreaterThanOrEqual(43);
	});

	it('issues a different token every time', () => {
		const target = store();
		expect(issueOne(target).token).not.toBe(issueOne(target).token);
	});

	it('consumes a fresh token for its own amount and merchant', () => {
		const target = store();
		const result = target.consume(issueOne(target).token, {
			amount: money(1500),
			merchantId: PAYEE
		});
		expect(result.ok).toBe(true);
	});

	it('refuses the same token twice', () => {
		const target = store();
		const issued = issueOne(target);
		const expected = { amount: money(1500), merchantId: PAYEE };
		expect(target.consume(issued.token, expected).ok).toBe(true);
		expect(target.consume(issued.token, expected)).toMatchObject({
			ok: false,
			reason: 'already_used'
		});
	});

	it('burns the token even when the amount is wrong', () => {
		const target = store();
		const issued = issueOne(target);
		expect(target.consume(issued.token, { amount: money(900), merchantId: PAYEE })).toMatchObject({
			ok: false,
			reason: 'amount_mismatch'
		});
		expect(target.consume(issued.token, { amount: money(1500), merchantId: PAYEE })).toMatchObject({
			ok: false,
			reason: 'already_used'
		});
	});

	it('refuses a merchant the token was not issued for', () => {
		const target = store();
		expect(
			target.consume(issueOne(target).token, { amount: money(1500), merchantId: OTHER })
		).toMatchObject({ ok: false, reason: 'merchant_mismatch' });
	});

	it('refuses a token that does not exist', () => {
		expect(store().consume('nope', { amount: money(1500), merchantId: PAYEE })).toMatchObject({
			ok: false,
			reason: 'unknown_token'
		});
	});

	it('refuses a token past its lifetime', () => {
		const target = store(60);
		const issued = issueOne(target);
		clock = new Date(clock.getTime() + 60_001);
		expect(target.consume(issued.token, { amount: money(1500), merchantId: PAYEE })).toMatchObject({
			ok: false,
			reason: 'expired'
		});
	});

	it('accepts a token exactly at the end of its lifetime', () => {
		const target = store(60);
		const issued = issueOne(target);
		clock = new Date(clock.getTime() + 60_000);
		expect(target.consume(issued.token, { amount: money(1500), merchantId: PAYEE }).ok).toBe(true);
	});

	it('kills every live token for one mandate and leaves other mandates alone', () => {
		const target = store();
		const first = issueOne(target, money(1500), 'mnd_a');
		const second = issueOne(target, money(1500), 'mnd_a');
		const survivor = issueOne(target, money(1500), 'mnd_b');

		expect(target.revokeMandate('mnd_a')).toBe(2);

		const expected = { amount: money(1500), merchantId: PAYEE };
		expect(target.consume(first.token, expected)).toMatchObject({ reason: 'already_used' });
		expect(target.consume(second.token, expected)).toMatchObject({ reason: 'already_used' });
		expect(target.consume(survivor.token, expected).ok).toBe(true);
	});

	it('does not count tokens that were already spent', () => {
		const target = store();
		const issued = issueOne(target);
		target.consume(issued.token, { amount: money(1500), merchantId: PAYEE });
		expect(target.revokeMandate('mnd_1')).toBe(0);
	});

	it('reports nothing killed for a mandate it never issued for', () => {
		expect(store().revokeMandate('mnd_missing')).toBe(0);
	});
});
