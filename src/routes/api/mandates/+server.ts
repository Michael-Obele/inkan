import type { RequestHandler } from './$types';
import { app } from '#lib/server/app';
import { parseCreateMandate } from '#lib/server/payloads';
import { failure, message, ok, readJson } from '#lib/server/http';
import { DEMO_MANDATE_ID, seedMandate } from '#lib/server/seed';

export const GET: RequestHandler = async () => {
	const deps = await app();
	const created = await seedMandate(deps.store, deps.config);
	return ok({ mandate: created });
};

export const POST: RequestHandler = async ({ request }) => {
	const parsed = parseCreateMandate(await readJson(request));
	if (!parsed.ok) return failure(400, 'invalid mandate payload', parsed.issues);

	try {
		const deps = await app();
		const created = await deps.store.createMandate({
			id: DEMO_MANDATE_ID,
			ownerId: parsed.value.ownerId,
			agentId: parsed.value.agentId,
			purpose: parsed.value.purpose,
			allowedCategories: parsed.value.allowedCategories,
			ceilingCents: parsed.value.ceilingCents,
			ceilingCurrency: 'USD',
			perTransactionCapCents: parsed.value.perTransactionCapCents,
			perTransactionCapCurrency: 'USD',
			autoApproveAmountCents: parsed.value.autoApproveAmountCents,
			autoApproveAmountCurrency: 'USD',
			allowedMerchants: parsed.value.allowedMerchants,
			expiresAt: new Date(parsed.value.expiresAt)
		});
		return ok({ mandate: created });
	} catch (error) {
		return failure(500, message(error));
	}
};
