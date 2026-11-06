import type { Tone } from '#lib/components/status-pill.svelte';

/**
 * One vocabulary for the ledger, shared by the home page and the ledger page so
 * the same event cannot be called two things on two screens.
 */
export const LEDGER_LABELS: Record<string, string> = {
	requested: 'Asked',
	allowed: 'Allowed on its own',
	denied: 'Refused',
	escalated: 'Waiting for a person',
	approved: 'Approved by you',
	authorized: 'Money held',
	hold_released: 'Hold released',
	captured: 'Paid',
	refunded: 'Refunded',
	disputed: 'Disputed',
	failed: 'Did not complete'
};

export const LEDGER_TONES: Record<string, Tone> = {
	requested: 'neutral',
	allowed: 'info',
	denied: 'danger',
	escalated: 'warning',
	approved: 'info',
	authorized: 'warning',
	hold_released: 'neutral',
	captured: 'success',
	refunded: 'info',
	disputed: 'warning',
	failed: 'danger'
};

export function ledgerLabel(kind: string): string {
	return LEDGER_LABELS[kind] ?? kind;
}

export function ledgerTone(kind: string): Tone {
	return LEDGER_TONES[kind] ?? 'neutral';
}
