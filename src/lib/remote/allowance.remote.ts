import * as v from 'valibot';
import { command, query } from '$app/server';
import { app } from '#lib/server/app';
import { changeMandate } from '#lib/server/mandate-actions';
import { money } from '#lib/money';
import { seedMandate } from '#lib/server/seed';
import { agentLog } from '#lib/server/log';

/**
 * The allowance screen reads and writes through this module. A query for the
 * read, commands for the two moves a person is allowed to make, so the page
 * never needs its own endpoint or `+page.server.ts`.
 */
export const getAllowance = query(async () => {
	const deps = await app();
	const mandate = await seedMandate(deps.store, deps.config);

	const captured = await deps.store.sumCaptured(mandate.id);
	const refunded = await deps.store.sumRefunded(mandate.id);
	const requests = await deps.store.listRequests(mandate.id);
	const pending = requests.filter((row) => row.status === 'pending');
	const ledger = await deps.store.listLedger(mandate.id);

	return {
		demoMode: deps.config.demoMode,
		storeSlug: deps.config.storeSlug,
		storeMerchantId: deps.config.storeMerchantId,
		agentId: mandate.agentId,
		mandate: {
			id: mandate.id,
			status: mandate.status,
			purpose: mandate.purpose,
			ceiling: money(mandate.ceilingCents, mandate.ceilingCurrency),
			perTransactionCap: money(mandate.perTransactionCapCents, mandate.perTransactionCapCurrency),
			autoApproveAmount: money(mandate.autoApproveAmountCents, mandate.autoApproveAmountCurrency),
			allowedMerchants: mandate.allowedMerchants,
			expiresAt: mandate.expiresAt.toISOString(),
			revokedAt: mandate.revokedAt?.toISOString() ?? null
		},
		spent: money(captured.cents - refunded.cents, captured.currency),
		captured,
		refunded,
		ledgerCount: ledger.length,
		recent: ledger.slice(0, 4).map((row) => ({
			id: row.id,
			kind: row.kind,
			at: row.occurredAt.toISOString(),
			amount: money(row.amountCents, row.amountCurrency)
		})),
		pendingCount: pending.length,
		pendingIds: pending.map((row) => row.id),
		pending: pending.map((row) => ({
			id: row.id,
			rawRequest: row.rawRequest,
			amount: money(row.amountCents, row.amountCurrency)
		}))
	};
});

/**
 * Why the service refused a change, in words a person can act on. A thrown
 * remote error arrives at the browser with its message stripped, so the reason
 * travels back as data instead.
 */
function refusal(cause: unknown): string {
	const raw = cause instanceof Error ? cause.message : String(cause);
	if (raw.includes('can only lower the ceiling')) {
		return 'The new ceiling has to be lower than the current one. Narrowing only removes room to spend.';
	}
	if (raw.includes('cannot narrow a revoked mandate')) {
		return 'This allowance is stopped, so there is nothing left to narrow.';
	}
	if (raw.includes('already revoked')) return 'This allowance is already stopped.';
	if (raw.includes('cannot change the currency')) return 'Narrowing cannot change the currency.';
	return raw;
}

/** Narrowing only ever removes room, and the service refuses to raise a ceiling. */
export const lowerCeiling = command(
	v.object({ ceilingCents: v.pipe(v.number(), v.integer(), v.minValue(1)) }),
	async ({ ceilingCents }) => {
		const deps = await app();
		const mandate = await seedMandate(deps.store, deps.config);

		try {
			const result = await changeMandate(deps, mandate.id, {
				kind: 'lower_ceiling',
				ceilingCents
			});
			void getAllowance().refresh();
			return { ok: true as const, ceilingCents, mandateId: result.mandate.id };
		} catch (cause) {
			const error = refusal(cause);
			agentLog(`ceiling change refused: ${error}`);
			return { ok: false as const, error };
		}
	}
);

/** Kills the live capabilities, not a flag. The next attempt fails for that reason. */
export const stopAgent = command(async () => {
	const deps = await app();
	const mandate = await seedMandate(deps.store, deps.config);

	try {
		const result = await changeMandate(deps, mandate.id, { kind: 'revoke' });
		agentLog(`revocation requested from the allowance screen`);
		void getAllowance().refresh();
		return {
			ok: true as const,
			revokedAt: result.mandate.revokedAt?.toISOString() ?? null,
			liveCapabilitiesKilled: result.liveCapabilitiesKilled
		};
	} catch (cause) {
		const error = refusal(cause);
		return { ok: false as const, error };
	}
});
