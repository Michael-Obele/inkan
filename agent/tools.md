# Tools and commands

Read this before running commands, touching PayPal, or debugging the sandbox.

## Commands

| Command                                | What it does                              |
| -------------------------------------- | ----------------------------------------- |
| `bun run dev`                          | Dev server (ask first; default port 5173) |
| `bun run build`                        | Production build through the Bun adapter  |
| `bun check`                            | `svelte-kit sync` then `svelte-check`     |
| `bun run test`                         | Vitest, once                              |
| `bun run test:unit`                    | Vitest in watch mode                      |
| `bun run db:generate`                  | Write a Drizzle migration                 |
| `bun run db:migrate`                   | Apply migrations                          |
| `bun run db:push`                      | Push the schema to a dev database         |
| `bun add <pkg>`                        | The only way to add a dependency          |
| `bunx shadcn-svelte@latest add <name>` | Add a shadcn-svelte component             |
| `bun run adversarial`                  | The thirteen published attacks, live      |
| `bun run record:tape`                  | Record one real purchase and refund       |
| `bun run runner`                       | Start the agent, after its env check      |

`bun test` is not the script. It runs Bun's own runner and will disagree with vitest.

`DEMO_MODE=replay bun run dev` runs the whole story with no keys and no database,
playing back `src/lib/server/paypal/tape.json`. Change `DEMO_MODE` to `live` and the
same screens drive the real sandbox.

## Environment

Names and comments live in `.env.example`. The split that matters:

- **Service side** reads `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENVIRONMENT`, `PAYPAL_WEBHOOK_ID`, `DATABASE_URL`, `STORE_SLUG`, `STORE_MERCHANT_ID`, the `TEST_CARD_*` pair, and the optional `MODEL_*` trio.
- **Runner side** must receive none of the PayPal variables. It validates at startup and throws if one appears, naming every one it found.
- `DATABASE_URL` is set and the five tables are migrated, so anything importing `src/lib/server/db` works.
- `spike/.env` holds the sandbox keys for the spike scripts and is gitignored. The two env files once held **different** apps: only the `spike/.env` pair could take cards, and the other answered `PAYEE_NOT_ENABLED_FOR_CARD_PROCESSING`. If that error reappears, check which app the keys belong to before changing any code.

## MCP servers available

| Server          | Use it for                                                       |
| --------------- | ---------------------------------------------------------------- |
| `sepia`         | Recall and persist decisions, preferences and project facts      |
| `tomoshibi`     | Web search, scrape, crawl, page monitoring                       |
| `shadcn-svelte` | Component docs, blocks, icons; run before adding any component   |
| `svelte`        | Svelte 5 and SvelteKit docs, plus the autofixer for written code |
| `exa`           | Search and page fetch when tomoshibi is down                     |
| `gh` (CLI)      | Repo, PR and issue work                                          |

## PayPal sandbox, verified 2026-11-04

Every line below was measured, not read. The full evidence sits in `spike/README.md`.

