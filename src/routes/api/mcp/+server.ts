import type { RequestHandler } from './$types';
import { mcp } from '#lib/server/mcp';

/**
 * The MCP endpoint. Streamable HTTP, so any MCP client connects by URL with no
 * package to install, and the transport answers only on `/api/mcp`.
 */
const handle: RequestHandler = async ({ request }) => {
	const transport = await mcp();
	// The origin is read from the request SvelteKit received, so nothing is hardcoded.
	const response = await transport.respond(request, { origin: new URL(request.url).origin });
	return response ?? new Response('Not found', { status: 404 });
};

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
export const OPTIONS = handle;
