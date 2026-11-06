export type RunnerEnv = {
	baseUrl: string;
	agentId: string;
	modelApiKey: string | null;
	modelName: string;
	modelBaseUrl: string;
};

export class RunnerCredentialError extends Error {
	constructor(names: string[]) {
		super(
			`The runner is holding PayPal credentials (${names.join(', ')}). It must never get one: the whole claim is that the agent cannot pay on its own.`
		);
		this.name = 'RunnerCredentialError';
	}
}

/**
 * The enforcement point for the project's central claim. Pure, so a test can
 * prove it refuses without spawning a process.
 */
export function validateRunnerEnv(source: Record<string, string | undefined>): RunnerEnv {
	const leaked = Object.keys(source).filter(
		(name) => name.startsWith('PAYPAL_') && Boolean(source[name])
	);
	if (leaked.length > 0) throw new RunnerCredentialError(leaked);

	const baseUrl = source.MANDATE_BASE_URL;
	if (!baseUrl) throw new Error('MANDATE_BASE_URL is not set, so the agent has nowhere to ask');

	return {
		baseUrl,
		agentId: source.AGENT_ID ?? 'coffee-runner',
		modelApiKey: source.MODEL_API_KEY || null,
		modelName: source.MODEL_NAME ?? 'deepseek-flash',
		modelBaseUrl: source.MODEL_BASE_URL ?? 'https://api.deepseek.com'
	};
}

/** What the runner is allowed to see, printed so the claim is visible on camera. */
export function visibleEnvSummary(source: Record<string, string | undefined>): string[] {
	return Object.keys(source)
		.filter((name) => !name.startsWith('PAYPAL_'))
		.sort();
}