- Host is `https://api-m.sandbox.paypal.com`. Token: `POST /v1/oauth2/token`, `grant_type=client_credentials`.
- The REST app must be type **Merchant**. Platform apps need approved-partner status and create a separate Platform Partner App account.
- **With `payment_source.card` and `intent: CAPTURE`, PayPal captures during the create call.** The order comes back `COMPLETED` and the capture id is at `purchase_units[0].payments.captures[0].id`. Calling capture again answers 422 `ORDER_ALREADY_CAPTURED`.
- **With `payment_source.card` and `intent: AUTHORIZE`, PayPal authorizes during the create call.** Same trap, different object: the order returns `COMPLETED`, there is no `payments.captures`, and the hold is at `purchase_units[0].payments.authorizations[0].id` with status `CREATED`. A second `authorize` answers 422 `ORDER_ALREADY_AUTHORIZED`. **Never attach the card in the create call.**
- **The create response does not carry `payee`.** `GET /v2/checkout/orders/{id}` does, including `payee.merchant_id`. Read it there before attaching a payment source, so the merchant allowlist checks PayPal's own identity rather than a string the runner supplied.
- **The unavoidable sequence, all measured on 2026-11-06:** create `intent: AUTHORIZE` with **no** payment source (`CREATED`, nothing held) → `GET` the order and read `payee.merchant_id` → decide → `POST /v2/checkout/orders/{id}/confirm-payment-source` with the card (`200`, becomes `APPROVED`, still nothing held) → `POST /v2/checkout/orders/{id}/authorize` (hold appears) → `POST /v2/payments/authorizations/{id}/capture`. A denial before step 4 touches no funds at all.
- **A hold is releasable.** `POST /v2/payments/authorizations/{id}/void` returns `204` and the authorization status becomes `VOIDED`, with no settlement. That is the unwind for a payee that changes after the check.
- Authorization expiry measured in the sandbox was 29 days out, far longer than any capability TTL, so expiry is never the thing that stops a spend.
- A plain order with no payment source cannot be captured. You get 422 `ORDER_NOT_APPROVED` until a buyer approves the `approve` or `payer-action` link.
- `@paypal/agent-toolkit@1.11.0` exposes only the tools you enable. Use the exported `ALL_TOOLS_ENABLED` for all 47, which includes `pay_order`, `create_refund`, `get_dispute`, `list_disputes`, `accept_dispute_claim`, `list_transactions`.
- `pay_order` takes an order id and only captures an already approved order. It never approves one.
- Toolkit `execute()` returns a JSON **string**. Parse it before reading `id` or `status`.
- Toolkit `create_order` has no payment source field, so its orders always return `PAYER_ACTION_REQUIRED`.

## Debugging a PayPal failure, in order

1. **Is the key pair valid?** `401 invalid_client` on sandbox and on live means the pair is wrong, often a secret pasted with one stray leading character. A healthy pair here was client id 82 characters and secret 80.
2. **Which merchant do these keys belong to?** Create an order and `GET /v2/checkout/orders/{id}`, then read `purchase_units[0].payee.email_address`. That names the account. The create response does not reliably include it.
3. **Is the account able to take money?** `PAYEE_NOT_ENABLED_FOR_CARD_PROCESSING` means no card capability. `PAYEE_ACCOUNT_LOCKED_OR_CLOSED` in a checkout redirect (base64 in the `code` query parameter) means the merchant is locked. Both are account state, not code.
4. **Not approved.** `ORDER_NOT_APPROVED` means there is no payer and no payment source. Expected for a bare order.

## Spike scripts

Run from `spike/`, with `bun --env-file=.env <script>`:

- `01-rest.ts` plain order, create and capture. Fails by design without a payer; it documents that.
- `02-toolkit.ts` prints the tool list for a narrow config and for `ALL_TOOLS_ENABLED`.
- `03-card-capture.ts` the money path that passes: create with a card, capture from the create response, refund. Card details can be overridden with `TEST_CARD_NUMBER`, `TEST_CARD_EXPIRY` (`YYYY-MM`) and `TEST_CARD_CVV`.
- `04-buyer-approval.ts create` then `finish`, for the human-in-the-loop flow. `create` prints a sandbox approval link, `finish` captures and refunds after the buyer approves.
- `05-authorize-capture.ts` proves `intent: AUTHORIZE` authorizes during create and that `payee` is readable on the order read. It ends `FAIL` by design on the `authorize` call, because that is the finding.
- `06-authorize-void.ts` the decisive one: authorization location, void to `VOIDED`, payee readable with no payment source, and `confirm-payment-source` accepting a card. Ends `GATE VOID: PASS`.

Run spikes with `bun --env-file=spike/.env spike/<script>.ts`, not the root `.env`. The two files hold **different** app key pairs, and only the `spike/.env` pair can process card payments. The root `.env` pair answers `PAYEE_NOT_ENABLED_FOR_CARD_PROCESSING`.

## Verifying before you report

```bash
bun check
bun run test
bunx prettier --check <the files you touched>
```

Never claim a command passed without the exit code or output in front of you. If a step needs a human (a browser login, a dashboard toggle), say which one and stop.
