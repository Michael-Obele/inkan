# Gate 0 spike: does the PayPal sandbox work from this machine

This directory is disposable and is not a repository. It exists to answer one question before any building starts: can a developer in Nigeria register, create sandbox accounts, and move money in the sandbox.

Keep this file until the hackathon submission is filed. The answers below are evidence that the flow was verified here rather than assumed.

## How to run

```bash
cd spike
cp .env.example .env          # the sandbox client id and secret live here, never committed
bun install
bun --env-file=.env 01-rest.ts
bun --env-file=.env 02-toolkit.ts
bun --env-file=.env 03-card-capture.ts
```

`01-rest.ts` needs no dependency. `02-toolkit.ts` and `03-card-capture.ts` need `bun install` first.

| Script               | Question it answers                                                              |
| -------------------- | -------------------------------------------------------------------------------- |
| `01-rest.ts`         | Does token, create order, capture and refund work with a plain server-side call? |
| `02-toolkit.ts`      | What tools does the installed `@paypal/agent-toolkit` actually expose?           |
| `03-card-capture.ts` | Can the account capture a card payment with no buyer in the loop?                |

## Findings

Measured on 2026-11-04 from this machine. Facts only, no conclusions.

### Developer registration

- Country you registered from: Nigeria
- Was that country offered on the sign-up form (yes or no): yes, the sign-up completed
- If not, which countries were offered: not applicable

### Sandbox accounts

- Country set on the business sandbox account: NG
- Country set on the personal sandbox account: NG
- Did the accounts page accept those countries (yes or no): yes, both are the auto-created Default accounts

### Attempt 1, the NG business account

Every call below used the Default Application bound to `sb-ijvwe53562258@business.example.com` (merchant `QJRPXR875SVNE`, country NG).

`01-rest.ts`, a plain server-side order:

- Result: `GATE 0 REST: FAIL`
- Token request: pass
- Create order: pass, order `9LJ04864JY9656807` returned `CREATED`
- Capture: fail, HTTP 422
- Refund: not reached
- Error body, verbatim:

```json
{
	"name": "UNPROCESSABLE_ENTITY",
	"details": [
		{
			"issue": "ORDER_NOT_APPROVED",
			"description": "Payer has not yet approved the Order for payment. Please redirect the payer to the 'rel':'approve' url returned as part of the HATEOAS links within the Create Order call or provide a valid payment_source in the request."
		}
	],
	"message": "The requested action could not be performed, semantically incorrect, or failed business validation.",
	"debug_id": "f110465354648"
}
```

`03-card-capture.ts`, a card payment source:

- Result: `GATE 0 CARD: FAIL at create order`
- Token request: pass
- Create order with `payment_source.card`: fail, HTTP 422
- Error body, verbatim:

```json
{
	"name": "UNPROCESSABLE_ENTITY",
	"details": [
		{
			"issue": "PAYEE_NOT_ENABLED_FOR_CARD_PROCESSING",
			"description": "Payee account is not setup to be able to process card payments. Please contact PayPal customer support."
		}
	],
	"message": "The requested action could not be performed, semantically incorrect, or failed business validation.",
	"debug_id": "f4344552f0e03"
}
```

The card used was the PayPal sandbox test number `4012000033330026`, expiry `2027-01`, CVV `123`, and then the account's own issued test card `4032038923416956`, expiry `11/2031`, CVV any three digits. Both returned the same `PAYEE_NOT_ENABLED_FOR_CARD_PROCESSING` error (debug ids `f4344552f0e03` and `ca55450125976`), so the card number is not the variable.

`04-buyer-approval.ts`, the browser route:

- Result: order created, approval page refused to load
- Create order: pass, HTTP 201, order `36083084GX2156819`, status `CREATED`
- Approve link: `https://www.sandbox.paypal.com/checkoutnow?token=36083084GX2156819`
- Approve link in a browser, as the sandbox personal buyer: fail, redirected to `checkoutweb/genericError?code=UEFZRUVfQUNDT1VOVF9MT0NLRURfT1JfQ0xPU0VE`, which is base64 for `PAYEE_ACCOUNT_LOCKED_OR_CLOSED`
- Order state from the API after the failed approval: still `CREATED`

Why every step failed: the payee account is locked or closed. A locked merchant has no card capability, and it cannot show a checkout page.

### Attempt 2, the US business account

A US business sandbox account was created, `sb-vlfi653657170@business.example.com` (merchant `8NJ2CK2C6DN3S`), with a Merchant-type app bound to it, app id `APP-3KG06305XS1176718`.

