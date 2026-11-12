import type { RequestHandler } from './$types';
import { app } from '#lib/server/app';
import { handleWebhook, webhookHeaders } from '#lib/server/paypal/webhooks';
import { failure, message, ok } from '#lib/server/http';

/**
 * PayPal delivers here. The signature is checked before anything is believed,
 * and a duplicate delivery is acknowledged without a second ledger row.
 */
export const POST: RequestHandler = async ({ request }) => {
	const rawBody = await request.text();

	try {
		const deps = await app();

		// A recording has no live PayPal to verify against, so it says so instead of
		// failing deep inside the tape and looking like a broken receiver.
		if (deps.config.demoMode === 'replay') {
			return failure(503, 'this run is a recording, so no live webhook can be verified');
		}

		const outcome = await handleWebhook(
			{ store: deps.store, paypal: deps.paypal },
			webhookHeaders(request.headers),
			rawBody
		);

		// A rejected signature is a 400 so PayPal stops retrying a forged call.
		if (!outcome.accepted) return failure(400, outcome.reason);
		return ok({ kind: outcome.kind, duplicate: outcome.duplicate });
	} catch (error) {
		return failure(500, message(error));
	}
};
