import { formatMoney, money, type Money } from '../money';
import type { Decision, Intent } from './policy';
import type { Mandate } from './mandate';

/**
 * What the agent can do about a refusal. Only the amount is ever in its power:
 * every other refusal needs the person who wrote the allowance, and the agent
 * cannot widen an allowance for itself.
 */
export type AdviceAction =
	| 'nothing_more_to_do'
	| 'wait_for_a_person'
	| 'ask_for_a_smaller_amount'
	| 'ask_the_person';

export type Advice = {
	action: AdviceAction;
	/** One sentence the agent can act on, or quote to the person unchanged. */
	next: string;
	/** The largest amount this same request would pass at, when that is knowable. */
	mostAllowed: Money | null;
	/** Where the person decides, when a person is the answer. */
	approveUrl: string | null;
};

export type AdviceInput = {
	decision: Decision;
	intent: Intent;
	mandate: Mandate;
	committedSpend: Money;
	/** Known only once the request row exists, so a replayed request passes null. */
	approveUrl?: string | null;
	/** Set when a decision of `allow` did not settle, so the reply stops claiming it did. */
	captureFailure?: { issue: string | null; body: string } | null;
};

/** Room left on the allowance, never below zero. */
function roomLeft(mandate: Mandate, committedSpend: Money): Money {
	return money(Math.max(0, mandate.ceiling.cents - committedSpend.cents), mandate.ceiling.currency);
}

/** The most that would pass one purchase, given both the per-purchase cap and the room. */
function mostOnePurchase(mandate: Mandate, committedSpend: Money): Money {
	const room = roomLeft(mandate, committedSpend);
	const cents = Math.min(room.cents, mandate.perTransactionCap.cents);
	return money(cents, mandate.ceiling.currency);
}

/**
 * Pure, like the rule engine: the same decision and the same numbers always give
 * the same sentence, so a client can cache it and a test can pin it.
 */
export function advise({
	decision,
	intent,
	mandate,
	committedSpend,
	approveUrl,
	captureFailure
}: AdviceInput): Advice {
	const verified = approveUrl ?? null;

	if (decision.verdict === 'allow') {
		if (captureFailure) {
			const why = captureFailure.issue ? `PayPal said ${captureFailure.issue}.` : 'No reason came back.';
			return {
				action: 'ask_the_person',
				next: `The allowance said yes but the payment did not go through. ${why} Tell the person, and do not try a different amount.`,
				mostAllowed: null,
				approveUrl: verified
			};
		}
		return {
			action: 'nothing_more_to_do',
			next: 'No approval was needed. The money has moved, and the ledger has the row.',
			mostAllowed: null,
			approveUrl: null
		};
	}

	if (decision.verdict === 'ask') {
		return {
			action: 'wait_for_a_person',
			next: verified
				? `Nothing is charged until the person decides. Tell them it is waiting at ${verified}.`
				: 'Nothing is charged until the person decides. Tell them the request is waiting for them.',
			mostAllowed: null,
			approveUrl: verified
		};
	}

	switch (decision.rule) {
		case 'mandate_revoked':
			return {
				action: 'ask_the_person',
				next: 'This allowance was stopped, so nothing can be spent with it. Ask the person to issue a new one. You cannot issue one yourself.',
				mostAllowed: null,
				approveUrl: verified
			};

		case 'mandate_expired':
			return {
				action: 'ask_the_person',
				next: 'This allowance has run out of time. Ask the person to issue a new one. You cannot issue one yourself.',
				mostAllowed: null,
				approveUrl: verified
			};

		case 'currency_mismatch':
			return {
				action: 'ask_the_person',
				next: `This allowance only spends ${mandate.ceiling.currency}, and this request is in ${intent.amount.currency}. Ask the person for an allowance in ${intent.amount.currency}.`,
				mostAllowed: null,
				approveUrl: verified
			};

		case 'merchant_not_allowed':
			return {
				action: 'ask_the_person',
				next: 'This allowance covers one shop, and this is not it. Only the person can add a shop or issue a wider allowance.',
				mostAllowed: null,
				approveUrl: verified
			};

		case 'category_not_allowed': {
			const covered = mandate.allowedCategories.join(' and ');
			return {
				action: 'ask_the_person',
				next: `This allowance covers ${covered} and this is a ${intent.category} purchase. Only the person can widen it.`,
				mostAllowed: null,
				approveUrl: verified
			};
		}

		case 'over_per_txn_cap': {
			const most = mostOnePurchase(mandate, committedSpend);
			// A per-purchase refusal can really be an empty allowance in disguise.
			if (most.cents <= 0) return nothingLeft(verified);
			return {
				action: 'ask_for_a_smaller_amount',
				next: `The most one purchase can be is ${formatMoney(most)}. Ask for that or less, and the same request will go through.`,
				mostAllowed: most,
				approveUrl: verified
			};
		}

		case 'over_ceiling': {
			const room = roomLeft(mandate, committedSpend);
			if (room.cents <= 0) return nothingLeft(verified);
			return {
				action: 'ask_for_a_smaller_amount',
				next: `${formatMoney(room)} is left on this allowance. Ask for that or less, or ask the person for a new allowance.`,
				mostAllowed: room,
				approveUrl: verified
			};
		}

		default:
			return {
				action: 'ask_the_person',
				next: 'This one is refused and the amount will not fix it. Ask the person.',
				mostAllowed: null,
				approveUrl: verified
			};
	}
}

function nothingLeft(approveUrl: string | null): Advice {
	return {
		action: 'ask_the_person',
		next: 'There is nothing left on this allowance. Ask the person for a new one. You cannot issue one yourself.',
		mostAllowed: null,
		approveUrl
	};
}
