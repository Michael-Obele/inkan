import type { Config } from './config';
import { money } from '../money';
import type { Store } from './store';

export const DEMO_OWNER = 'demo-human';
export const DEMO_AGENT = 'coffee-runner';
export const DEMO_MANDATE_ID = 'mnd_demo';

/** The one mandate the demo is about. Named so the story is easy to follow. */
export async function seedMandate(store: Store, config: Config) {
	const existing = await store.getMandate(DEMO_MANDATE_ID);
	if (existing) return existing;

	const now = new Date();
	const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

	return store.createMandate({
		id: DEMO_MANDATE_ID,
		ownerId: DEMO_OWNER,
		agentId: DEMO_AGENT,
		purpose: 'Restocking the shop with coffee beans',
		allowedCategories: ['goods'],
		ceilingCents: money(12000).cents,
		ceilingCurrency: 'USD',
		perTransactionCapCents: money(5000).cents,
		perTransactionCapCurrency: 'USD',
		autoApproveAmountCents: money(2000).cents,
		autoApproveAmountCurrency: 'USD',
		allowedMerchants: [config.storeMerchantId],
		expiresAt: expires
	});
}

/** Replay seed: the mandate only, so the ledger fills from the recorded run. */
export async function seedReplay(store: Store, config: Config) {
	return seedMandate(store, config);
}
