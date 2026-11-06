import { json } from '@sveltejs/kit';

/** One shape for every refusal, so a caller never has to guess what went wrong. */
export function failure(status: number, error: string, detail?: unknown) {
	return json({ ok: false, error, detail }, { status });
}

export function ok(body: Record<string, unknown>) {
	return json({ ok: true, ...body });
}

export async function readJson(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		return null;
	}
}

export function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
