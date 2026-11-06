// Follow-up to 05: it never read payments.authorizations, so this settles where
// the AUTHORIZE hold lives, whether it can be voided, and whether the payee is
// readable on an order that has no payment source at all.
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

type CallOptions = { dumpBody?: boolean };

type Payee = { merchant_id?: string; email_address?: string };

type Authorization = { id?: string; status?: string; expiration_time?: string };

type PurchaseUnit = {
	custom_id?: string;
	payee?: Payee;
	payments?: {
		captures?: Array<{ id?: string; status?: string }>;
		authorizations?: Authorization[];
	};
};

type OrderResponse = {
	id?: string;
	status?: string;
	purchase_units?: PurchaseUnit[];
};

type ErrorResponse = { details?: Array<{ issue?: string }> };

// One place for the status line and the verbatim body, so a failure never loses
// the PayPal error code.
async function call<T>(
	step: string,
	url: string,
	init: CallInit,
	options: CallOptions = {}
): Promise<T> {
	const res = await fetch(url, init);
	const text = await res.text();
	console.log(`${step}: ${res.status}`);
	if (options.dumpBody) console.log(`body: ${text || '(empty)'}`);
	if (!res.ok) {
		console.error(text);
		console.error(`GATE VOID: FAIL at ${step}`);
		process.exit(1);
	}
	return (text ? JSON.parse(text) : {}) as T;
}

function printAuthorizations(label: string, list: Authorization[] | undefined): void {
	if (!list?.length) {
		console.log(`${label}: (none)`);
		return;
	}
	console.log(`${label}: ${list.length}`);
	for (const authorization of list) {
		const parts = [
			authorization.id ?? '(none)',
			authorization.status ?? '(none)',
			`exp ${authorization.expiration_time ?? '(none)'}`
		];
		console.log(`  ${parts.join(' ')}`);
	}
}

