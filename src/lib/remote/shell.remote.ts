import { query } from '$app/server';
import { app } from '#lib/server/app';

/**
 * The shell needs one fact from the server: is this a recorded run or a live
 * one. It lives here so the header badge cannot be forgotten by a page.
 */
export const getShell = query(async () => {
	const deps = await app();
	return { demoMode: deps.config.demoMode };
});
