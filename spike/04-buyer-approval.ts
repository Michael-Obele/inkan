// The flow the demo store uses: the buyer approves in a browser, then the server captures.
//   bun --env-file=.env 04-buyer-approval.ts create    # prints the approval link
//   bun --env-file=.env 04-buyer-approval.ts finish    # captures and refunds that order
const HOST = 'https://api-m.sandbox.paypal.com';
const STATE = '/tmp/inkan-order.json';

const id = process.env.PAYPAL_CLIENT_ID;
const secret = process.env.PAYPAL_CLIENT_SECRET;

if (!id || !secret) {
	console.error('Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET');
	process.exit(1);
}

const auth = Buffer.from(`${id}:${secret}`).toString('base64');

type State = { orderId: string; requestId: string };

async function token(): Promise<string> {
	const res = await fetch(`${HOST}/v1/oauth2/token`, {
		method: 'POST',
		headers: {
			Authorization: `Basic ${auth}`,
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: 'grant_type=client_credentials'
	});
	if (!res.ok) throw new Error(`token ${res.status} ${await res.text()}`);
	return ((await res.json()) as { access_token: string }).access_token;
}

const mode = process.argv[2];
const access = await token();
console.log('token: ok');

if (mode === 'create') {
	const requestId = crypto.randomUUID();
	const res = await fetch(`${HOST}/v2/checkout/orders`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${access}`,
			'Content-Type': 'application/json',
			'PayPal-Request-Id': requestId
		},
		body: JSON.stringify({
			intent: 'CAPTURE',
			purchase_units: [
				{
					custom_id: 'inkan-gate0-approval',
					amount: { currency_code: 'USD', value: '12.00' }
				}
			],
			application_context: {
				brand_name: 'inkan gate 0',
				user_action: 'PAY_NOW'
			}
		})
	});
	const text = await res.text();
	console.log(`create order: ${res.status}`);
	if (!res.ok) {
		console.error(text);
		process.exit(1);
	}

	const order = JSON.parse(text);
	const approve = (order.links ?? []).find(
		(link: { rel: string }) => link.rel === 'approve' || link.rel === 'payer-action'
	);

	await Bun.write(STATE, JSON.stringify({ orderId: order.id, requestId }));
	console.log(`order: ${order.id} ${order.status}`);
	console.log('open this in a private window and approve as the sandbox buyer:');
	console.log(approve?.href ?? '(no approve link returned)');
	process.exit(0);
}

if (mode === 'finish') {
	const state = (await Bun.file(STATE).json()) as State;
	console.log(`order: ${state.orderId}`);

	const before = await fetch(`${HOST}/v2/checkout/orders/${state.orderId}`, {
		headers: { Authorization: `Bearer ${access}` }
	});
	const beforeBody = (await before.json()) as { status: string };
	console.log(`order status before capture: ${beforeBody.status}`);
	if (beforeBody.status === 'PAYER_ACTION_REQUIRED') {
		console.error('Not approved yet. Approve the link from the create step first.');
		process.exit(1);
	}

	const captureRes = await fetch(`${HOST}/v2/checkout/orders/${state.orderId}/capture`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${access}`,
			'Content-Type': 'application/json',
			'PayPal-Request-Id': `${state.requestId}-capture`
		}
	});
	const captureText = await captureRes.text();
	console.log(`capture: ${captureRes.status}`);
	if (!captureRes.ok) {
		console.error(captureText);
		console.error('GATE 0 APPROVAL: FAIL at capture');
		process.exit(1);
	}

	const capture = JSON.parse(captureText);
	const captureId: string | undefined = capture.purchase_units?.[0]?.payments?.captures?.[0]?.id;
	console.log(`capture: ${captureId} ${capture.status}`);
	if (!captureId) {
		console.error('no capture id in response');
		process.exit(1);
	}

	const refundRes = await fetch(`${HOST}/v2/payments/captures/${captureId}/refund`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${access}`,
			'Content-Type': 'application/json',
			'PayPal-Request-Id': `${state.requestId}-refund`
		}
	});
	const refundText = await refundRes.text();
	console.log(`refund: ${refundRes.status}`);
	if (!refundRes.ok) {
		console.error(refundText);
		console.error('GATE 0 APPROVAL: FAIL at refund');
		process.exit(1);
	}

	const refund = JSON.parse(refundText);
	console.log(`refund: ${refund.id} ${refund.status}`);
	console.log('GATE 0 APPROVAL: PASS');
	process.exit(0);
}

console.error('usage: 04-buyer-approval.ts <create|finish>');
process.exit(1);
