import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { healthPayload } from '#lib/health';

export const GET: RequestHandler = () => json(healthPayload(new Date()));
