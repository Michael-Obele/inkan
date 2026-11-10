import { beforeEach, describe, expect, it } from 'vitest';
import { build } from './mcp';
import { createStore } from './capability';
import { createMemoryStore } from './store.memory';
import { loadConfig } from './config';
import { money } from '../money';
import { currentMandate } from './seed';
import { toLedgerInsert, type Store } from './store';
import type { PayPalClient } from './paypal/client';
import type { SpendDeps } from './spend';

const PAYEE = '8NJ2CK2C6DN3S';
/** Reserved by RFC 2606, so it can never resolve and no test can reach a real host. */
const ORIGIN = 'https://inkan.test';

/** Nothing in these tests should reach PayPal. If it does, the test says so. */
function unusedPayPal(): PayPalClient {
	const used = (name: string) => async () => {
		throw new Error(`PayPal should not be called in this test (${name})`);
	};
	return {
		createBareOrder: used('createBareOrder'),
		getOrder: used('getOrder'),
		confirmPaymentSource: used('confirmPaymentSource'),
		authorizeOrder: used('authorizeOrder'),
		captureAuthorization: used('captureAuthorization'),
		voidAuthorization: used('voidAuthorization'),
		refundCapture: used('refundCapture'),
		listDisputes: used('listDisputes'),
		verifyWebhook: used('verifyWebhook')
	} as PayPalClient;
}

type Json = Record<string, unknown>;

/** Reads the single `data:` line the transport writes for a request. */
function dataOf(body: string): Json {
	const line = body
		.split('\n')
		.map((row) => row.trim())
		.filter((row) => row.startsWith('data:'))
		.at(-1);
	if (!line) throw new Error(`no data line in: ${body.slice(0, 200)}`);
	return JSON.parse(line.slice('data:'.length).trim()) as Json;
}

/** The text payload a tool returned, parsed back from its JSON string. */
function payloadOf(answer: Json): Json {
	const result = answer.result as { content: { type: string; text: string }[] };
	return JSON.parse(result.content[0].text) as Json;
}

describe('the MCP surface', () => {
	let store: Store;
	let deps: SpendDeps;
	let transport: ReturnType<typeof build>;
	let session: string;
	let handshake: Json;

	async function call(body: Json, sessionId?: string) {
		const url = new URL('/api/mcp', ORIGIN);
		const response = await transport.respond(
			new Request(url, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					accept: 'application/json, text/event-stream',
					...(sessionId ? { 'mcp-session-id': sessionId } : {})
				},
				body: JSON.stringify(body)
			}),
			// The endpoint passes the origin it received, and this is that to the letter.
			{ origin: url.origin }
		);
		if (!response) throw new Error('the transport did not answer');
		return { response, answer: dataOf(await response.text()) };
	}

	beforeEach(async () => {
		store = createMemoryStore();
		// No MANDATE_BASE_URL on purpose: the only origin a reply may use is the request's.
		const config = {
			...loadConfig({ DEMO_MODE: 'replay', STORE_MERCHANT_ID: PAYEE }),
			demoMode: 'live' as const
		};
		deps = {
			store,
			paypal: unusedPayPal(),
			capabilities: createStore({ ttlSeconds: 120 }),
			config
		};
		transport = build(deps);

		// The app seeds the one allowance on first read, so the tests start there too.
		await currentMandate(store, config);

		// Every test starts inside a real session, so no test has to open its own.
		const { response, answer } = await call({
			jsonrpc: '2.0',
			id: 1,
			method: 'initialize',
			params: {
				protocolVersion: '2025-06-18',
				capabilities: {},
				clientInfo: { name: 'test', version: '0' }
			}
		});

		session = response.headers.get('mcp-session-id') ?? '';
		handshake = answer.result as Json;
	});

	it('opens a session and names itself', () => {
		expect(session).not.toBe('');
		expect(handshake).toMatchObject({ serverInfo: { name: 'inkan' } });
	});

	it('lists exactly the three tools the agent needs, and no spending power', async () => {
		const { answer } = await call({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, session);
		const tools = (answer.result as { tools: { name: string }[] }).tools.map((tool) => tool.name);

		expect(tools).toEqual(['get_allowance', 'request_purchase', 'read_ledger']);
	});

	it('offers the shop inside the allowance read, so the agent can price without guessing', async () => {
		const { answer } = await call(
			{
				jsonrpc: '2.0',
				id: 3,
				method: 'tools/call',
				params: { name: 'get_allowance', arguments: {} }
			},
			session
		);
		const allowance = payloadOf(answer);

		expect(allowance.items).toHaveLength(3);
		expect(allowance.remaining).toBe('$120.00');
		expect(allowance.onePurchaseUpTo).toBe('$50.00');
		expect(allowance.youCannot).toContain('issue an allowance, or widen one');
	});

	it('refuses the bundle and says the amount is what stopped it, with no card link', async () => {
		const { answer } = await call(
			{
				jsonrpc: '2.0',
				id: 4,
				method: 'tools/call',
				params: { name: 'request_purchase', arguments: { item: 'wholesale-bundle' } }
			},
			session
		);
		const refusal = payloadOf(answer);

		expect(refusal).toMatchObject({
			outcome: 'refused',
			rule: 'over_per_txn_cap',
			mostYouMayAskFor: '$50.00',
			// A refused request has nothing to approve, so it must not hand out a card.
			approveUrl: null
		});
		expect(refusal.issueANewAllowanceAt).toContain('/allowance/new');
	});

	it('asks the person for a repeat charge and gives them the card', async () => {
		const { answer } = await call(
			{
				jsonrpc: '2.0',
				id: 5,
				method: 'tools/call',
				params: { name: 'request_purchase', arguments: { item: 'subscription' } }
			},
			session
		);
		const pending = payloadOf(answer);

		expect(pending).toMatchObject({ outcome: 'waiting for a person', rule: 'needs_human' });
		expect(String(pending.approveUrl).startsWith(`${ORIGIN}/approve/`)).toBe(true);
	});

	it('reads the ledger newest first, which is the only order a reader can use', async () => {
		const mandate = await store.findNewestMandate('demo-human');
		if (!mandate) throw new Error('no mandate');

		for (const [index, kind] of (['requested', 'denied', 'requested'] as const).entries()) {
			await store.appendLedger(
				toLedgerInsert({
					spendRequestId: null,
					mandateId: mandate.id,
					kind,
					amount: money(100 * (index + 1)),
					merchantId: PAYEE,
					paypalId: null,
					externalId: null,
					payload: { index },
					occurredAt: new Date(2026, 10, 10, 10, index)
				})
			);
		}

		const { answer } = await call(
			{
				jsonrpc: '2.0',
				id: 6,
				method: 'tools/call',
				params: { name: 'read_ledger', arguments: { limit: 3 } }
			},
			session
		);
		const rows = (payloadOf(answer).rows as { amount: string }[]).map((row) => row.amount);

		expect(rows).toEqual(['$3.00', '$2.00', '$1.00']);
	});
});
