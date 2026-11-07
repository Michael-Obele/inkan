import type { RequestHandler } from './$types';
import { app } from '#lib/server/app';
import { ok } from '#lib/server/http';
import { currentMandate } from '#lib/server/seed';

/** The allowance in force. Creating one is a person's action in the app, not an endpoint. */
export const GET: RequestHandler = async () => {
	const deps = await app();
	return ok({ mandate: await currentMandate(deps.store, deps.config) });
};
