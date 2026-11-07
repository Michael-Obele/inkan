import type { RequestHandler } from './$types';
import { app } from '#lib/server/app';
import { failure, message, ok } from '#lib/server/http';
import { currentMandate } from '#lib/server/seed';

/** The read model behind the ledger screen: rows, requests and their receipts. */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const deps = await app();
		const current = await currentMandate(deps.store, deps.config);
		const mandateId = url.searchParams.get('mandateId') ?? current.id;

		const mandate = await deps.store.getMandate(mandateId);
		if (!mandate) return failure(404, 'no such mandate');

		const ledger = await deps.store.listLedger(mandateId);
		const requests = await deps.store.listRequests(mandateId);

		const receipts = await Promise.all(
			requests.map(async (row) => ({
				requestId: row.id,
				receipt: await deps.store.getReceipt(row.id)
			}))
		);

		return ok({
			mandate,
			ledger,
			requests,
			receipts,
			captured: await deps.store.sumCaptured(mandateId),
			refunded: await deps.store.sumRefunded(mandateId),
			demoMode: deps.config.demoMode
		});
	} catch (error) {
		return failure(500, message(error));
	}
};
