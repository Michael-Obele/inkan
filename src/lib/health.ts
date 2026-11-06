/**
 * The health payload. Pure, so a test can pin it without a running server.
 */
export function healthPayload(now: Date): { ok: true; service: string; now: string } {
	return { ok: true, service: 'inkan', now: now.toISOString() };
}
