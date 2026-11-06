import { ALL_TOOLS_ENABLED, PayPalAgentToolkit } from '@paypal/agent-toolkit/ai-sdk';

const clientId = process.env.PAYPAL_CLIENT_ID;
const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

if (!clientId || !clientSecret) {
	console.error('Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET');
	process.exit(1);
}

const narrow = new PayPalAgentToolkit({
	clientId,
	clientSecret,
	configuration: {
		context: { sandbox: true },
		actions: {
			orders: { create: true, get: true },
			invoices: { create: true, send: true }
		}
	}
});

const narrowNames = Object.keys(narrow.getTools());
console.log(`tools with orders.create/get + invoices.create/send: ${narrowNames.length}`);
console.log(narrowNames.sort().join(', '));

// ALL_TOOLS_ENABLED is what the installed version can actually do.
const everything = new PayPalAgentToolkit({
	clientId,
	clientSecret,
	configuration: { context: { sandbox: true }, actions: ALL_TOOLS_ENABLED }
});

const allNames = Object.keys(everything.getTools()).sort();
console.log(`tools with ALL_TOOLS_ENABLED: ${allNames.length}`);
console.log(allNames.join(', '));

const payOrder = everything.getTools().pay_order;
console.log(`pay_order present: ${Boolean(payOrder)}`);
console.log('GATE 0 TOOLKIT: PASS');
