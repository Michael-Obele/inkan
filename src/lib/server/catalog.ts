/**
 * The three things the agent may try to buy. One list, so the shop page, the
 * scenario and the sentence reader cannot disagree about a price.
 */
export type CatalogItem = {
	id: string;
	name: string;
	note: string;
	amountCents: number;
	merchantSlug: string;
	category: string;
	recurring: boolean;
	/** Lower case words that name this item in a sentence. */
	words: string[];
};

export const CATALOG: CatalogItem[] = [
	{
		id: 'house-blend',
		name: 'House blend, one bag',
		note: 'Roasted this week. The everyday one.',
		amountCents: 1800,
		merchantSlug: 'demo-store',
		category: 'goods',
		recurring: false,
		words: ['house blend', 'beans', 'bag', 'crate']
	},
	{
		id: 'wholesale-bundle',
		name: 'Annual wholesale bundle',
		note: 'Twelve kilos up front, so the shop never runs out.',
		amountCents: 34000,
		merchantSlug: 'demo-store',
		category: 'goods',
		recurring: false,
		words: ['wholesale', 'bundle', 'annual', 'year']
	},
	{
		id: 'subscription',
		name: 'Monthly coffee subscription',
		note: 'One bag a month, billed every month.',
		amountCents: 500,
		merchantSlug: 'demo-store',
		category: 'goods',
		recurring: true,
		words: ['subscription', 'subscribe', 'monthly']
	}
];
