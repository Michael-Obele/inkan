import { defineEnvVars } from '@sveltejs/kit/env';
import * as v from 'valibot';

/**
 * The declared surface of the service environment. The runner imports none of
 * these: it is a separate process with its own validation, which is what makes
 * "the agent holds no credential" checkable rather than a promise.
 */
export const variables = defineEnvVars({
	DATABASE_URL: { description: 'Postgres connection string on Neon.' },
	PAYPAL_ENVIRONMENT: { description: 'sandbox or live.' },
	PAYPAL_CLIENT_ID: { description: 'Sandbox or live client id. Service only.' },
	PAYPAL_CLIENT_SECRET: { description: 'Sandbox or live secret. Service only.' },
	PAYPAL_WEBHOOK_ID: { description: 'Used to verify webhook signatures.' },
	STORE_SLUG: { description: 'The handle the agent uses for the demo store.' },
	STORE_MERCHANT_ID: { description: "The store's PayPal payee.merchant_id." },
	TEST_CARD_NUMBER: { description: 'Sandbox card charged by the demo.' },
	TEST_CARD_EXPIRY: { description: 'YYYY-MM.' },
	TEST_CARD_CVV: { description: 'Sandbox CVV.' },
	TEST_CARD_NAME: { description: 'Name on the sandbox card.' },
	CAPABILITY_TTL_SECONDS: { description: 'Lifetime of a spending permission.' },
	MANDATE_BASE_URL: { description: "The runner's only address for this service." },
	MODEL_API_KEY: {
		description: 'Optional. Receipt text only.',
		schema: v.optional(v.string())
	},
	MODEL_NAME: {
		description: 'Optional. Receipt text only.',
		schema: v.optional(v.string())
	},
	MODEL_BASE_URL: {
		description: 'Optional. Any OpenAI-compatible endpoint.',
		schema: v.optional(v.string())
	},
	DEMO_MODE: { description: 'live or replay. Replay needs no keys and no database.' }
});
