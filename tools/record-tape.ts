import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../src/lib/server/config';
import { money } from '../src/lib/server/money';
import { createPayPalClient } from '../src/lib/server/paypal/client';
import { recordClient, type Tape } from '../src/lib/server/paypal/replay';
import { createStore } from '../src/lib/server/capability';
import { createMemoryStore } from '../src/lib/server/store.memory';
import { seedMandate } from '../src/lib/server/seed';
import { refundFromRow } from '../src/lib/server/refunds';
import { requestPayment } from '../src/lib/server/spend';

/**
 * Records one real purchase and one real refund through the real client, then
 * writes the answers to tape.json. The preview replays those bytes, so what a
 * judge watches is what the sandbox said, not a fixture somebody typed.
 */
const config = loadConfig({ ...process.env, DEMO_MODE: 'live' });

const store = createMemoryStore();
const deps = {
	store,
	paypal: recordClient(createPayPalClient(config), () => {}),
	capabilities: createStore({ ttlSeconds: config.capabilityTtlSeconds }),
	config
};

const mandate = await seedMandate(store, config);

let tape: Tape = { recordedAt: new Date().toISOString(), entries: [] };
const paypal = recordClient(createPayPalClient(config), (finished) => {
	tape = finished;
});
deps.paypal = paypal;

console.log('recording a 18 dollar purchase...');
const purchase = await requestPayment(deps, {
	mandateId: mandate.id,
	agentId: 'coffee-runner',
	request: 'Buy one bag of house blend coffee beans from the demo store. It costs 18 dollars.',
	amount: money(1800),
	merchantSlug: config.storeSlug,
	category: 'goods',
	recurring: false
});

console.log(`purchase: ${purchase.status} ${purchase.captureId ?? purchase.captureError?.issue}`);
if (purchase.status !== 'captured') {
	console.error('the purchase did not complete, so there is nothing worth recording');
	process.exit(1);
}

console.log('recording a refund...');
const ledger = await store.listLedger(mandate.id);
const captured = ledger.find((row) => row.kind === 'captured');
if (!captured) {
	console.error('no captured row to refund');
	process.exit(1);
}

const refund = await refundFromRow({ store, paypal }, { ledgerEventId: captured.id, by: 'human' });
console.log(`refund: ${refund.ok ? refund.refundId : refund.reason}`);

const target = join(import.meta.dir, '..', 'src', 'lib', 'server', 'paypal', 'tape.json');
writeFileSync(target, JSON.stringify(tape, null, '\t') + '\n');

console.log('');
console.log(`wrote ${tape.entries.length} recorded steps to ${target}`);
for (const entry of tape.entries) {
	console.log(`  ${entry.ok ? 'ok' : 'error'} ${entry.step}`);
}
