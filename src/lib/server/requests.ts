import { createHash } from 'node:crypto';
import type { Money } from '../money';

export type RequestStatus =
	'pending' | 'allowed' | 'denied' | 'expired' | 'captured' | 'failed' | 'refunded';

/**
 * Which moves are legal. Anything absent is a bug, not a decision, so the
 * lifecycle throws instead of quietly allowing it.
 */
const TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
	pending: ['allowed', 'denied', 'expired'],
	allowed: ['captured', 'failed', 'expired'],
	denied: [],
	expired: [],
	failed: ['allowed'],
	captured: ['refunded'],
	refunded: []
};

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
	return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: RequestStatus, to: RequestStatus): void {
	if (!canTransition(from, to)) {
		throw new Error(`cannot move a request from ${from} to ${to}`);
	}
}

export function isTerminal(status: RequestStatus): boolean {
	return TRANSITIONS[status].length === 0;
}

export type IdempotencyInput = {
	mandateId: string;
	agentId: string;
	rawRequest: string;
	amount: Money;
	merchantId: string;
};

/**
 * Derived only from facts known before the model runs. Anything the model
 * produces would make the same request able to hash two ways, and a retry would
 * become a second payment.
 *
 * Whitespace is collapsed because trailing spaces are not a different purchase.
 */
export function idempotencyKey(input: IdempotencyInput): string {
	const canonical = [
		input.mandateId,
		input.agentId,
		input.rawRequest.trim().replace(/\s+/g, ' '),
		String(input.amount.cents),
		input.amount.currency,
		input.merchantId
	].join('\u0000');

	return createHash('sha256').update(canonical).digest('hex');
}

/** Committed spend is captured minus refunded, so a refund does not re-open budget. */
export function committedSpendCents(capturedCents: number, refundedCents: number): number {
	return capturedCents - refundedCents;
}
