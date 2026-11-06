import type { RunnerEnv } from './env';
import type { Task } from './tasks';

export type ParsedRequest = {
	amountCents: number;
	merchantSlug: string;
	category: string;
	recurring: boolean;
	/** Says whether a model read the task, so the log never pretends otherwise. */
	by: 'model' | 'declared';
};

const SYSTEM = [
	'You turn a shopping task into a payment request.',
	'Answer with JSON only, nothing else.',
	'Fields: amountCents (integer, USD cents), merchantSlug (string), category (string), recurring (boolean).',
	'If the task does not state an amount, use null for amountCents rather than guessing.'
].join(' ');

/**
 * The agent does the reading. It never sets a limit and never decides whether
 * the payment is allowed, so a bad parse costs a refusal rather than a payment.
 */
export async function ask(env: RunnerEnv, task: Task): Promise<ParsedRequest> {
	if (!env.modelApiKey) return declared(task, 'declared');

	try {
		const res = await fetch(`${env.modelBaseUrl.replace(/\/$/, '')}/chat/completions`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.modelApiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: env.modelName,
				temperature: 0,
				max_tokens: 200,
				response_format: { type: 'json_object' },
				messages: [
					{ role: 'system', content: SYSTEM },
					{ role: 'user', content: task.say }
				]
			})
		});

		if (!res.ok) return declared(task, 'declared');

		const parsed = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
		const content = parsed.choices?.[0]?.message?.content;
		if (!content) return declared(task, 'declared');

		const model = JSON.parse(content) as {
			amountCents?: number | null;
			merchantSlug?: string;
			category?: string;
			recurring?: boolean;
		};

		const amountCents =
			typeof model.amountCents === 'number' && Number.isInteger(model.amountCents)
				? model.amountCents
				: null;

		// A missing amount is not a reason to invent one: fall back to the task's own words.
		if (amountCents === null) return declared(task, 'declared');

		return {
			amountCents,
			merchantSlug: model.merchantSlug ?? task.merchantSlug,
			category: model.category ?? task.category,
			recurring: model.recurring ?? task.recurring,
			by: 'model'
		};
	} catch {
		return declared(task, 'declared');
	}
}

function declared(task: Task, by: ParsedRequest['by']): ParsedRequest {
	return {
		amountCents: task.amountCents,
		merchantSlug: task.merchantSlug,
		category: task.category,
		recurring: task.recurring,
		by
	};
}
