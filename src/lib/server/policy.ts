import type { Mandate } from './mandate';
import { compareMoney, formatMoney, type Money } from '../money';

export type Verdict = 'allow' | 'ask' | 'deny';

export type PolicyRule =
	| 'mandate_revoked'
	| 'mandate_expired'
	| 'currency_mismatch'
	| 'merchant_not_allowed'
	| 'category_not_allowed'
	| 'over_per_txn_cap'
	| 'over_ceiling'
	| 'auto_approve'
	| 'needs_human';

export type Intent = {
	amount: Money;
	merchantId: string;
	category: string;
	recurring: boolean;
	description: string;
};

export type Decision = {
	verdict: Verdict;
	rule: PolicyRule;
	reason: string;
};

export type EvaluationInput = {
	intent: Intent;
	mandate: Mandate;
	now: Date;
	committedSpend: Money;
};

/**
 * Pure and deterministic: the same inputs always give the same verdict, and no
 * model output reaches this file. Purpose is display text; the category is the
 * part a person can inspect and a test can pin.
 */
export function evaluate({ intent, mandate, now, committedSpend }: EvaluationInput): Decision {
	if (mandate.status !== 'active') {
		const when = mandate.revokedAt ? isoDay(mandate.revokedAt) : 'an earlier date';
		return deny(
			'mandate_revoked',
			`This mandate was revoked on ${when}. Nothing can be spent with it.`
		);
	}

	if (now.getTime() > mandate.expiresAt.getTime()) {
		return deny('mandate_expired', `This mandate expired on ${isoDay(mandate.expiresAt)}.`);
	}

	if (intent.amount.currency !== mandate.ceiling.currency) {
		return deny(
			'currency_mismatch',
			`The request is in ${intent.amount.currency} and this mandate only allows ${mandate.ceiling.currency}.`
		);
	}

	if (!mandate.allowedMerchants.includes(intent.merchantId)) {
		return deny('merchant_not_allowed', 'This shop is not one the mandate allows.');
	}

	if (
		mandate.allowedCategories.length > 0 &&
		!mandate.allowedCategories.includes(intent.category)
	) {
		return deny('category_not_allowed', `The mandate does not cover ${intent.category} purchases.`);
	}

	if (compareMoney(intent.amount, mandate.perTransactionCap) > 0) {
		return deny(
			'over_per_txn_cap',
			`${formatMoney(intent.amount)} is over the ${formatMoney(mandate.perTransactionCap)} single purchase limit.`
		);
	}

	const total = committedSpend.cents + intent.amount.cents;
	if (total > mandate.ceiling.cents) {
		return deny(
			'over_ceiling',
			`${formatMoney(intent.amount)} would take the total past ${formatMoney(mandate.ceiling)}. ${formatMoney(committedSpend)} is already committed.`
		);
	}

	// Recurring always asks: a monthly charge is a commitment, not a purchase.
	if (!intent.recurring && compareMoney(intent.amount, mandate.autoApproveAmount) <= 0) {
		return {
			verdict: 'allow',
			rule: 'auto_approve',
			reason: `Under the ${formatMoney(mandate.autoApproveAmount)} limit and not a repeat charge, so it went through.`
		};
	}

	const reason = intent.recurring
		? 'This is a repeat charge, so it always needs your approval.'
		: `The amount is over the ${formatMoney(mandate.autoApproveAmount)} that goes through on its own.`;

	return { verdict: 'ask', rule: 'needs_human', reason };
}

function deny(rule: PolicyRule, reason: string): Decision {
	return { verdict: 'deny', rule, reason };
}

function isoDay(date: Date): string {
	return date.toISOString().slice(0, 10);
}
