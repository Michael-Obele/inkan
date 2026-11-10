import { formatMoney, money, type Money } from '../money';
import type { Decision, Intent } from './policy';
import type { Mandate } from './mandate';

/**
 * What the agent can do about a refusal. Only the amount is ever in its power:
 * every other refusal needs the person who wrote the allowance, and the agent
 * cannot widen an allowance for itself.
 */
export type AdviceAction =
	'nothing_more_to_do' | 'wait_for_a_person' | 'ask_for_a_smaller_amount' | 'ask_the_person';

export type Advice = {
	action: AdviceAction;
	/** One sentence the agent can act on, or quote to the person unchanged. */
	next: string;
	/** The largest amount this same request would pass at, when that is knowable. */
	mostAllowed: Money | null;
	/** The card for this request, and only while a person can still act on it. */
	approveUrl: string | null;
	/** Where a person issues a wider allowance, when that is the only fix. */
	newAllowanceUrl: string | null;
};

export type AdviceInput = {
	decision: Decision;
	intent: Intent;
	mandate: Mandate;
	committedSpend: Money;
	/** Known only once the request row exists, so a replayed request passes null. */
	approveUrl?: string | null;
	/** The screen that replaces a spent or narrow allowance. */
	newAllowanceUrl?: string | null;
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
	newAllowanceUrl,
	captureFailure
}: AdviceInput): Advice {
	// Only an escalation has a card a person can still act on. Handing a refused
	// request a link to its own card would send the agent somewhere that cannot help.
	const card = decision.verdict === 'ask' ? (approveUrl ?? null) : null;
	const renew = newAllowanceUrl ?? null;

	if (decision.verdict === 'allow') {
		if (captureFailure) {
			const why = captureFailure.issue
				? `PayPal said ${captureFailure.issue}.`
				: 'No reason came back.';
			return {
				action: 'ask_the_person',
				next: `The allowance said yes but the payment did not go through. ${why} Tell the person, and do not try a different amount.`,
				mostAllowed: null,
				approveUrl: null,
				newAllowanceUrl: null
			};
		}
		return {
			action: 'nothing_more_to_do',
			next: 'No approval was needed. The money has moved, and the ledger has the row.',
			mostAllowed: null,
			approveUrl: null,
			newAllowanceUrl: null
		};
	}

	if (decision.verdict === 'ask') {
		return {
			action: 'wait_for_a_person',
			next: card
				? `Nothing is charged until the person decides. Tell them it is waiting at ${card}.`
				: 'Nothing is charged until the person decides. Tell them the request is waiting for them.',
			mostAllowed: null,
			approveUrl: card,
			newAllowanceUrl: null
		};
	}

	switch (decision.rule) {
		case 'mandate_revoked':
			return renewFrom(renew, 'This allowance was stopped, so nothing can be spent with it.');

		case 'mandate_expired':
			return renewFrom(renew, 'This allowance has run out of time.');

		case 'currency_mismatch':
			return {
				action: 'ask_the_person',
				next: `This allowance only spends ${mandate.ceiling.currency}, and this request is in ${intent.amount.currency}. Only the person can issue an allowance in ${intent.amount.currency}.`,
				mostAllowed: null,
				approveUrl: null,
				newAllowanceUrl: renew
			};

		case 'merchant_not_allowed':
			return {
				action: 'ask_the_person',
				next: 'This allowance covers one shop, and this is not it. Only the person can add a shop or issue a wider allowance.',
				mostAllowed: null,
				approveUrl: null,
				newAllowanceUrl: renew
			};

		case 'category_not_allowed': {
			const covered = mandate.allowedCategories.join(' and ');
			return {
				action: 'ask_the_person',
				next: `This allowance covers ${covered}, and this is a ${intent.category} purchase. Only the person can widen it.`,
				mostAllowed: null,
				approveUrl: null,
				newAllowanceUrl: renew
			};
		}

		case 'over_per_txn_cap': {
			const most = mostOnePurchase(mandate, committedSpend);
			// A per-purchase refusal can really be an empty allowance in disguise.
			if (most.cents <= 0) return nothingLeft(renew);
			return {
				action: 'ask_for_a_smaller_amount',
				next: `The most this allowance pays in one purchase is ${formatMoney(most)}. You cannot change that limit.`,
				mostAllowed: most,
				approveUrl: null,
				newAllowanceUrl: renew
			};
		}

		case 'over_ceiling': {
			const room = roomLeft(mandate, committedSpend);
			if (room.cents <= 0) return nothingLeft(renew);
			return {
				action: 'ask_for_a_smaller_amount',
				next: `${formatMoney(room)} is left on this allowance. You cannot raise it.`,
				mostAllowed: room,
				approveUrl: null,
				newAllowanceUrl: renew
			};
		}

		default:
			return {
				action: 'ask_the_person',
				next: 'This one is refused and the amount will not fix it. Ask the person.',
				mostAllowed: null,
				approveUrl: null,
				newAllowanceUrl: renew
			};
	}
}

/** A refusal only a new allowance can answer, with the screen that issues one. */
function renewFrom(newAllowanceUrl: string | null, why: string): Advice {
	return {
		action: 'ask_the_person',
		next: newAllowanceUrl
			? `${why} The person has to issue a new one at ${newAllowanceUrl}. You cannot do that yourself.`
			: `${why} The person has to issue a new one. You cannot do that yourself.`,
		mostAllowed: null,
		approveUrl: null,
		newAllowanceUrl
	};
}

function nothingLeft(newAllowanceUrl: string | null): Advice {
	return renewFrom(newAllowanceUrl, 'There is nothing left on this allowance.');
}
