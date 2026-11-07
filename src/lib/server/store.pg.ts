import { and, desc, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './db/schema';
import { ledgerEvent, mandate, mandateEvent, receipt, spendRequest } from './db/schema';
import { money, type Money } from '../money';
import type { Store, SpendRequestPatch } from './store';

/**
 * Built from a connection string rather than `$app/env/private`, so this module
 * can be exercised by a plain script as well as by the app.
 */
export function createPgStore(databaseUrl: string): Store {
	const client = neon(databaseUrl);
	const db = drizzle(client, { schema });

	return {
		async getMandate(id) {
			const rows = await db.select().from(mandate).where(eq(mandate.id, id)).limit(1);
			return rows[0] ?? null;
		},

		async findNewestMandate(ownerId) {
			const rows = await db
				.select()
				.from(mandate)
				.where(eq(mandate.ownerId, ownerId))
				.orderBy(desc(mandate.createdAt))
				.limit(1);
			return rows[0] ?? null;
		},

		async listMandates(ownerId) {
			return db
				.select()
				.from(mandate)
				.where(eq(mandate.ownerId, ownerId))
				.orderBy(mandate.createdAt);
		},

		async createMandate(input, change) {
			const rows = await db.insert(mandate).values(input).returning();
			const created = rows[0];
			await db.insert(mandateEvent).values({
				mandateId: created.id,
				kind: 'created',
				change: change ?? null,
				by: 'human'
			});
			return created;
		},

		async updateMandate(id, patch) {
			const rows = await db.update(mandate).set(patch).where(eq(mandate.id, id)).returning();
			if (!rows[0]) throw new Error(`no mandate ${id}`);
			return rows[0];
		},

		async countMandateEvents(id) {
			const rows = await db
				.select({ count: sql<number>`count(*)::int` })
				.from(mandateEvent)
				.where(eq(mandateEvent.mandateId, id));
			return rows[0]?.count ?? 0;
		},

		async findRequestByKey(key) {
			const rows = await db
				.select()
				.from(spendRequest)
				.where(eq(spendRequest.idempotencyKey, key))
				.limit(1);
			return rows[0] ?? null;
		},

		async getRequest(id) {
			const rows = await db.select().from(spendRequest).where(eq(spendRequest.id, id)).limit(1);
			return rows[0] ?? null;
		},

		async findRequestByOrderId(orderId) {
			const rows = await db
				.select()
				.from(spendRequest)
				.where(eq(spendRequest.paypalOrderId, orderId))
				.limit(1);
			return rows[0] ?? null;
		},

		async createRequest(input) {
			const rows = await db.insert(spendRequest).values(input).returning();
			return rows[0];
		},

		async updateRequest(id, patch: SpendRequestPatch) {
			const rows = await db
				.update(spendRequest)
				.set(patch)
				.where(eq(spendRequest.id, id))
				.returning();
			if (!rows[0]) throw new Error(`no spend request ${id}`);
			return rows[0];
		},

		async listRequests(mandateId) {
			return db
				.select()
				.from(spendRequest)
				.where(eq(spendRequest.mandateId, mandateId))
				.orderBy(desc(spendRequest.createdAt));
		},

		async appendLedger(input) {
			if (input.externalId) {
				const existing = await db
					.select()
					.from(ledgerEvent)
					.where(eq(ledgerEvent.externalId, input.externalId))
					.limit(1);
				// A duplicate webhook delivery is one row, not two.
				if (existing[0]) return existing[0];
			}
			const rows = await db.insert(ledgerEvent).values(input).returning();
			return rows[0];
		},

		async listLedger(mandateId) {
			return (
				db
					.select()
					.from(ledgerEvent)
					.where(eq(ledgerEvent.mandateId, mandateId))
					// receivedAt breaks the tie, because a fast run logs several rows in one
					// millisecond and the order would otherwise be arbitrary.
					.orderBy(desc(ledgerEvent.occurredAt), desc(ledgerEvent.receivedAt))
			);
		},

		async findLedgerByPayPalId(paypalId) {
			const rows = await db
				.select()
				.from(ledgerEvent)
				.where(eq(ledgerEvent.paypalId, paypalId))
				.limit(1);
			return rows[0] ?? null;
		},

		async getLedgerEvent(id) {
			const rows = await db.select().from(ledgerEvent).where(eq(ledgerEvent.id, id)).limit(1);
			return rows[0] ?? null;
		},

		async findLedgerByExternalId(externalId) {
			const rows = await db
				.select()
				.from(ledgerEvent)
				.where(eq(ledgerEvent.externalId, externalId))
				.limit(1);
			return rows[0] ?? null;
		},

		async sumCaptured(mandateId) {
			return sumByKind(db, mandateId, 'captured');
		},

		async sumRefunded(mandateId) {
			return sumByKind(db, mandateId, 'refunded');
		},

		async writeReceipt(input) {
			const rows = await db.insert(receipt).values(input).returning();
			return rows[0];
		},

		async getReceipt(spendRequestId) {
			const rows = await db
				.select()
				.from(receipt)
				.where(eq(receipt.spendRequestId, spendRequestId))
				.limit(1);
			return rows[0] ?? null;
		},

		async recordMandateEvent(input) {
			const rows = await db
				.insert(mandateEvent)
				.values({
					mandateId: input.mandateId,
					kind: input.kind,
					change: input.change,
					by: 'human',
					at: input.at
				})
				.returning();
			return rows[0];
		},

		/**
		 * Ordered children first, because every foreign key here is restrictive on
		 * purpose: evidence is not supposed to disappear by accident.
		 */
		async wipeMandate(id) {
			await db.execute(
				sql`delete from receipt where spend_request_id in (select id from spend_request where mandate_id = ${id})`
			);
			await db.execute(sql`delete from ledger_event where mandate_id = ${id}`);
			await db.execute(sql`delete from spend_request where mandate_id = ${id}`);
			await db.execute(sql`delete from mandate_event where mandate_id = ${id}`);
			await db.execute(sql`delete from mandate where id = ${id}`);
		}
	};
}

async function sumByKind(
	db: ReturnType<typeof drizzle<typeof schema>>,
	mandateId: string,
	kind: 'captured' | 'refunded'
): Promise<Money> {
	const rows = await db
		.select({
			total: sql<number>`coalesce(sum(${ledgerEvent.amountCents}), 0)::int`,
			currency: sql<string>`coalesce(min(${ledgerEvent.amountCurrency}), 'USD')`
		})
		.from(ledgerEvent)
		.where(and(eq(ledgerEvent.mandateId, mandateId), eq(ledgerEvent.kind, kind)));

	const row = rows[0];
	return money(row?.total ?? 0, row?.currency ?? 'USD');
}
