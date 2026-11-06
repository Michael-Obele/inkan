import { query } from '$app/server';
import { app } from '#lib/server/app';
import { money } from '#lib/money';

/**
 * The shop the agent buys from. One merchant, so the allowlist has something
 * real to check against PayPal's own payee id.
 */
const PRODUCTS = [
	{
		id: 'house-blend',
		name: 'House blend, one bag',
		note: 'Roasted this week. The everyday one.',
		cents: 1800,
		recurring: false
	},
	{
		id: 'wholesale-bundle',
		name: 'Annual wholesale bundle',
		note: 'Twelve kilos up front, so the shop never runs out.',
		cents: 34000,
		recurring: false
	},
	{
		id: 'subscription',
		name: 'Monthly coffee subscription',
		note: 'One bag a month, billed every month.',
		cents: 500,
		recurring: true
	}
];

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
