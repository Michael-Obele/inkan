import { describe, expect, it } from 'vitest';
import { createMandateRecord, type Mandate } from './mandate';
import { money } from '../money';
import { evaluate, type Intent } from './policy';
import { advise } from './advice';

const NOW = new Date('2026-11-06T12:00:00.000Z');
const PAYEE = '8NJ2CK2C6DN3S';
const APPROVE = 'http://localhost:5173/approve/req_1';

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

/** The advice is driven by a real decision, so the two cannot drift. */
function run(
	overrides: {
		intent?: Partial<Intent>;
		mandate?: Partial<Mandate>;
		committedCents?: number;
		captureFailure?: { issue: string | null; body: string } | null;
	} = {}
) {
	const mandate = buildMandate(overrides.mandate);
	const intent = buildIntent(overrides.intent);
	const committedSpend = money(overrides.committedCents ?? 0);
	const decision = evaluate({ intent, mandate, now: NOW, committedSpend });

	return advise({
		decision,
		intent,
		mandate,
		committedSpend,
		approveUrl: APPROVE,
		captureFailure: overrides.captureFailure
	});
}

describe('advice', () => {
	it('tells the agent there is nothing left to do after a capture', () => {
		expect(run({ intent: { amount: money(1500) } })).toMatchObject({
			action: 'nothing_more_to_do',
			mostAllowed: null,
			approveUrl: null
		});
	});

	it('stops claiming success when the capture failed', () => {
		const advice = run({
			intent: { amount: money(1500) },
			captureFailure: { issue: 'INSTRUMENT_DECLINED', body: '{}' }
		});
		expect(advice.action).toBe('ask_the_person');
		expect(advice.next).toContain('INSTRUMENT_DECLINED');
	});

	it('hands the person a link when a request is waiting', () => {
		const advice = run({ intent: { amount: money(4500) } });
		expect(advice).toMatchObject({ action: 'wait_for_a_person', approveUrl: APPROVE });
		expect(advice.next).toContain(APPROVE);
	});

	it('says a revoked allowance needs a person, not a retry', () => {
		const advice = run({ mandate: { status: 'revoked', revokedAt: NOW } });
		expect(advice.action).toBe('ask_the_person');
		expect(advice.next).toContain('cannot issue one yourself');
	});

	it('says an expired allowance needs a person', () => {
		expect(run({ mandate: { expiresAt: new Date('2026-11-01T00:00:00.000Z') } }).action).toBe(
			'ask_the_person'
		);
	});

	it('names the shop as something only a person can add', () => {
		const advice = run({ intent: { merchantId: 'SOMEONE_ELSE' } });
		expect(advice.action).toBe('ask_the_person');
		expect(advice.next).toContain('Only the person');
	});

	it('names the categories an allowance does cover', () => {
		const advice = run({ intent: { category: 'travel' } });
		expect(advice.action).toBe('ask_the_person');
		expect(advice.next).toContain('goods');
	});

	it('gives the largest amount that would pass a per-purchase cap', () => {
		const advice = run({ intent: { amount: money(6000) } });
		expect(advice).toMatchObject({
			action: 'ask_for_a_smaller_amount',
			mostAllowed: money(5000)
		});
	});

	it('lowers that amount when the allowance is nearly spent', () => {
		const advice = run({ intent: { amount: money(6000) }, committedCents: 9000 });
		expect(advice).toMatchObject({
			action: 'ask_for_a_smaller_amount',
			mostAllowed: money(3000)
		});
	});

	it('gives the room left when the ceiling is the rule that stopped it', () => {
		const advice = run({ intent: { amount: money(4500) }, committedCents: 9000 });
		expect(advice).toMatchObject({
			action: 'ask_for_a_smaller_amount',
			mostAllowed: money(3000)
		});
	});

	it('stops offering a smaller amount when there is no room left', () => {
		const advice = run({ intent: { amount: money(4500) }, committedCents: 12000 });
		expect(advice).toMatchObject({ action: 'ask_the_person', mostAllowed: null });
	});

	it('treats a per-purchase refusal on a spent allowance as an empty allowance', () => {
		const advice = run({ intent: { amount: money(6000) }, committedCents: 12000 });
		expect(advice.action).toBe('ask_the_person');
		expect(advice.mostAllowed).toBeNull();
	});

	it('is deterministic for the same decision and numbers', () => {
		const one = run({ intent: { amount: money(6000) } });
		const other = run({ intent: { amount: money(6000) } });
		expect(one).toEqual(other);
	});
});
