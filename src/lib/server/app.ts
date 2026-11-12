import * as env from '$app/env/private';
import type { Config } from './config';
import { loadConfig } from './config';
import { sharedCapabilities } from './spend';
import { createPayPalClient, type PayPalClient } from './paypal/client';
import { createReplayClient, emptyTape, type Tape } from './paypal/replay';
import { createPgStore } from './store.pg';
import { createMemoryStore } from './store.memory';
import { seedReplay } from './seed';
import { runScenario } from './preview';
import type { SpendDeps } from './spend';
import type { Store } from './store';
import { recordedTape } from './paypal/recorded';
import { writeReceipt } from './receipts';
import { serviceLog } from './log';

type Wiring = SpendDeps & { store: Store; config: Config; tape: Tape | null };

let wired: Wiring | null = null;

function envSource(): Record<string, string | undefined> {
	return {
		DATABASE_URL: env.DATABASE_URL,
		PAYPAL_ENVIRONMENT: env.PAYPAL_ENVIRONMENT,
		PAYPAL_CLIENT_ID: env.PAYPAL_CLIENT_ID,
		PAYPAL_CLIENT_SECRET: env.PAYPAL_CLIENT_SECRET,
		PAYPAL_WEBHOOK_ID: env.PAYPAL_WEBHOOK_ID,
		STORE_SLUG: env.STORE_SLUG,
		STORE_MERCHANT_ID: env.STORE_MERCHANT_ID,
		TEST_CARD_NUMBER: env.TEST_CARD_NUMBER,
		TEST_CARD_EXPIRY: env.TEST_CARD_EXPIRY,
		TEST_CARD_CVV: env.TEST_CARD_CVV,
		TEST_CARD_NAME: env.TEST_CARD_NAME,
		CAPABILITY_TTL_SECONDS: env.CAPABILITY_TTL_SECONDS,
		MANDATE_BASE_URL: env.MANDATE_BASE_URL,
		MODEL_API_KEY: env.MODEL_API_KEY,
		MODEL_NAME: env.MODEL_NAME,
		MODEL_BASE_URL: env.MODEL_BASE_URL,
		DEMO_MODE: env.DEMO_MODE
	};
}

/**
 * Built once per process. Replay mode touches no database and no network, which
 * is what lets a judge see the whole story without a key or a connection.
 */
export async function app(): Promise<Wiring> {
	if (wired) return wired;

	const config = loadConfig(envSource());
	const tape = config.demoMode === 'replay' ? recordedTape() : null;

	let store: Store;
	let paypal: PayPalClient;

	if (config.demoMode === 'replay') {
		store = createMemoryStore();
		paypal = createReplayClient(tape ?? emptyTape());
		await seedReplay(store, config);
	} else {
		// A live run does not need a database. The ledger lives in this process, which is
		// enough for a judging session and asks nobody to create an account. Postgres is
		// used the moment it is configured, and the store interface is identical either way.
		store = env.DATABASE_URL ? createPgStore(env.DATABASE_URL) : createMemoryStore();
		paypal = createPayPalClient(config);

		if (!env.DATABASE_URL) {
			serviceLog('no DATABASE_URL, so the ledger lives in this process and resets on restart');
		}
	}

	const wiring: Wiring = {
		store,
		paypal,
		capabilities: sharedCapabilities(config.capabilityTtlSeconds),
		config,
		tape
	};
	wired = wiring;

	// Written after the money has moved, so a slow or absent model can never delay or
	// fail a capture. A missing key falls back to the template inside writeReceipt.
	wiring.onCaptured = (requestId) => {
		void writeReceipt(wiring, { spendRequestId: requestId }).catch(() => {});
	};

	// The preview has to fill its own ledger, and only a recorded run can do that honestly.
	if (config.demoMode === 'replay') await runScenario({ ...wiring, recording: true });

	return wired;
}

/** Only used by tests and by a deliberate reset while editing. */
export function resetApp(): void {
	wired = null;
}
