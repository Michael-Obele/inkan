import type { RequestHandler } from './$types';
import { app } from '#lib/server/app';
import { decideRequest } from '#lib/server/decisions';
import { parseDecision } from '#lib/server/payloads';
import { failure, message, ok, readJson } from '#lib/server/http';

/** The REST door to a human decision. The logic lives in `decisions.ts`. */
export const POST: RequestHandler = async ({ params, request }) => {
	const parsed = parseDecision(await readJson(request));
	if (!parsed.ok) return failure(400, 'invalid decision payload', parsed.issues);

	try {
		const deps = await app();
		const result = await decideRequest(deps, params.id, parsed.value.action);
		if (!result.ok) return failure(result.status, result.reason, result.detail);
		return ok({
			status: result.status,
			captureId: 'captureId' in result ? result.captureId : null
		});
	} catch (error) {
		return failure(500, message(error));
	}
};