let access: string;
try {
	access = await token();
} catch (err) {
	console.error(err instanceof Error ? err.message : String(err));
	console.error('GATE VOID: FAIL at token');
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

// Q1. A card plus intent AUTHORIZE comes back COMPLETED and a second authorize
// call answers 422 ORDER_ALREADY_AUTHORIZED, so the hold is already in this
// response if it exists anywhere.
const created = await call<OrderResponse>('create order with card', `${HOST}/v2/checkout/orders`, {
	method: 'POST',
	headers: { ...jsonHeaders, 'PayPal-Request-Id': requestId },
	body: JSON.stringify({
		intent: 'AUTHORIZE',
		purchase_units: [
			{
				custom_id: 'inkan-void-a',
				amount: { currency_code: 'USD', value: '5.00' }
			}
		],
		payment_source: { card }
	})
});

const orderIdA = created.id;
if (!orderIdA) {
	console.error('no order id in create response');
	console.error('GATE VOID: FAIL at create order with card');
	process.exit(1);
}

const createdUnit = created.purchase_units?.[0];
const createdCaptures = createdUnit?.payments?.captures;
const createdAuthorizations = createdUnit?.payments?.authorizations;

console.log(`order: ${orderIdA}`);
console.log(`status on create: ${created.status ?? '(none)'}`);

if (createdCaptures?.length) {
	for (const capture of createdCaptures) {
		console.log(`capture: ${capture.id ?? '(none)'} ${capture.status ?? '(none)'}`);
	}
} else {
	console.log('captures on create: (none)');
}

printAuthorizations('authorizations on create', createdAuthorizations);

if (!createdCaptures?.length && !createdAuthorizations?.length) {
	console.log('WARNING: neither capture nor authorization in create response');
	console.log(JSON.stringify(createdUnit?.payments ?? null));
}

const orderView = await call<OrderResponse>(
	'get order with card',
	`${HOST}/v2/checkout/orders/${orderIdA}`,
	{ method: 'GET', headers: jsonHeaders }
);

const viewAuthorizations = orderView.purchase_units?.[0]?.payments?.authorizations;
console.log(`status on get: ${orderView.status ?? '(none)'}`);
printAuthorizations('authorizations on get', viewAuthorizations);

// Q2. Void releases the hold without capturing or refunding anything.
const authorizationId = viewAuthorizations?.[0]?.id ?? createdAuthorizations?.[0]?.id;
let holdReleasable = false;

if (authorizationId) {
	console.log(`voiding authorization: ${authorizationId}`);
	await call<Authorization>(
		'void authorization',
		`${HOST}/v2/payments/authorizations/${authorizationId}/void`,
		{
			method: 'POST',
			headers: { ...jsonHeaders, 'PayPal-Request-Id': `${requestId}-void` }
		},
		{ dumpBody: true }
	);

	const voided = await call<Authorization>(
		'get authorization after void',
		`${HOST}/v2/payments/authorizations/${authorizationId}`,
		{ method: 'GET', headers: jsonHeaders }
	);
	console.log(`authorization status after void: ${voided.status ?? '(none)'}`);
	holdReleasable = voided.status === 'VOIDED';
	console.log(`probe: hold_releasable = ${holdReleasable}`);
} else {
	console.log('probe: hold_releasable = unknown (no authorization id)');
}

// Q3. No payment source, so nothing can move. The question is whether the order
// still names its payee while it sits unpaid.
const noSource = await call<OrderResponse>(
	'create order without payment source',
	`${HOST}/v2/checkout/orders`,
	{
		method: 'POST',
		headers: { ...jsonHeaders, 'PayPal-Request-Id': `${requestId}-no-source` },
		body: JSON.stringify({
			intent: 'AUTHORIZE',
			purchase_units: [
				{
					custom_id: 'inkan-void-b',
					amount: { currency_code: 'USD', value: '5.00' }
				}
			]
		})
	}
);

const orderIdB = noSource.id;
if (!orderIdB) {
	console.error('no order id in create response');
	console.error('GATE VOID: FAIL at create order without payment source');
	process.exit(1);
}

console.log(`order: ${orderIdB}`);
console.log(`status on create without source: ${noSource.status ?? '(none)'}`);

const noSourceView = await call<OrderResponse>(
	'get order without payment source',
	`${HOST}/v2/checkout/orders/${orderIdB}`,
	{ method: 'GET', headers: jsonHeaders }
);

const noSourcePayee = noSourceView.purchase_units?.[0]?.payee;
console.log(`payee.merchant_id on get: ${noSourcePayee?.merchant_id ?? '(none)'}`);
console.log(`payee.email_address on get: ${noSourcePayee?.email_address ?? '(none)'}`);

const payeeKnowableWithoutHold = Boolean(
	noSourcePayee?.merchant_id ?? noSourcePayee?.email_address
);
console.log(`probe: payee_knowable_without_hold = ${payeeKnowableWithoutHold}`);

const confirmRes = await fetch(`${HOST}/v2/checkout/orders/${orderIdB}/confirm-payment-source`, {
	method: 'POST',
	headers: { ...jsonHeaders, 'PayPal-Request-Id': `${requestId}-confirm` },
	body: JSON.stringify({ payment_source: { card } })
});

const confirmText = await confirmRes.text();
console.log(`confirm-payment-source: ${confirmRes.status}`);

if (confirmRes.ok) {
	const confirmed = (confirmText ? JSON.parse(confirmText) : {}) as OrderResponse;
	const confirmedAuthorizationId = confirmed.purchase_units?.[0]?.payments?.authorizations?.[0]?.id;
	console.log(`status after confirm: ${confirmed.status ?? '(none)'}`);
	console.log(`authorization after confirm: ${confirmedAuthorizationId ?? '(none)'}`);
	console.log('probe: confirm_payment_source_with_card = ok');
} else {
	console.log(`body: ${confirmText || '(empty)'}`);
	let failureIssue = '(none)';
	try {
		const parsed = JSON.parse(confirmText) as ErrorResponse;
		failureIssue = parsed.details?.[0]?.issue ?? '(none)';
	} catch {
		// A non-JSON body was printed verbatim above; the issue stays unknown.
	}
	console.log('probe: confirm_payment_source_with_card = failed');
	console.log(`probe: failure_issue = ${failureIssue}`);
}

console.log(
	`summary: hold_is_releasable = ${holdReleasable}, payee_before_hold = ${payeeKnowableWithoutHold}`
);
const verdict = holdReleasable ? (payeeKnowableWithoutHold ? 'PASS' : 'PARTIAL') : 'FAIL';
console.log(`GATE VOID: ${verdict}`);
