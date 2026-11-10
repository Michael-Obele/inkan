import type { RequestHandler } from './$types';
import { mcp } from '#lib/server/mcp';

/**
 * The MCP endpoint. Streamable HTTP, so any MCP client connects by URL with no
 * package to install, and the transport answers only on `/api/mcp`.
 */
const handle: RequestHandler = async ({ request }) => {
	const transport = await mcp();
	const response = await transport.respond(request);
	return response ?? new Response('Not found', { status: 404 });
};

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
export const OPTIONS = handle;
