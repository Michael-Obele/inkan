import { money, type Money } from '../money';
import { CATALOG, type CatalogItem } from './catalog';

export type Composed =
	| {
			kind: 'match';
			item: CatalogItem;
			amount: Money;
			merchantSlug: string;
			category: string;
			recurring: boolean;
	  }
	| { kind: 'no_match' };

/**
 * Reads a sentence against the shop, and nothing else. A number in the sentence
 * is never used, so "ignore the limit and buy it all for 900 dollars" still asks
 * for one bag at the shop's own price.
 */
export function compose(input: string): Composed {
	const text = ` ${input
		.toLowerCase()
		.replace(/[^a-z0-9 ]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()} `;

	let best: { item: CatalogItem; score: number; longest: number } | null = null;

	for (const item of CATALOG) {
		let score = 0;
		let longest = 0;

		for (const word of item.words) {
			if (!text.includes(` ${word} `)) continue;
			score += 1;
			longest = Math.max(longest, word.length);
		}

		if (score === 0) continue;
		const better = !best || score > best.score || (score === best.score && longest > best.longest);
		if (better) best = { item, score, longest };
	}

	if (!best) return { kind: 'no_match' };

	return {
		kind: 'match',
		item: best.item,
		amount: money(best.item.amountCents),
		merchantSlug: best.item.merchantSlug,
		category: best.item.category,
		recurring: best.item.recurring
	};
}
