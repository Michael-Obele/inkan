import {
	PayPalError,
	type Captured,
	type CreatedOrder,
	type DisputeRecord,
	type OrderView,
	type PayPalClient,
	type Refunded
} from './client';

/**
 * A recording of one real run, in order. The preview replays these bytes rather
 * than showing hand-written fixtures, so what a judge sees is what the sandbox
 * actually returned.
 */
export type TapeEntry =
	| { step: string; ok: true; value: unknown }
	| { step: string; ok: false; status: number; body: string };

export type Tape = {
	recordedAt: string;
	entries: TapeEntry[];
};

export class TapeExhaustedError extends Error {
	constructor(step: string) {
		super(`the recording has no response left for ${step}`);
		this.name = 'TapeExhaustedError';
	}
}

export class TapeMismatchError extends Error {
	constructor(expected: string, actual: string) {
		super(`the recording expected ${expected} next, but the app asked for ${actual}`);
		this.name = 'TapeMismatchError';
	}
}

/** Wraps a live client and appends every answer, so recording is not a second job. */
export function recordClient(inner: PayPalClient, onFinish: (tape: Tape) => void): PayPalClient {
	const entries: TapeEntry[] = [];
	const recordedAt = new Date().toISOString();

	async function wrap<T>(step: string, run: () => Promise<T>): Promise<T> {
		try {
			const value = await run();
			entries.push({ step, ok: true, value });
			// Flushed after every step, so a run that dies midway still leaves a tape.
			onFinish({ recordedAt, entries });
			return value;
		} catch (error) {
			if (error instanceof PayPalError) {
				entries.push({ step, ok: false, status: error.status, body: error.body });
				onFinish({ recordedAt, entries });
			}
			throw error;
		}
	}

	return {
		createBareOrder: (input) => wrap('createBareOrder', () => inner.createBareOrder(input)),
		getOrder: (orderId) => wrap('getOrder', () => inner.getOrder(orderId)),
		confirmPaymentSource: (input) =>
			wrap('confirmPaymentSource', () => inner.confirmPaymentSource(input)),
		authorizeOrder: (input) => wrap('authorizeOrder', () => inner.authorizeOrder(input)),
		captureAuthorization: (input) =>
			wrap('captureAuthorization', () => inner.captureAuthorization(input)),
		voidAuthorization: (input) => wrap('voidAuthorization', () => inner.voidAuthorization(input)),
		refundCapture: (input) => wrap('refundCapture', () => inner.refundCapture(input)),
		listDisputes: () => wrap('listDisputes', () => inner.listDisputes()),
		verifyWebhook: (input) => wrap('verifyWebhook', () => inner.verifyWebhook(input))
	};
}

/**
 * Serves one recording. Calls must arrive in the recorded order, which catches
 * a preview that has drifted from the real path instead of hiding the drift.
 */
export function createReplayClient(tape: Tape): PayPalClient {
	let cursor = 0;

	function next<T>(step: string): T {
		const entry = tape.entries[cursor];
		if (!entry) throw new TapeExhaustedError(step);
		if (entry.step !== step) throw new TapeMismatchError(entry.step, step);
		cursor += 1;
		if (!entry.ok) throw new PayPalError(entry.step, entry.status, entry.body);
		return structuredClone(entry.value) as T;
	}

	return {
		createBareOrder: async () => next<CreatedOrder>('createBareOrder'),
		getOrder: async () => next<OrderView>('getOrder'),
		confirmPaymentSource: async () => next<OrderView>('confirmPaymentSource'),
		authorizeOrder: async () => next<OrderView>('authorizeOrder'),
		captureAuthorization: async () => next<Captured>('captureAuthorization'),
		voidAuthorization: async () => {
			next<null>('voidAuthorization');
		},
		refundCapture: async () => next<Refunded>('refundCapture'),
		listDisputes: async () => next<DisputeRecord[]>('listDisputes'),
		verifyWebhook: async () => next<{ verified: boolean; reason?: string }>('verifyWebhook')
	};
}

/** A tape that has not been recorded yet still has to answer something honest. */
export function emptyTape(): Tape {
	return { recordedAt: new Date(0).toISOString(), entries: [] };
}

export function isReplayable(tape: Tape): boolean {
	return tape.entries.length > 0;
}

export const REPLAY_NOTICE = 'Replay of a recorded sandbox run. No live payment is made.';
