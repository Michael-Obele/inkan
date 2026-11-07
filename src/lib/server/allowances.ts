import { randomUUID } from 'node:crypto';
import { changeMandate } from './mandate-actions';
import { parseCreateMandate } from './payloads';
import { currentMandate } from './seed';
import type { SpendDeps } from './spend';

export type NewAllowance =
	{ ok: true; mandateId: string; replacedId: string | null } | { ok: false; issues: string[] };

/**
 * A new ceiling is a new authorization, never an edit. The replacement is
 * written first, so a failure before the old one closes leaves the person with a
 * working allowance rather than none.
 */
export async function createAllowance(deps: SpendDeps, input: unknown): Promise<NewAllowance> {
	const parsed = parseCreateMandate(input);
	if (!parsed.ok) return { ok: false, issues: parsed.issues };

	const previous = await currentMandate(deps.store, deps.config);

	const created = await deps.store.createMandate({
		id: `mnd_${randomUUID().slice(0, 8)}`,
		ownerId: parsed.value.ownerId,
		agentId: parsed.value.agentId,
		purpose: parsed.value.purpose,
		allowedCategories: parsed.value.allowedCategories,
		ceilingCents: parsed.value.ceilingCents,
		ceilingCurrency: 'USD',
		perTransactionCapCents: parsed.value.perTransactionCapCents,
		perTransactionCapCurrency: 'USD',
		autoApproveAmountCents: parsed.value.autoApproveAmountCents,
		autoApproveAmountCurrency: 'USD',
		allowedMerchants: parsed.value.allowedMerchants,
		expiresAt: new Date(parsed.value.expiresAt)
	});

	const replacedId = previous.id === created.id ? null : previous.id;

	try {
		if (replacedId) {
			await changeMandate(deps, replacedId, { kind: 'supersede', replacedBy: created.id });
		}
	} catch (cause) {
		// The store has no transaction, so undo the half that did happen.
		await deps.store.updateMandate(created.id, { status: 'revoked', revokedAt: new Date() });
		throw cause;
	}

	return { ok: true, mandateId: created.id, replacedId };
}
