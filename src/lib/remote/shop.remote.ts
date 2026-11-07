import { query } from '$app/server';
import { app } from '#lib/server/app';
import { CATALOG } from '#lib/server/catalog';
import { money } from '#lib/money';

/** The shop the agent buys from, read from the one catalogue. */
const PRODUCTS = CATALOG.map((item) => ({
	id: item.id,
	name: item.name,
	note: item.note,
	cents: item.amountCents,
	recurring: item.recurring
}));

export const getShop = query(async () => {
	const deps = await app();
	return {
		slug: deps.config.storeSlug,
		merchantId: deps.config.storeMerchantId,
		products: PRODUCTS.map((product) => ({
			...product,
			price: money(product.cents)
		}))
	};
});
