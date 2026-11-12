import * as v from 'valibot';
import { McpServer } from 'tmcp';
import { ValibotJsonSchemaAdapter } from '@tmcp/adapter-valibot';
import { HttpTransport } from '@tmcp/transport-http';
import { formatMoney, type Money } from '../money';
import { app } from './app';
import { CATALOG } from './catalog';
import { currentMandate } from './seed';
import { requestPayment, type SpendDeps } from './spend';

/**
 * The socket an agent plugs into. Three tools, and none of them can change an
 * allowance: an agent that could widen its own ceiling would make the whole
 * claim false. Read, ask, and look at what happened.
 */
const SERVER = {
	name: 'inkan',
	version: '1.0.0',
	description:
		'Spending permission for an AI agent. It can read its allowance, ask to buy, and read the ledger. It cannot pay on its own, widen an allowance, or refund.'
};

function show(value: Money | null | undefined): string | null {
	return value ? formatMoney(value) : null;
}

function isoDay(date: Date): string {
	return date.toISOString().slice(0, 10);
}

/** Per-request facts the tools need. The origin comes from the request, never a constant. */
export type McpContext = { origin: string };

/** Built from explicit dependencies, so a test drives the same tools with no server. */
export function build(deps: SpendDeps) {
	const server = new McpServer(SERVER, {
		adapter: new ValibotJsonSchemaAdapter(),
		capabilities: { tools: { listChanged: false } }
	}).withContext<McpContext>();

	server.tool(
		{
			name: 'get_allowance',
			title: 'Read the allowance',
			description:
				'Read the allowance that governs you: what it is for, how much is left, the largest single purchase it covers, and the items this shop sells. Call this before asking for anything. Only the person can change an allowance, never you.',
			annotations: { readOnlyHint: true, openWorldHint: false }
		},
		async () => {
			const mandate = await currentMandate(deps.store, deps.config);
			const captured = await deps.store.sumCaptured(mandate.id);
			const refunded = await deps.store.sumRefunded(mandate.id);
			const spent = captured.cents - refunded.cents;
			// A stopped or expired allowance has nothing left to spend. Reporting the
			// arithmetic as money available would invite an agent to keep asking.
			const open = mandate.status === 'active' && mandate.expiresAt.getTime() > Date.now();
			const remaining = open ? Math.max(0, mandate.ceilingCents - spent) : 0;

			const payload = {
				purpose: mandate.purpose,
				status: mandate.status,
				ceiling: show({ cents: mandate.ceilingCents, currency: mandate.ceilingCurrency }),
				spent: show({ cents: spent, currency: mandate.ceilingCurrency }),
				remaining: show({ cents: remaining, currency: mandate.ceilingCurrency }),
				onePurchaseUpTo: show({
					cents: open ? Math.min(remaining, mandate.perTransactionCapCents) : 0,
					currency: mandate.perTransactionCapCurrency
				}),
				goesThroughWithoutAsking: show({
					cents: open ? mandate.autoApproveAmountCents : 0,
					currency: mandate.autoApproveAmountCurrency
				}),
				coversCategories: mandate.allowedCategories,
				expires: isoDay(mandate.expiresAt),
				shop: deps.config.storeSlug,
				items: CATALOG.map((item) => ({
					id: item.id,
					name: item.name,
					price: formatMoney({ cents: item.amountCents, currency: 'USD' }),
					recurring: item.recurring
				})),
				youCannot: [
					'issue an allowance, or widen one',
					'pay for anything without asking',
					'refund a payment'
				]
			};

			return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
		}
	);

	server.tool(
		{
			name: 'request_purchase',
			title: 'Ask to buy one item',
			description:
				'Ask for permission to buy one item from the shop. You never send a price: the shop price for that item is the one used, so you cannot invent an amount or ask for a different one. The answer is paid, waiting for a person, or refused, and it always says what to do next, including the largest amount that would pass when the amount was the problem.',
			annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
			schema: v.object({
				item: v.pipe(
					v.string(),
					v.description('The id of an item from get_allowance, for example house-blend.')
				),
				reason: v.optional(
					v.pipe(
						v.string(),
						v.maxLength(280),
						v.description(
							'Why you want it, in your own words. Stored as you wrote it and read by the person. It never sets a price.'
						)
					)
				)
			})
		},
		async ({ item, reason }) => {
			const chosen = CATALOG.find((entry) => entry.id === item);
			if (!chosen) {
				return {
					isError: true,
					content: [
						{
							type: 'text',
							text: `There is no item called ${item}. Call get_allowance for the ids this shop sells.`
						}
					]
				};
			}

			const mandate = await currentMandate(deps.store, deps.config);

			// SvelteKit gives the endpoint the real request URL, so a link the agent hands
			// to a person works on localhost, behind a tunnel, or on a deployment.
			const origin = server.ctx.custom?.origin ?? deps.config.mandateBaseUrl;
			const scoped: SpendDeps = { ...deps, config: { ...deps.config, mandateBaseUrl: origin } };

			try {
				const result = await requestPayment(scoped, {
					mandateId: mandate.id,
					agentId: mandate.agentId,
					request: reason?.trim()
						? `${reason.trim()} (${chosen.name})`
						: `Buy ${chosen.name} from ${chosen.merchantSlug}`,
					amount: { cents: chosen.amountCents, currency: 'USD' },
					merchantSlug: chosen.merchantSlug,
					category: chosen.category,
					recurring: chosen.recurring
				});

				const payload = {
					requestId: result.requestId,
					// "paid" is a claim about money, so it needs the capture id that proves it.
					outcome:
						result.status === 'captured' && result.captureId
							? 'paid'
							: result.status === 'pending'
								? 'waiting for a person'
								: result.verdict === 'deny'
									? 'refused'
									: result.status === 'allowed'
										? 'allowed, not charged in this recording'
										: 'did not complete',
					item: chosen.name,
					price: formatMoney({ cents: chosen.amountCents, currency: 'USD' }),
					rule: result.rule,
					reason: result.reason,
					next: result.advice.next,
					mostYouMayAskFor: show(result.advice.mostAllowed),
					approveUrl: result.advice.approveUrl,
					issueANewAllowanceAt: result.advice.newAllowanceUrl,
					captureId: result.captureId ?? null
				};

				return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
			} catch (cause) {
				return {
					isError: true,
					content: [
						{
							type: 'text',
							text: `The service refused the request before deciding it: ${cause instanceof Error ? cause.message : String(cause)}. Tell the person rather than trying again.`
						}
					]
				};
			}
		}
	);

	server.tool(
		{
			name: 'read_ledger',
			title: 'Read the ledger',
			description:
				'Read the most recent rows of the append-only ledger: every attempt, the refused ones included, with the rule that decided it. Use it to see what already happened, so you do not ask twice.',
			annotations: { readOnlyHint: true, openWorldHint: false },
			schema: v.object({
				limit: v.optional(
					v.pipe(
						v.number(),
						v.integer(),
						v.minValue(1),
						v.maxValue(25),
						v.description('How many rows, newest first. Defaults to 10.')
					),
					10
				)
			})
		},
		async ({ limit }) => {
			const mandate = await currentMandate(deps.store, deps.config);
			const rows = await deps.store.listLedger(mandate.id);

			const payload = {
				rows: rows.slice(0, limit).map((row) => ({
					kind: row.kind,
					amount: formatMoney({
						cents: row.amountCents,
						currency: row.amountCurrency ?? 'USD'
					}),
					at: row.occurredAt.toISOString(),
					requestId: row.spendRequestId,
					paypalId: row.paypalId
				}))
			};

			return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
		}
	);

	return new HttpTransport(server, {
		path: '/api/mcp',
		cors: true
	});
}

let transport: ReturnType<typeof build> | null = null;

/** One transport per process, so a client keeps its session across requests. */
export async function mcp(): Promise<ReturnType<typeof build>> {
	if (!transport) transport = build(await app());
	return transport;
}
