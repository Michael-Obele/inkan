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
	'State what was bought, who was paid, how much, and why it was allowed or refused.',
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

	const model = deps.config.modelApiKey ? deps.config.modelName : 'template';
	const text = deps.config.modelApiKey
		? await ask(deps.config, facts, deps.fetchImpl ?? fetch).catch(() => template(facts))
		: template(facts);

	const stored = await deps.store.writeReceipt({
		spendRequestId: input.spendRequestId,
		text,
		model
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
			max_tokens: 120,
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
	const outcome =
		facts.status === 'denied'
			? 'It was refused.'
			: facts.status === 'captured'
				? 'It went through.'
				: 'It is waiting for you.';

	const why =
		facts.status === 'denied'
			? `Reason: ${facts.reason}`
			: facts.recurring
				? `This is a repeat charge of about ${facts.monthly} a month.`
				: facts.reason;

	return `${facts.amount} to ${who}. ${outcome} ${why}`;
}

function format(cents: number, currency: string): string {
	const symbol = currency === 'USD' ? '$' : `${currency} `;
	return `${symbol}${(cents / 100).toFixed(2)}`;
}

function formatMonthly(cents: number, currency: string): string {
	return format(cents, currency);
}
