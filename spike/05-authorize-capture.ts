// Probes whether the receiving merchant is knowable before money moves: create
// with intent AUTHORIZE, authorize separately, then capture and refund.
// Needs Expanded / Advanced Credit and Debit Card Payments on the sandbox app.
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

type CallInit = {
	method: 'GET' | 'POST';
	headers: Record<string, string>;
	body?: string;
};

type Payee = { merchant_id?: string; email_address?: string };

type PurchaseUnit = {
	custom_id?: string;
	payee?: Payee;
	payments?: {
		captures?: Array<{ id?: string; status?: string }>;
		authorizations?: Array<{ id?: string; status?: string }>;
	};
};

type OrderResponse = {
	id?: string;
	status?: string;
	purchase_units?: PurchaseUnit[];
};

type AuthorizationResponse = {
	id?: string;
	status?: string;
	expiration_time?: string;
	merchant_id?: string;
	payee?: Payee;
};

type CaptureResponse = {
	id?: string;
	status?: string;
	purchase_units?: Array<{ payments?: { captures?: Array<{ id?: string; status?: string }> } }>;
};

type RefundResponse = { id?: string; status?: string };

// One place for the status line and the verbatim body, so a failure never loses
// the PayPal error code.
async function call<T>(step: string, url: string, init: CallInit): Promise<T> {
	const res = await fetch(url, init);
	const text = await res.text();
	console.log(`${step}: ${res.status}`);
	if (!res.ok) {
		console.error(text);
		console.error(`GATE AUTH: FAIL at ${step}`);
		process.exit(1);
	}
	return (text ? JSON.parse(text) : {}) as T;
}

let access: string;
try {
	access = await token();
} catch (err) {
	console.error(err instanceof Error ? err.message : String(err));
	console.error('GATE AUTH: FAIL at token');
	process.exit(1);
}
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
const jsonHeaders: Record<string, string> = {
	Authorization: `Bearer ${access}`,
	'Content-Type': 'application/json'
};

const created = await call<OrderResponse>('create order', `${HOST}/v2/checkout/orders`, {
	method: 'POST',
	headers: { ...jsonHeaders, 'PayPal-Request-Id': requestId },
	body: JSON.stringify({
		intent: 'AUTHORIZE',
		purchase_units: [
			{
				custom_id: 'inkan-auth-spike',
				amount: { currency_code: 'USD', value: '12.00' }
			}
		],
		payment_source: { card }
	})
});

const orderId = created.id;
if (!orderId) {
	console.error('no order id in create response');
	console.error('GATE AUTH: FAIL at create order');
	process.exit(1);
}
console.log(`order: ${orderId} ${created.status ?? '(none)'}`);

const createdUnit = created.purchase_units?.[0];
const earlyCaptureId = createdUnit?.payments?.captures?.[0]?.id;

console.log(`probe: raw status on create = ${created.status ?? '(none)'}`);
console.log(`probe: payee.merchant_id on create = ${createdUnit?.payee?.merchant_id ?? '(none)'}`);
console.log(
	`probe: payee.email_address on create = ${createdUnit?.payee?.email_address ?? '(none)'}`
);

// The create response does not reliably carry payee, so read the order back
// before authorizing. Nothing has moved yet at this point.
const orderView = await call<OrderResponse>('get order', `${HOST}/v2/checkout/orders/${orderId}`, {
	method: 'GET',
	headers: jsonHeaders
});

const viewUnit = orderView.purchase_units?.[0];
const payeeOnRead = viewUnit?.payee?.merchant_id;
console.log(`probe: payee.merchant_id on get = ${payeeOnRead ?? '(none)'}`);
console.log(`probe: payee.email_address on get = ${viewUnit?.payee?.email_address ?? '(none)'}`);

// If AUTHORIZE captured during create, money moved inside the same response that
// reported the payee, so there is no trustworthy "before capture" boundary.
const payeeVisibleBeforeCapture =
	Boolean(createdUnit?.payee?.merchant_id ?? payeeOnRead) && !earlyCaptureId;
console.log(`probe: payee_visible_before_capture = ${payeeVisibleBeforeCapture}`);

let captureId = earlyCaptureId;

if (captureId) {
	console.log(`WARNING: AUTHORIZE captured during create, capture ${captureId} exists already`);
	console.log('WARNING: money moved before any authorize call, unexpected for AUTHORIZE');
} else {
	const authorized = await call<OrderResponse>(
		'authorize',
		`${HOST}/v2/checkout/orders/${orderId}/authorize`,
		{
			method: 'POST',
			headers: { ...jsonHeaders, 'PayPal-Request-Id': `${requestId}-authorize` }
		}
	);

	const authorization = authorized.purchase_units?.[0]?.payments?.authorizations?.[0];
	const authorizationId = authorization?.id;
	console.log(`authorization: ${authorizationId ?? '(none)'} ${authorization?.status ?? '(none)'}`);
	console.log(`order after authorize: ${authorized.status ?? '(none)'}`);

	if (!authorizationId) {
		console.error('no authorization id in authorize response');
		console.error('GATE AUTH: FAIL at authorize');
		process.exit(1);
	}

	const authorizationView = await call<AuthorizationResponse>(
		'get authorization',
		`${HOST}/v2/payments/authorizations/${authorizationId}`,
		{ method: 'GET', headers: jsonHeaders }
	);
	const authorizationPayee =
		authorizationView.payee?.merchant_id ??
		authorizationView.payee?.email_address ??
		authorizationView.merchant_id;
	console.log(`authorization status: ${authorizationView.status ?? '(none)'}`);
	console.log(`authorization expiry: ${authorizationView.expiration_time ?? '(none)'}`);
	console.log(`authorization payee: ${authorizationPayee ?? '(none)'}`);

	const captured = await call<CaptureResponse>(
		'capture authorization',
		`${HOST}/v2/payments/authorizations/${authorizationId}/capture`,
		{
			method: 'POST',
			headers: { ...jsonHeaders, 'PayPal-Request-Id': `${requestId}-capture` }
		}
	);

	const nestedCaptureId = captured.purchase_units?.[0]?.payments?.captures?.[0]?.id;
	captureId = nestedCaptureId ?? captured.id;
	const shape = nestedCaptureId ? 'order shape' : 'capture-payment shape (top-level id)';
	console.log(`capture status: ${captured.status ?? '(none)'}`);
	console.log(`capture: ${captureId ?? '(none)'} [${shape}]`);

	if (!captureId) {
		console.error('no capture id in authorize-capture response');
		console.error('GATE AUTH: FAIL at capture authorization');
		process.exit(1);
	}
}

const refund = await call<RefundResponse>(
	'refund',
	`${HOST}/v2/payments/captures/${captureId}/refund`,
	{
		method: 'POST',
		headers: { ...jsonHeaders, 'PayPal-Request-Id': `${requestId}-refund` }
	}
);
console.log(`refund: ${refund.id ?? '(none)'} ${refund.status ?? '(none)'}`);

console.log(payeeVisibleBeforeCapture ? 'GATE AUTH: PASS' : 'GATE AUTH: PARTIAL');
