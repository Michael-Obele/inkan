import type { RequestHandler } from './$types';
import { app } from '#lib/server/app';
import { refundFromRow, syncDisputes } from '#lib/server/refunds';
import { parseRefund } from '#lib/server/payloads';
import { failure, message, ok, readJson } from '#lib/server/http';

/** Refunds are a human action on a ledger row, never something the agent can ask for. */
export const POST: RequestHandler = async ({ request }) => {
	const parsed = parseRefund(await readJson(request));
	if (!parsed.ok) return failure(400, 'invalid refund payload', parsed.issues);

	try {
		const deps = await app();
		const result = await refundFromRow(
			{ store: deps.store, paypal: deps.paypal },
			{ ledgerEventId: parsed.value.ledgerEventId, by: 'human' }
		);

		if (!result.ok) return failure(422, result.reason, result.detail);
		return ok({ refundId: result.refundId, ledgerEventId: result.ledgerEventId });
	} catch (error) {
		return failure(500, message(error));
	}
};

/** Reads disputes from PayPal rather than inventing them. */
export const PUT: RequestHandler = async ({ url }) => {
	const mandateId = url.searchParams.get('mandateId');
	if (!mandateId) return failure(400, 'mandateId is required');

	try {
		const deps = await app();
		const result = await syncDisputes({ store: deps.store, paypal: deps.paypal }, { mandateId });
		return ok({ recorded: result.recorded });
	} catch (error) {
		return failure(502, message(error));
	}
};
