import { compareMoney, type Money } from '../money';

/**
 * A single-use, short-lived permission to spend one amount at one merchant.
 * Holding it is the only way the PayPal client will move money.
 */
export type Capability = {
	token: string;
	mandateId: string;
	/** The spend request it was issued for, so the ledger can join the two. */
	reference: string;
	amount: Money;
	merchantId: string;
	issuedAt: Date;
	expiresAt: Date;
	usedAt: Date | null;
};

export type IssueInput = {
	mandateId: string;
	reference: string;
	amount: Money;
	merchantId: string;
};

export type Expected = {
	amount: Money;
	merchantId: string;
};

export type ConsumeResult =
	| { ok: true; capability: Capability }
	| { ok: false; reason: 'unknown_token' }
	| { ok: false; reason: 'already_used'; usedAt: Date }
	| { ok: false; reason: 'expired'; expiredAt: Date }
	| { ok: false; reason: 'amount_mismatch'; issued: Money; presented: Money }
	| { ok: false; reason: 'merchant_mismatch'; issued: string; presented: string };

export type StoreOptions = {
	ttlSeconds?: number;
	now?: () => Date;
	randomToken?: () => string;
};

export const DEFAULT_TTL_SECONDS = 120;

function freshToken(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return Buffer.from(bytes).toString('base64url');
}

/**
 * Held in memory on purpose: a capability outlives one request, not one deploy.
 * The ledger is the durable record, so losing live tokens on restart is safe.
 */
export function createStore(options: StoreOptions = {}) {
	const ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
	const now = options.now ?? (() => new Date());
	const makeToken = options.randomToken ?? freshToken;

	const tokens = new Map<string, Capability>();

	function issue(input: IssueInput): Capability {
		const issuedAt = now();
		const capability: Capability = {
			token: makeToken(),
			mandateId: input.mandateId,
			reference: input.reference,
			amount: input.amount,
			merchantId: input.merchantId,
			issuedAt,
			expiresAt: new Date(issuedAt.getTime() + ttlSeconds * 1000),
			usedAt: null
		};
		tokens.set(capability.token, capability);
		return { ...capability };
	}

	function consume(token: string, expected: Expected, at: Date = now()): ConsumeResult {
		const capability = tokens.get(token);
		if (!capability) return { ok: false, reason: 'unknown_token' };
		if (capability.usedAt) return { ok: false, reason: 'already_used', usedAt: capability.usedAt };

		// Burn before any other check, so a wrong amount cannot leave it usable.
		capability.usedAt = at;

		if (at.getTime() > capability.expiresAt.getTime()) {
			return { ok: false, reason: 'expired', expiredAt: capability.expiresAt };
		}
		if (compareMoney(expected.amount, capability.amount) !== 0) {
			return {
				ok: false,
				reason: 'amount_mismatch',
				issued: capability.amount,
				presented: expected.amount
			};
		}
		if (expected.merchantId !== capability.merchantId) {
			return {
				ok: false,
				reason: 'merchant_mismatch',
				issued: capability.merchantId,
				presented: expected.merchantId
			};
		}

		return { ok: true, capability: { ...capability } };
	}

	function revokeMandate(mandateId: string, at: Date = now()): number {
		let killed = 0;
		for (const capability of tokens.values()) {
			if (capability.mandateId !== mandateId || capability.usedAt) continue;
			capability.usedAt = at;
			killed += 1;
		}
		return killed;
	}

	return { issue, consume, revokeMandate };
}

export type CapabilityStore = ReturnType<typeof createStore>;
