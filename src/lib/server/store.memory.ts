import { randomUUID } from 'node:crypto';
import { money, addMoney, type Money } from '../money';
import type {
	Store,
	MandateRow,
	SpendRequestRow,
	LedgerEventRow,
	ReceiptRow,
	SpendRequestPatch
} from './store';
import type { MandateInsert } from './store';

/**
 * The same Store the app uses, in memory. Tests drive the real money path with
 * it, and the no-keys preview runs on it so a judge needs no database.
 */
export function createMemoryStore(): Store & { reset(): void } {
	const mandates = new Map<string, MandateRow>();
	const requests = new Map<string, SpendRequestRow>();
	const ledger: LedgerEventRow[] = [];
	const receipts = new Map<string, ReceiptRow>();
	const events: Array<{ id: string; mandateId: string; kind: string; at: Date }> = [];
	const byKey = new Map<string, string>();

	function mustRequest(id: string): SpendRequestRow {
		const row = requests.get(id);
		if (!row) throw new Error(`no spend request ${id}`);
		return row;
	}

	return {
		async getMandate(id) {
			return mandates.get(id) ?? null;
		},

		async createMandate(input: MandateInsert, _change?: unknown) {
			const row: MandateRow = {
				id: input.id,
				ownerId: input.ownerId,
				agentId: input.agentId,
				purpose: input.purpose,
				allowedCategories: input.allowedCategories ?? [],
				ceilingCents: input.ceilingCents,
				ceilingCurrency: input.ceilingCurrency ?? 'USD',
				perTransactionCapCents: input.perTransactionCapCents,
				perTransactionCapCurrency: input.perTransactionCapCurrency ?? 'USD',
				autoApproveAmountCents: input.autoApproveAmountCents,
				autoApproveAmountCurrency: input.autoApproveAmountCurrency ?? 'USD',
				allowedMerchants: input.allowedMerchants ?? [],
				expiresAt: input.expiresAt,
				status: input.status ?? 'active',
				revokedAt: input.revokedAt ?? null,
				createdAt: input.createdAt ?? new Date()
			};
			mandates.set(row.id, row);
			events.push({ id: randomUUID(), mandateId: row.id, kind: 'created', at: new Date() });
			return row;
		},

		async updateMandate(id, patch) {
			const current = mandates.get(id);
			if (!current) throw new Error(`no mandate ${id}`);
			const next = { ...current, ...patch } as MandateRow;
			mandates.set(id, next);
			return next;
		},

		async countMandateEvents(id) {
			return events.filter((event) => event.mandateId === id).length;
		},

		async findRequestByKey(key) {
			const id = byKey.get(key);
			return id ? (requests.get(id) ?? null) : null;
		},

		async getRequest(id) {
			return requests.get(id) ?? null;
		},

		async findRequestByOrderId(orderId) {
			for (const row of requests.values()) {
				if (row.paypalOrderId === orderId) return row;
			}
			return null;
		},

		async createRequest(input) {
			const now = new Date();
			const row: SpendRequestRow = {
				id: input.id ?? randomUUID(),
				mandateId: input.mandateId,
				agentId: input.agentId,
				idempotencyKey: input.idempotencyKey,
				rawRequest: input.rawRequest,
				intent: input.intent ?? null,
				amountCents: input.amountCents,
				amountCurrency: input.amountCurrency ?? 'USD',
				merchantId: input.merchantId ?? null,
				merchantEmail: input.merchantEmail ?? null,
				paypalOrderId: input.paypalOrderId ?? null,
				paypalAuthorizationId: input.paypalAuthorizationId ?? null,
				status: input.status ?? 'pending',
				verdict: input.verdict ?? null,
				decidingRule: input.decidingRule ?? null,
				reason: input.reason ?? null,
				decidedBy: input.decidedBy ?? null,
				failure: input.failure ?? null,
				createdAt: input.createdAt ?? now,
				resolvedAt: input.resolvedAt ?? null
			};
			requests.set(row.id, row);
			byKey.set(row.idempotencyKey, row.id);
			return row;
		},

		async updateRequest(id, patch: SpendRequestPatch) {
			const current = mustRequest(id);
			const next = { ...current, ...patch } as SpendRequestRow;
			requests.set(id, next);
			return next;
		},

		async listRequests(mandateId) {
			return [...requests.values()]
				.filter((row) => row.mandateId === mandateId)
				.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
		},

		async appendLedger(input) {
			if (input.externalId) {
				const existing = ledger.find((row) => row.externalId === input.externalId);
				if (existing) return existing;
			}
			const row: LedgerEventRow = {
				id: randomUUID(),
				spendRequestId: input.spendRequestId ?? null,
				mandateId: input.mandateId,
				kind: input.kind,
				amountCents: input.amountCents,
				amountCurrency: input.amountCurrency ?? 'USD',
				merchantId: input.merchantId ?? null,
				paypalId: input.paypalId ?? null,
				externalId: input.externalId ?? null,
				payload: input.payload ?? null,
				occurredAt: input.occurredAt,
				receivedAt: new Date()
			};
			ledger.push(row);
			return row;
		},

		async listLedger(mandateId) {
			// Reversed insertion order, because a run can log several rows in one
			// millisecond and a timestamp sort would then be arbitrary.
			return ledger
				.filter((row) => row.mandateId === mandateId)
				.slice()
				.reverse();
		},

		async findLedgerByPayPalId(paypalId) {
			return ledger.find((row) => row.paypalId === paypalId) ?? null;
		},

		async getLedgerEvent(id) {
			return ledger.find((row) => row.id === id) ?? null;
		},

		async findLedgerByExternalId(externalId) {
			return ledger.find((row) => row.externalId === externalId) ?? null;
		},

		async sumCaptured(mandateId) {
			return sumKind(ledger, mandateId, 'captured');
		},

		async sumRefunded(mandateId) {
			return sumKind(ledger, mandateId, 'refunded');
		},

		async writeReceipt(input) {
			const row: ReceiptRow = {
				id: randomUUID(),
				spendRequestId: input.spendRequestId,
				text: input.text,
				model: input.model,
				createdAt: new Date()
			};
			receipts.set(row.spendRequestId, row);
			return row;
		},

		async getReceipt(spendRequestId) {
			return receipts.get(spendRequestId) ?? null;
		},

		async recordMandateEvent(input) {
			const row = {
				id: randomUUID(),
				mandateId: input.mandateId,
				kind: input.kind,
				change: input.change,
				by: 'human' as const,
				at: input.at
			};
			events.push({ id: row.id, mandateId: input.mandateId, kind: input.kind, at: input.at });
			return row;
		},

		async wipeMandate(id) {
			for (const [requestId, row] of requests) {
				if (row.mandateId !== id) continue;
				requests.delete(requestId);
				byKey.delete(row.idempotencyKey);
				receipts.delete(requestId);
			}
			for (let i = ledger.length - 1; i >= 0; i -= 1) {
				if (ledger[i].mandateId === id) ledger.splice(i, 1);
			}
			for (let i = events.length - 1; i >= 0; i -= 1) {
				if (events[i].mandateId === id) events.splice(i, 1);
			}
			mandates.delete(id);
		},

		reset() {
			mandates.clear();
			requests.clear();
			ledger.length = 0;
			receipts.clear();
			events.length = 0;
			byKey.clear();
		}
	};
}

function sumKind(rows: LedgerEventRow[], mandateId: string, kind: string): Money {
	return rows
		.filter((row) => row.mandateId === mandateId && row.kind === kind)
		.reduce<Money>(
			(total, row) => addMoney(total, money(row.amountCents, row.amountCurrency)),
			money(0)
		);
}
