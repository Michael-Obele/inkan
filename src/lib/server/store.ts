import { money, type Money } from '../money';
import type {
	LedgerEventKind,
	ledgerEvent as ledgerEventTable,
	mandate as mandateTable,
	mandateEvent as mandateEventTable,
	receipt as receiptTable,
	spendRequest as spendRequestTable
} from './db/schema';
import type { Intent, Decision } from './policy';
import type { Narrowing } from './mandate';
import type { RequestStatus } from './requests';

export type MandateRow = typeof mandateTable.$inferSelect;
export type MandateInsert = typeof mandateTable.$inferInsert;

export type SpendRequestRow = typeof spendRequestTable.$inferSelect;
export type SpendRequestInsert = typeof spendRequestTable.$inferInsert;

export type LedgerEventRow = typeof ledgerEventTable.$inferSelect;
export type LedgerEventInsert = typeof ledgerEventTable.$inferInsert;

export type ReceiptRow = typeof receiptTable.$inferSelect;
export type MandateEventRow = typeof mandateEventTable.$inferSelect;

export type SpendRequestPatch = Partial<
	Pick<
		SpendRequestRow,
		| 'status'
		| 'intent'
		| 'merchantId'
		| 'merchantEmail'
		| 'paypalOrderId'
		| 'paypalAuthorizationId'
		| 'verdict'
		| 'decidingRule'
		| 'reason'
		| 'decidedBy'
		| 'failure'
		| 'resolvedAt'
	>
>;

/**
 * Everything the money path persists, behind one interface. Postgres backs it
 * in the app and a Map backs it in tests, so the flow that spends money is
 * exercised without a database.
 */
export type Store = {
	getMandate(id: string): Promise<MandateRow | null>;
	createMandate(input: MandateInsert, change?: Narrowing | null): Promise<MandateRow>;
	updateMandate(id: string, patch: Partial<MandateRow>): Promise<MandateRow>;
	countMandateEvents(id: string): Promise<number>;

	findRequestByKey(key: string): Promise<SpendRequestRow | null>;
	getRequest(id: string): Promise<SpendRequestRow | null>;
	findRequestByOrderId(orderId: string): Promise<SpendRequestRow | null>;
	createRequest(input: SpendRequestInsert): Promise<SpendRequestRow>;
	updateRequest(id: string, patch: SpendRequestPatch): Promise<SpendRequestRow>;
	listRequests(mandateId: string): Promise<SpendRequestRow[]>;

	appendLedger(input: LedgerEventInsert): Promise<LedgerEventRow>;
	getLedgerEvent(id: string): Promise<LedgerEventRow | null>;
	listLedger(mandateId: string): Promise<LedgerEventRow[]>;
	findLedgerByPayPalId(paypalId: string): Promise<LedgerEventRow | null>;
	findLedgerByExternalId(externalId: string): Promise<LedgerEventRow | null>;

	sumCaptured(mandateId: string): Promise<Money>;
	sumRefunded(mandateId: string): Promise<Money>;

	writeReceipt(input: { spendRequestId: string; text: string; model: string }): Promise<ReceiptRow>;
	getReceipt(spendRequestId: string): Promise<ReceiptRow | null>;

	recordMandateEvent(input: {
		mandateId: string;
		kind: 'created' | 'narrowed' | 'revoked';
		change: Narrowing | null;
		at: Date;
	}): Promise<MandateEventRow>;

	/**
	 * Removes every row a mandate owns. Only the demo reset calls it, so a
	 * rehearsal can be thrown away and the story run again from the top.
	 */
	wipeMandate(id: string): Promise<void>;
};

export type LedgerEventInput = {
	spendRequestId: string | null;
	mandateId: string;
	kind: LedgerEventKind;
	amount: Money;
	merchantId: string | null;
	paypalId: string | null;
	externalId: string | null;
	payload: unknown;
	occurredAt: Date;
};

export function toLedgerInsert(input: LedgerEventInput): LedgerEventInsert {
	return {
		spendRequestId: input.spendRequestId,
		mandateId: input.mandateId,
		kind: input.kind,
		amountCents: input.amount.cents,
		amountCurrency: input.amount.currency,
		merchantId: input.merchantId,
		paypalId: input.paypalId,
		externalId: input.externalId,
		payload: input.payload,
		occurredAt: input.occurredAt
	};
}

export function amountOf(row: { amountCents: number; amountCurrency: string }): Money {
	return money(row.amountCents, row.amountCurrency);
}

export function decisionFields(decision: Decision, by: 'policy' | 'human') {
	return {
		verdict: decision.verdict,
		decidingRule: decision.rule,
		reason: decision.reason,
		decidedBy: by
	} as const;
}

export function statusForVerdict(decision: Decision): RequestStatus {
	if (decision.verdict === 'deny') return 'denied';
	if (decision.verdict === 'allow') return 'allowed';
	return 'pending';
}

export type IntentFields = Pick<
	SpendRequestInsert,
	'intent' | 'amountCents' | 'amountCurrency' | 'merchantId' | 'merchantEmail'
>;

export function intentFields(intent: Intent, merchantEmail: string | null): IntentFields {
	return {
		intent,
		amountCents: intent.amount.cents,
		amountCurrency: intent.amount.currency,
		merchantId: intent.merchantId,
		merchantEmail
	};
}
