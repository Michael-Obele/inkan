import type { RequestHandler } from './$types';
import { app } from '#lib/server/app';
import { requestPayment } from '#lib/server/spend';
import { parseRequestPayment } from '#lib/server/payloads';
import { failure, message, ok, readJson } from '#lib/server/http';

/**
 * The runner's only route to money. It names a shop handle and an amount; the
 * service turns that into a merchant id it trusts, decides, and pays.
 */
export const POST: RequestHandler = async ({ request }) => {
	const parsed = parseRequestPayment(await readJson(request));
	if (!parsed.ok) return failure(400, 'invalid request payload', parsed.issues);

	try {
		const wired = await app();
		// Advice carries links back to this service, so it uses the origin the caller used.
		const deps = {
			...wired,
			config: { ...wired.config, mandateBaseUrl: new URL(request.url).origin }
		};
		const result = await requestPayment(deps, parsed.value);
		return ok({
			requestId: result.requestId,
			status: result.status,
			verdict: result.verdict,
			rule: result.rule,
			reason: result.reason,
			// What the caller can do about it, so a refusal is not a dead end.
			advice: {
				action: result.advice.action,
				next: result.advice.next,
				mostAllowed: result.advice.mostAllowed ?? null,
				approveUrl: result.advice.approveUrl ?? null,
				newAllowanceUrl: result.advice.newAllowanceUrl ?? null
			},
			captureId: result.captureId ?? null,
			captureError: result.captureError ?? null
		});
	} catch (error) {
		return failure(500, message(error));
	}
};
