import type { Money } from '../money';

/**
 * Everything the money path needs to know about the outside world, passed in
 * rather than read from `process.env`, so the path can be driven by a replay
 * client in tests and in the no-keys preview.
 */
export type Config = {
	paypalEnvironment: 'sandbox' | 'live';
	paypalClientId: string;
	paypalClientSecret: string;
	paypalWebhookId: string | null;
	/** The demo store, as both the agent's handle and PayPal's merchant id. */
	storeSlug: string;
	storeMerchantId: string;
	testCard: {
		name: string;
		number: string;
		/** YYYY-MM. */
		expiry: string;
		securityCode: string;
	};
	capabilityTtlSeconds: number;
	mandateBaseUrl: string;
	modelName: string;
	/** Any OpenAI-compatible endpoint. DeepSeek and OpenAI both fit unchanged. */
	modelBaseUrl: string;
	modelApiKey: string | null;
	demoMode: 'live' | 'replay';
};

export type EnvSource = Record<string, string | undefined>;

export class MissingConfigError extends Error {
	constructor(name: string) {
		super(`${name} is not set`);
		this.name = 'MissingConfigError';
	}
}

function required(source: EnvSource, name: string): string {
	const value = source[name];
	if (!value) throw new MissingConfigError(name);
	return value;
}

export function loadConfig(source: EnvSource = process.env): Config {
	const demoMode = source.DEMO_MODE === 'replay' ? 'replay' : 'live';

	// A replay needs no credentials at all, which is the whole point of it.
	if (demoMode === 'replay') {
		return {
			paypalEnvironment: 'sandbox',
			paypalClientId: '',
			paypalClientSecret: '',
			paypalWebhookId: null,
			storeSlug: source.STORE_SLUG ?? 'demo-store',
			storeMerchantId: source.STORE_MERCHANT_ID ?? '8NJ2CK2C6DN3S',
			testCard: { name: 'Replay', number: '', expiry: '', securityCode: '' },
			capabilityTtlSeconds: Number(source.CAPABILITY_TTL_SECONDS ?? 120),
			mandateBaseUrl: source.MANDATE_BASE_URL ?? 'http://localhost:5173',
			modelName: 'replay',
			modelBaseUrl: 'https://api.deepseek.com',
			modelApiKey: null,
			demoMode
		};
	}

	const environment = source.PAYPAL_ENVIRONMENT === 'live' ? 'live' : 'sandbox';

	return {
		paypalEnvironment: environment,
		paypalClientId: required(source, 'PAYPAL_CLIENT_ID'),
		paypalClientSecret: required(source, 'PAYPAL_CLIENT_SECRET'),
		paypalWebhookId: source.PAYPAL_WEBHOOK_ID || null,
		storeSlug: source.STORE_SLUG ?? 'demo-store',
		storeMerchantId: required(source, 'STORE_MERCHANT_ID'),
		testCard: {
			name: source.TEST_CARD_NAME ?? 'Inkan Demo',
			number: required(source, 'TEST_CARD_NUMBER'),
			expiry: required(source, 'TEST_CARD_EXPIRY'),
			securityCode: required(source, 'TEST_CARD_CVV')
		},
		capabilityTtlSeconds: Number(source.CAPABILITY_TTL_SECONDS ?? 120),
		mandateBaseUrl: source.MANDATE_BASE_URL ?? 'http://localhost:5173',
		modelName: source.MODEL_NAME ?? 'deepseek-flash',
		modelBaseUrl: source.MODEL_BASE_URL ?? 'https://api.deepseek.com',
		modelApiKey: source.MODEL_API_KEY || null,
		demoMode
	};
}

/** The one place a store handle becomes a merchant the policy engine may trust. */
export function merchantIdFor(config: Config, slug: string): string | null {
	return slug === config.storeSlug ? config.storeMerchantId : null;
}
