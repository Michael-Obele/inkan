import { createHash } from 'node:crypto';
import { money, type Money } from '../money';

export type MandateStatus = 'active' | 'revoked';

/**
 * A spending authority for one agent. Every limit here is data the rule engine
 * compares against, so a reviewer can read the record and predict every verdict.
 */
export type Mandate = {
	id: string;
	ownerId: string;
	agentId: string;
	/** Shown to a person. Never compared, never scored. */
	purpose: string;
	/** Empty means any category is allowed. */
	allowedCategories: string[];
	ceiling: Money;
	perTransactionCap: Money;
	autoApproveAmount: Money;
	/** PayPal `payee.merchant_id` values, matched exactly. */
	allowedMerchants: string[];
	expiresAt: Date;
	status: MandateStatus;
	revokedAt: Date | null;
};

export type NewMandate = Omit<Mandate, 'autoApproveAmount' | 'status' | 'revokedAt'> & {
	autoApproveAmount?: Money;
};

/** Default that goes through without a human. Overridden per mandate. */
export const DEFAULT_AUTO_APPROVE_AMOUNT = money(2000, 'USD');

export function createMandateRecord(input: NewMandate): Mandate {
	return {
		...input,
		autoApproveAmount: input.autoApproveAmount ?? DEFAULT_AUTO_APPROVE_AMOUNT,
		status: 'active',
		revokedAt: null
	};
}

/** Narrowing can only ever remove room to spend, never add it. */
export type Narrowing =
	| { kind: 'lower_ceiling'; ceiling: Money }
	| { kind: 'remove_merchant'; merchantId: string }
	| { kind: 'shorten_expiry'; expiresAt: Date };

export function narrowMandate(mandate: Mandate, change: Narrowing): Mandate {
	if (mandate.status === 'revoked') throw new Error('cannot narrow a revoked mandate');

	switch (change.kind) {
		case 'lower_ceiling': {
			if (change.ceiling.currency !== mandate.ceiling.currency) {
				throw new Error('narrowing cannot change the currency');
			}
			if (change.ceiling.cents >= mandate.ceiling.cents) {
				throw new Error('narrowing can only lower the ceiling');
			}
			return { ...mandate, ceiling: change.ceiling };
		}
		case 'remove_merchant': {
			if (!mandate.allowedMerchants.includes(change.merchantId)) {
				throw new Error(`${change.merchantId} is not allowed, so it cannot be removed`);
			}
			return {
				...mandate,
				allowedMerchants: mandate.allowedMerchants.filter((id) => id !== change.merchantId)
			};
		}
		case 'shorten_expiry': {
			if (change.expiresAt.getTime() >= mandate.expiresAt.getTime()) {
				throw new Error('narrowing can only shorten the expiry');
			}
			return { ...mandate, expiresAt: change.expiresAt };
		}
	}
}

export function revokeMandate(mandate: Mandate, now: Date): Mandate {
	if (mandate.status === 'revoked') return mandate;
	return { ...mandate, status: 'revoked', revokedAt: now };
}

/**
 * Key order must not change the bytes, so two callers cannot disagree about the
 * same mandate. `node:crypto` is used rather than `Bun.hash` because this hash
 * has to be reproducible outside Bun, for tests and for a reviewer.
 */
export function canonicalJson(value: unknown): string {
	return JSON.stringify(canonicalise(value));
}

function canonicalise(value: unknown): unknown {
	if (value instanceof Date) return value.toISOString();
	if (Array.isArray(value)) return value.map(canonicalise);
	if (value && typeof value === 'object') {
		const source = value as Record<string, unknown>;
		const sorted: Record<string, unknown> = {};
		for (const key of Object.keys(source).sort()) {
			const next = source[key];
			if (next === undefined) continue;
			sorted[key] = canonicalise(next);
		}
		return sorted;
	}
	return value;
}

export function mandateHash(mandate: Mandate): string {
	return createHash('sha256').update(canonicalJson(mandate)).digest('hex');
}
