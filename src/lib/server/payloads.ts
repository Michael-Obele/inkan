import * as v from 'valibot';
import { money, type Money } from '../money';

/**
 * Every payload that crosses the HTTP surface is described once, in Valibot, so
 * a route validates the same way the runner and the tests do.
 */

export type ParseResult<T> = { ok: true; value: T } | { ok: false; issues: string[] };

function parse<T>(schema: v.GenericSchema<unknown, T>, input: unknown): ParseResult<T> {
	const result = v.safeParse(schema, input);
	if (result.success) return { ok: true, value: result.output };
	return {
		ok: false,
		issues: result.issues.map((issue) => `${issue.path?.[0]?.key ?? 'body'}: ${issue.message}`)
	};
}

const Cents = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100_000_000));
const MoneySchema = v.object({ cents: Cents, currency: v.optional(v.string(), 'USD') });

export const RequestPaymentSchema = v.object({
	mandateId: v.pipe(v.string(), v.minLength(1)),
	agentId: v.pipe(v.string(), v.minLength(1)),
	request: v.pipe(v.string(), v.minLength(1), v.maxLength(2000)),
	amount: MoneySchema,
	merchantSlug: v.pipe(v.string(), v.minLength(1)),
	category: v.optional(v.pipe(v.string(), v.minLength(1)), 'goods'),
	recurring: v.optional(v.boolean(), false)
});

export type RequestPaymentPayload = Omit<v.InferOutput<typeof RequestPaymentSchema>, 'amount'> & {
	amount: Money;
};

export function parseRequestPayment(input: unknown): ParseResult<RequestPaymentPayload> {
	const result = parse(RequestPaymentSchema, input);
	if (!result.ok) return result;
	const { amount, ...rest } = result.value;
	return { ok: true, value: { ...rest, amount: money(amount.cents, amount.currency) } };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?$/;

export const CreateMandateSchema = v.pipe(
	v.object({
		ownerId: v.optional(v.string(), 'demo-human'),
		agentId: v.optional(v.string(), 'coffee-runner'),
		purpose: v.pipe(v.string(), v.minLength(4), v.maxLength(280)),
		allowedCategories: v.optional(v.array(v.string()), ['goods']),
		ceilingCents: v.pipe(Cents, v.minValue(1)),
		perTransactionCapCents: v.pipe(Cents, v.minValue(1)),
		autoApproveAmountCents: v.optional(Cents, 2000),
		allowedMerchants: v.pipe(v.array(v.string()), v.minLength(1)),
		expiresAt: v.pipe(v.string(), v.regex(ISO_DATE, 'must be a date'))
	}),
	v.check(
		(input) => input.perTransactionCapCents <= input.ceilingCents,
		'a single purchase limit cannot exceed the ceiling'
	),
	v.check(
		(input) => (input.autoApproveAmountCents ?? 0) <= input.perTransactionCapCents,
		'the auto-approve amount cannot exceed the single purchase limit'
	),
	v.check(
		(input) => new Date(input.expiresAt).getTime() > Date.now(),
		'the expiry has to be in the future'
	)
);

export type CreateMandatePayload = v.InferOutput<typeof CreateMandateSchema>;

export function parseCreateMandate(input: unknown): ParseResult<CreateMandatePayload> {
	const result = parse(CreateMandateSchema, input);
	if (!result.ok) return result;
	if (Number.isNaN(new Date(result.value.expiresAt).getTime())) {
		return { ok: false, issues: ['expiresAt: not a real date'] };
	}
	return result;
}

export const DecisionSchema = v.object({ action: v.picklist(['approve', 'deny']) });
export type DecisionPayload = v.InferOutput<typeof DecisionSchema>;

export function parseDecision(input: unknown): ParseResult<DecisionPayload> {
	return parse(DecisionSchema, input);
}

export const MandateChangeSchema = v.variant('kind', [
	v.object({ kind: v.literal('revoke') }),
	v.object({ kind: v.literal('lower_ceiling'), ceilingCents: Cents }),
	v.object({ kind: v.literal('remove_merchant'), merchantId: v.pipe(v.string(), v.minLength(1)) }),
	v.object({
		kind: v.literal('shorten_expiry'),
		expiresAt: v.pipe(v.string(), v.regex(ISO_DATE, 'must be a date'))
	})
]);

export type MandateChangePayload = v.InferOutput<typeof MandateChangeSchema>;

export function parseMandateChange(input: unknown): ParseResult<MandateChangePayload> {
	return parse(MandateChangeSchema, input);
}

export const RefundSchema = v.object({ ledgerEventId: v.pipe(v.string(), v.uuid()) });
export type RefundPayload = v.InferOutput<typeof RefundSchema>;

export function parseRefund(input: unknown): ParseResult<RefundPayload> {
	return parse(RefundSchema, input);
}
