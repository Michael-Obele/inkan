import { money } from '../money';
import type { BeatOutcome } from '../outcome';
import type { Config } from './config';
import { agentLog, serviceLog } from './log';
import type { RequestStatus } from './requests';
import { SCENARIO, type ScenarioStep } from './scenario';
import { DEMO_AGENT, DEMO_MANDATE_ID, seedMandate } from './seed';
import { requestPayment, type SpendDeps } from './spend';

/** The three things the story is allowed to do: pay, wait for a person, refuse. */
export type { BeatOutcome } from '../outcome';

export type BeatResult = {
	stepId: string;
	say: string;
	expect: BeatOutcome;
	actual: BeatOutcome;
	matched: boolean;
	requestId: string;
	status: RequestStatus;
	verdict: 'allow' | 'ask' | 'deny';
	rule: string;
	reason: string;
	captureId: string | null;
	captureError: string | null;
};

export function findBeat(stepId: string): ScenarioStep | null {
	return SCENARIO.find((step) => step.id === stepId) ?? null;
}

export function outcomeOf(status: RequestStatus): BeatOutcome {
	// A refunded purchase still moved money, so the beat it belongs to was paid.
	if (status === 'captured' || status === 'refunded') return 'paid';
	if (status === 'pending') return 'waiting';
	return 'refused';
}

/**
 * One beat of the demo, run through the same entry point the real runner uses.
 * Nothing here is a stub: the agent's words arrive as data, the rule engine
 * decides, and only an allowed request reaches the PayPal client.
 */
export async function runBeat(deps: SpendDeps, stepId: string): Promise<BeatResult> {
	const step = findBeat(stepId);
	if (!step) throw new Error(`no demo beat named ${stepId}`);

	agentLog(`asks: "${step.say}" (${(step.amountCents / 100).toFixed(2)} ${'USD'})`);

	const result = await requestPayment(deps, {
		mandateId: DEMO_MANDATE_ID,
		agentId: DEMO_AGENT,
		request: step.say,
		amount: money(step.amountCents),
		merchantSlug: step.merchantSlug,
		category: step.category,
		recurring: step.recurring
	});

	const actual = outcomeOf(result.status);

	agentLog(`beat "${step.id}" → ${actual} by ${result.rule}: ${result.reason}`);
	if (result.captureId) serviceLog(`captured ${result.captureId} for beat "${step.id}"`);

	return {
		stepId: step.id,
		say: step.say,
		expect: step.expect,
		actual,
		matched: actual === step.expect,
		requestId: result.requestId,
		status: result.status,
		verdict: result.verdict,
		rule: result.rule,
		reason: result.reason,
		captureId: result.captureId ?? null,
		captureError: result.captureError
			? (result.captureError.issue ?? result.captureError.body)
			: null
	};
}

/**
 * Throws the rehearsal away. Only meaningful in live mode: a replay's tape is
 * ordered, so rewinding the store without rewinding the recording would desync
 * the two and start telling lies.
 */
export async function resetDemo(deps: SpendDeps & { config: Config }): Promise<void> {
	if (deps.config.demoMode === 'replay') {
		throw new Error('A replay cannot be reset. Restart with DEMO_MODE=live to rehearse.');
	}
	await deps.store.wipeMandate(DEMO_MANDATE_ID);
	deps.capabilities.revokeMandate(DEMO_MANDATE_ID);
	await seedMandate(deps.store, deps.config);
	agentLog('the rehearsal is wiped, the story can start again');
}
