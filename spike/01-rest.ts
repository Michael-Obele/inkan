const HOST = 'https://api-m.sandbox.paypal.com';

const id = process.env.PAYPAL_CLIENT_ID;
const secret = process.env.PAYPAL_CLIENT_SECRET;

if (!id || !secret) {
	console.error('Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET');
	process.exit(1);
}

const auth = Buffer.from(`${id}:${secret}`).toString('base64');

type TokenResponse = { access_token: string };
type OrderResponse = { id: string; status: string };
type CaptureResponse = {
	id: string;
	status: string;
	purchase_units: Array<{
		payments: { captures: Array<{ id: string; status: string }> };
	}>;
};
type RefundResponse = { id: string; status: string };

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
	const body = (await res.json()) as TokenResponse;
	return body.access_token;
}

async function main() {
	const access = await token();
	console.log('token: ok');

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
					custom_id: 'mandate-spike',
					amount: { currency_code: 'USD', value: '12.00' }
				}
			]
		})
	});
	if (!orderRes.ok) {
		throw new Error(`create order ${orderRes.status} ${await orderRes.text()}`);
	}
	const order = (await orderRes.json()) as OrderResponse;
	console.log(`order: ${order.id} ${order.status}`);

	const captureRes = await fetch(`${HOST}/v2/checkout/orders/${order.id}/capture`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${access}`,
			'Content-Type': 'application/json',
			'PayPal-Request-Id': `${requestId}-capture`
		}
	});
	if (!captureRes.ok) {
		throw new Error(`capture ${captureRes.status} ${await captureRes.text()}`);
	}
	const capture = (await captureRes.json()) as CaptureResponse;
	const captureId = capture.purchase_units[0]?.payments?.captures?.[0]?.id;
	if (!captureId) throw new Error('no capture id in response');
	console.log(`capture: ${captureId}`);

	const refundRes = await fetch(`${HOST}/v2/payments/captures/${captureId}/refund`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${access}`,
			'Content-Type': 'application/json',
			'PayPal-Request-Id': `${requestId}-refund`
		}
	});
	if (!refundRes.ok) {
		throw new Error(`refund ${refundRes.status} ${await refundRes.text()}`);
	}
	const refund = (await refundRes.json()) as RefundResponse;
	console.log(`refund: ${refund.id} ${refund.status}`);
	console.log('GATE 0 REST: PASS');
}

main().catch((error) => {
	console.error('GATE 0 REST: FAIL');
	console.error(error);
	process.exit(1);
});
