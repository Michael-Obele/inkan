import { describe, expect, it } from 'vitest';
import { money } from '../money';
import {
	createMandateRecord,
	narrowMandate,
	revokeMandate,
	canonicalJson,
	mandateHash,
	type Mandate,
	type NewMandate
} from './mandate';

const ISO_EXPIRY = new Date('2026-11-13T00:00:00.000Z');
const NOW = new Date('2026-11-06T12:00:00.000Z');

function fields(): NewMandate {
	return {
		id: 'mnd_1',
		ownerId: 'usr_1',
		agentId: 'agt_1',
		purpose: 'Restocking the shop with coffee',
		allowedCategories: ['goods'],
		ceiling: money(12000),
		perTransactionCap: money(5000),
		allowedMerchants: ['8NJ2CK2C6DN3S', 'OTHERMERCHANT'],
		expiresAt: ISO_EXPIRY
	};
}

function build(overrides: Partial<Mandate> = {}): Mandate {
	return { ...createMandateRecord(fields()), ...overrides };
}

describe('mandate record', () => {
	it('starts active with no revocation time', () => {
		const mandate = createMandateRecord(fields());
		expect(mandate.status).toBe('active');
		expect(mandate.revokedAt).toBeNull();
	});

	it('fills in the default auto-approve amount', () => {
		expect(createMandateRecord(fields()).autoApproveAmount).toEqual(money(2000));
	});

	it('keeps an explicit auto-approve amount', () => {
		const mandate = createMandateRecord({ ...fields(), autoApproveAmount: money(500) });
		expect(mandate.autoApproveAmount).toEqual(money(500));
	});

	it('hashes the same mandate identically whatever order the keys arrive in', () => {
		const one = createMandateRecord(fields());
		const other = createMandateRecord({
			expiresAt: ISO_EXPIRY,
			allowedMerchants: ['8NJ2CK2C6DN3S', 'OTHERMERCHANT'],
			perTransactionCap: money(5000),
			ceiling: money(12000),
			allowedCategories: ['goods'],
			purpose: 'Restocking the shop with coffee',
			agentId: 'agt_1',
			ownerId: 'usr_1',
			id: 'mnd_1'
		});
		expect(mandateHash(one)).toBe(mandateHash(other));
	});

	it('changes the hash when any limit changes', () => {
		const base = build();
		expect(mandateHash(build({ ceiling: money(11999) }))).not.toBe(mandateHash(base));
		expect(mandateHash(build({ perTransactionCap: money(4999) }))).not.toBe(mandateHash(base));
	});

	it('serialises a date the same as its ISO string', () => {
		const iso = '2026-11-13T00:00:00.000Z';
		expect(canonicalJson({ at: new Date(iso) })).toBe(canonicalJson({ at: iso }));
	});

	it('lowers the ceiling', () => {
		expect(narrowMandate(build(), { kind: 'lower_ceiling', ceiling: money(8000) }).ceiling).toEqual(
			money(8000)
		);
	});

	it('refuses to raise the ceiling', () => {
		expect(() => narrowMandate(build(), { kind: 'lower_ceiling', ceiling: money(20000) })).toThrow(
			/only lower the ceiling/
		);
	});

	it('refuses a ceiling in another currency', () => {
		expect(() =>
			narrowMandate(build(), { kind: 'lower_ceiling', ceiling: money(8000, 'EUR') })
		).toThrow(/cannot change the currency/);
	});

	it('removes one merchant and leaves the rest', () => {
		const narrowed = narrowMandate(build(), {
			kind: 'remove_merchant',
			merchantId: 'OTHERMERCHANT'
		});
		expect(narrowed.allowedMerchants).toEqual(['8NJ2CK2C6DN3S']);
	});

	it('refuses to remove a merchant that was never allowed', () => {
		expect(() =>
			narrowMandate(build(), { kind: 'remove_merchant', merchantId: 'STRANGER' })
		).toThrow(/not allowed/);
	});

	it('shortens the expiry', () => {
		const earlier = new Date('2026-11-10T00:00:00.000Z');
		expect(
			narrowMandate(build(), { kind: 'shorten_expiry', expiresAt: earlier }).expiresAt
		).toEqual(earlier);
	});

	it('refuses to extend the expiry', () => {
		expect(() =>
			narrowMandate(build(), {
				kind: 'shorten_expiry',
				expiresAt: new Date('2026-12-01T00:00:00.000Z')
			})
		).toThrow(/only shorten the expiry/);
	});

	it('refuses to narrow a revoked mandate', () => {
		const revoked = revokeMandate(build(), NOW);
		expect(() => narrowMandate(revoked, { kind: 'lower_ceiling', ceiling: money(100) })).toThrow(
			/revoked/
		);
	});

	it('records when the mandate was revoked', () => {
		const revoked = revokeMandate(build(), NOW);
		expect(revoked.status).toBe('revoked');
		expect(revoked.revokedAt).toEqual(NOW);
	});

	it('keeps the first revocation time when revoked again', () => {
		const first = revokeMandate(build(), NOW);
		const second = revokeMandate(first, new Date('2026-11-07T00:00:00.000Z'));
		expect(second.revokedAt).toEqual(NOW);
	});
});
