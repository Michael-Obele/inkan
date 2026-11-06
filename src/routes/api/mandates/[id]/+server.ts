import type { RequestHandler } from './$types';
import { app } from '#lib/server/app';
import { changeMandate, MandateChangeError } from '#lib/server/mandate-actions';
import { parseMandateChange } from '#lib/server/payloads';
import { failure, message, ok, readJson } from '#lib/server/http';

/**
 * The REST door to narrowing and revoking. All of the rule enforcement lives in
 * `mandate-actions.ts`, which the remote functions call too.
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	const parsed = parseMandateChange(await readJson(request));
	if (!parsed.ok) return failure(400, 'invalid mandate change', parsed.issues);

	try {
		const deps = await app();
		const result = await changeMandate(deps, params.id, parsed.value);
		return ok({ mandate: result.mandate, liveCapabilitiesKilled: result.liveCapabilitiesKilled });
	} catch (error) {
		if (error instanceof MandateChangeError) return failure(error.status, error.message);
		return failure(422, message(error));
	}
};
