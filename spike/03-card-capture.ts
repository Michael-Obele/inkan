// Second half of the money path: capture without a buyer in the loop.
// Needs the sandbox app to have Expanded / Advanced Credit and Debit Card Payments enabled.
const HOST = 'https://api-m.sandbox.paypal.com';

const id = process.env.PAYPAL_CLIENT_ID;
const secret = process.env.PAYPAL_CLIENT_SECRET;

if (!id || !secret) {
	console.error('Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET');
	process.exit(1);
}

const auth = Buffer.from(`${id}:${secret}`).toString('base64');

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

const access = await token();
console.log('token: ok');

// Card details come from the sandbox account's own test card, so they can be
// swapped without editing this file. Expiry is YYYY-MM.
const card = {
	name: process.env.TEST_CARD_NAME ?? 'Gate Zero',
	number: process.env.TEST_CARD_NUMBER ?? '4012000033330026',
	expiry: process.env.TEST_CARD_EXPIRY ?? '2027-01',
	security_code: process.env.TEST_CARD_CVV ?? '123'
};
console.log(`card: ${card.number} exp ${card.expiry}`);

const requestId = crypto.randomUUID();

const orderRes = await fetch(`${HOST}/v2/checkout/orders`, {
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
				custom_id: 'inkan-gate0-card',
				amount: { currency_code: 'USD', value: '12.00' }
			}
		],
		payment_source: {
			card
		}
	})
});

const orderText = await orderRes.text();
console.log(`create order: ${orderRes.status}`);
if (!orderRes.ok) {
	console.error(orderText);
	console.error('GATE 0 CARD: FAIL at create order');
	process.exit(1);
}

const order = JSON.parse(orderText);
console.log(`order: ${order.id} ${order.status}`);

// A card payment source with intent CAPTURE is captured during the create call,
// so the capture id is already in the create response. Capture again only if it is not.
let captureId: string | undefined = order.purchase_units?.[0]?.payments?.captures?.[0]?.id;

if (captureId) {
	console.log(`capture: ${captureId} (captured during create)`);
} else {
	const captureRes = await fetch(`${HOST}/v2/checkout/orders/${order.id}/capture`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${access}`,
			'Content-Type': 'application/json',
			'PayPal-Request-Id': `${requestId}-capture`
		}
	});

	const captureText = await captureRes.text();
	console.log(`capture: ${captureRes.status}`);
	if (!captureRes.ok) {
		console.error(captureText);
		console.error('GATE 0 CARD: FAIL at capture');
		process.exit(1);
	}

	const capture = JSON.parse(captureText);
	captureId = capture.purchase_units?.[0]?.payments?.captures?.[0]?.id;
	if (!captureId) {
		console.error('no capture id in response');
		console.error('GATE 0 CARD: FAIL at capture');
		process.exit(1);
	}
	console.log(`capture: ${captureId}`);
}

const refundRes = await fetch(`${HOST}/v2/payments/captures/${captureId}/refund`, {
	method: 'POST',
	headers: {
		Authorization: `Bearer ${access}`,
		'Content-Type': 'application/json',
		'PayPal-Request-Id': `${requestId}-refund`
	}
});

const refundText = await refundRes.text();
console.log(`refund: ${refundRes.status}`);
if (!refundRes.ok) {
	console.error(refundText);
	console.error('GATE 0 CARD: FAIL at refund');
	process.exit(1);
}

const refund = JSON.parse(refundText) as { id: string; status: string };
console.log(`refund: ${refund.id} ${refund.status}`);
console.log('GATE 0 CARD: PASS');
