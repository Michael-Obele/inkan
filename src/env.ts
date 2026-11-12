import { defineEnvVars } from '@sveltejs/kit/env';
import * as v from 'valibot';

/**
 * The declared surface of the service environment. The runner imports none of
 * these: it is a separate process with its own validation, which is what makes
 * "the agent holds no credential" checkable rather than a promise.
 *
 * Every variable is optional here on purpose. A clone with no `.env` runs the
 * recorded demo, which needs nothing at all; `loadConfig` is the one place that
 * refuses a live run when a live variable is missing. Declaring them required at
 * this layer would 500 every page before the replay could choose itself.
 */
export const variables = defineEnvVars({
	DATABASE_URL: {
		description: 'Postgres connection string on Neon. Optional: without it the app replays.',
		schema: v.optional(v.string())
	},
	PAYPAL_ENVIRONMENT: { description: 'sandbox or live.', schema: v.optional(v.string()) },
	PAYPAL_CLIENT_ID: {
		description: 'Sandbox or live client id. Service only.',
		schema: v.optional(v.string())
	},
	PAYPAL_CLIENT_SECRET: {
		description: 'Sandbox or live secret. Service only.',
		schema: v.optional(v.string())
	},
	PAYPAL_WEBHOOK_ID: {
		description: 'Used to verify webhook signatures.',
		schema: v.optional(v.string())
	},
	STORE_SLUG: {
		description: 'The handle the agent uses for the demo store.',
		schema: v.optional(v.string())
	},
	STORE_MERCHANT_ID: {
		description: "The store's PayPal payee.merchant_id.",
		schema: v.optional(v.string())
	},
	TEST_CARD_NUMBER: {
		description: 'Sandbox card charged by the demo.',
		schema: v.optional(v.string())
	},
	TEST_CARD_EXPIRY: { description: 'YYYY-MM.', schema: v.optional(v.string()) },
	TEST_CARD_CVV: { description: 'Sandbox CVV.', schema: v.optional(v.string()) },
	TEST_CARD_NAME: { description: 'Name on the sandbox card.', schema: v.optional(v.string()) },
	CAPABILITY_TTL_SECONDS: {
		description: 'Lifetime of a spending permission.',
		schema: v.optional(v.string())
	},
	MANDATE_BASE_URL: {
		description: "The runner's only address for this service.",
		schema: v.optional(v.string())
	},
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
	DEMO_MODE: {
		description: 'live or replay. Replay needs no keys and no database.',
		schema: v.optional(v.string())
	}
});
