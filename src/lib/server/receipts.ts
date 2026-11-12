import type { Config } from './config';
import { amountOf, type Store } from './store';

/**
 * The receipt is the only place a model's words reach a person, so it is the
 * only place that can fail softly. When there is no key, or the call fails, a
 * template writes the same facts instead, and the model name says so.
 */
export type ReceiptInput = {
	spendRequestId: string;
};

export type ReceiptText = {
	text: string;
	model: string;
};

type Facts = {
	merchantEmail: string | null;
	amount: string;
	reason: string;
	recurring: boolean;
	decidingRule: string | null;
	status: string;
	monthly: string | null;
};

const SYSTEM = [
	'You write one short receipt for a purchase an AI agent made.',
	'Use plain everyday words. No em dashes. Two sentences at most.',
	'The facts already say whether it went through, so do not restate the outcome and do not repeat the reason word for word.',
	'State what was bought, who was paid, how much, and one thing a person would want to know.',
	'Never invent a product, a price or a merchant that is not in the facts.',
	'Do not use the words mandate, capability, policy engine or ledger.'
].join(' ');

export async function writeReceipt(
	deps: { store: Store; config: Config; fetchImpl?: typeof fetch },
	input: ReceiptInput
): Promise<ReceiptText> {
	const request = await deps.store.getRequest(input.spendRequestId);
	if (!request) throw new Error(`no spend request ${input.spendRequestId}`);

	const amount = amountOf(request);
	const existing = await deps.store.getReceipt(input.spendRequestId);
	if (existing) return { text: existing.text, model: existing.model };

	const facts: Facts = {
		merchantEmail: request.merchantEmail,
		amount: format(amount.cents, amount.currency),
		reason: request.reason ?? 'It matched what the mandate allows.',
		recurring: Boolean(request.intent?.recurring),
		decidingRule: request.decidingRule,
		status: request.status,
		monthly: request.intent?.recurring ? formatMonthly(amount.cents, amount.currency) : null
	};

	const wanted = Boolean(deps.config.modelApiKey);
	// A reasoning model spends tokens thinking before it writes, so a tight cap returns
	// empty content. The budget has to cover the reasoning and the answer.
	const asked = wanted
		? await ask(deps.config, facts, deps.fetchImpl ?? fetch).catch(() => null)
		: null;

	// The author is whichever thing actually wrote the words. Labelling a template
	// fallback with the model's name would make the record claim something untrue.
	const stored = await deps.store.writeReceipt({
		spendRequestId: input.spendRequestId,
		text: asked ?? template(facts),
		model: asked ? deps.config.modelName : 'template'
	});
	return { text: stored.text, model: stored.model };
}

async function ask(config: Config, facts: Facts, fetchImpl: typeof fetch): Promise<string> {
	const res = await fetchImpl(`${config.modelBaseUrl.replace(/\/$/, '')}/chat/completions`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${config.modelApiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			model: config.modelName,
			// Enough for a reasoning pass plus two short sentences. At 120 this model
			// returned empty content on every call, because the reasoning used the whole
			// budget, and the receipt silently fell back to a template.
			max_tokens: 600,
			temperature: 0.2,
			messages: [
				{ role: 'system', content: SYSTEM },
				{ role: 'user', content: JSON.stringify(facts) }
			]
		})
	});

	if (!res.ok) throw new Error(`model refused with ${res.status}`);
	const parsed = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
	const text = parsed.choices?.[0]?.message?.content?.trim();
	if (!text) throw new Error('model returned nothing');
	return text;
}

/** The fallback says the same facts in the same number of words. */
export function template(facts: Facts): string {
	const who = facts.merchantEmail ?? 'the shop';

	if (facts.status === 'denied') {
		return `${facts.amount} to ${who} was refused. Reason: ${facts.reason}`;
	}

	// A repeat charge leads with the monthly cost, because that is the fact a person
	// would otherwise have to work out for themselves.
	if (facts.status === 'captured' && facts.recurring && facts.monthly) {
		return `${facts.amount} to ${who}, which is about ${facts.monthly} a month. It went through.`;
	}

	if (facts.status === 'captured') return `${facts.amount} to ${who}. It went through.`;

	return `${facts.amount} to ${who} is waiting for you. Nothing has been charged.`;
}

function format(cents: number, currency: string): string {
	const symbol = currency === 'USD' ? '$' : `${currency} `;
	return `${symbol}${(cents / 100).toFixed(2)}`;
}

function formatMonthly(cents: number, currency: string): string {
	return format(cents, currency);
}
