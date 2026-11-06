import type { SpendDeps } from './spend';
import { requestPayment } from './spend';
import { money } from '../money';
import { SCENARIO } from './scenario';
import { DEMO_MANDATE_ID } from './seed';

/**
 * Runs the recorded scenario against the replay client, so the preview fills a
 * ledger from real recorded answers instead of a fabricated one.
 *
 * The tape ends with one refund the scenario does not spend, which is what lets
 * a judge press Refund and watch the recorded refund come back.
 */
export async function runScenario(deps: SpendDeps): Promise<void> {
	for (const step of SCENARIO) {
		await requestPayment(deps, {
			mandateId: DEMO_MANDATE_ID,
			agentId: 'coffee-runner',
			request: step.say,
			amount: money(step.amountCents),
			merchantSlug: step.merchantSlug,
			category: step.category,
			recurring: step.recurring
		});
	}
}