`03-card-capture.ts` passes:

```
token: ok
card: 4032038923416956 exp 2031-11
create order: 201
order: 1VY03715EG4618704 COMPLETED
capture: 8LC26202JY327911X (captured during create)
refund: 201
refund: 7YU440923C748573K COMPLETED
GATE 0 CARD: PASS
```

Two facts that came out of this run:

- With `payment_source.card` and `intent: CAPTURE`, PayPal captures during the create call and returns the order as `COMPLETED`. Calling capture again answers 422 `ORDER_ALREADY_CAPTURED`. Read the capture id out of the create response instead.
- The client id and the secret must come from the same app. The pair seen here is 82 and 80 characters. A secret pasted with one extra leading character fails as `401 invalid_client` against sandbox and against live alike, which looks like a capability problem and is not one.

### Account state

The NG default business account is locked or closed. That one fact explains every failure in attempt 1: the card refusal and the approval page alike. The developer sign-up itself was accepted for Nigeria, so this was the account and not the sign-up.

Gate 0 passes on the US business account, with a card payment source and no buyer in the loop.

### Toolkit, `02-toolkit.ts`

- Result (paste the last line): `GATE 0 TOOLKIT: PASS`
- Package version installed: `@paypal/agent-toolkit@1.11.0`
- Tool names with the narrow configuration in the script (`orders.create`, `orders.get`, `invoices.create`, `invoices.send`), verbatim:

```
create_invoice, create_order, get_order, send_invoice
```

- Tool names with `ALL_TOOLS_ENABLED`, verbatim, 47 in total:

```
accept_dispute_claim, activate_recurring_series, cancel_invoice_auto_reminder,
cancel_recurring_series, cancel_sent_invoice, cancel_subscription,
create_conditional_rules_for_invoice, create_invoice, create_order,
create_product, create_recurring_series, create_refund, create_shipment_tracking,
create_subscription, create_subscription_plan, delete_invoice,
delete_recurring_series, generate_invoice_number, generate_invoice_qr_code,
get_dispute, get_invoice, get_merchant_insights, get_order, get_recurring_series,
get_refund, get_shipment_tracking, list_disputes, list_invoices, list_products,
list_subscription_plans, list_transactions, pay_order,
record_payment_for_invoice, record_refund_for_invoice, search_invoicing,
send_invoice, send_invoice_reminder, setup_invoice_auto_reminders,
show_product_details, show_subscription_details, show_subscription_plan_details,
update_invoice_auto_reminder, update_invoicing, update_plan, update_product,
update_shipment_tracking, update_subscription
```

- Is there a tool that pays an order (a `pay_order` or equivalent)? Name it, or say no: `pay_order` exists. Its only parameter is the order id. Measured: on an order the toolkit had just created (order `9AR037778H701264C`, status `PAYER_ACTION_REQUIRED`), `pay_order` returned HTTP 422 `ORDER_NOT_APPROVED`. It captures an order the buyer has already approved, it does not approve one.

### Surprises

- The narrow configuration hid `pay_order` entirely. The first run of `02-toolkit.ts` printed four tools and made the toolkit look unable to pay. The tool was there; it was not enabled.
- `create_order` in the toolkit accepts items, currency, notes and return URLs. It has no field for a payment source, so a toolkit-created order always comes back `PAYER_ACTION_REQUIRED`.
- Toolkit responses are JSON strings. They have to be parsed before reading `id` or `status`.
- The order created by `01-rest.ts` captured nothing, so the refund leg of the gate is still unexercised.
- Card capture fails one step earlier than capture, on the order, and the error names an account capability rather than a country.
- The card-processing refusal and the buyer-approval refusal are the same fault seen twice. Neither is about the card or the buyer; both are about the payee.
- The dashboard app page has no `Accept payments` section, so there is no checkbox to turn the card capability on.
- The approval page error arrives as a redirect with a base64 code in the query string. `UEFZRUVfQUNDT1VOVF9MT0NLRURfT1JfQ0xPU0VE` decodes to `PAYEE_ACCOUNT_LOCKED_OR_CLOSED`.

## Why this matters

Task 1 of the implementation plan is the only thing standing between the plan and the build. Two of the sixteen remaining tasks in the plan depend on a question this spike answers: whether the toolkit can pay an order without a browser, and whether a Nigerian account can reach the sandbox at all.

If the developer sign-up refuses a Nigerian account, stop and report. The plan changes rather than the scope.
