import { validateRunnerEnv, RunnerCredentialError } from './env';
import { ask } from './ask';
import { TASKS, type Task } from './tasks';

const env = (() => {
	try {
		return validateRunnerEnv(process.env);
	} catch (error) {
		if (error instanceof RunnerCredentialError) {
			console.error(error.message);
			process.exit(2);
		}
		throw error;
	}
})();

// Printed before anything happens, so a recording shows what the agent holds.
console.log(`agent: ${env.agentId}`);
console.log(`paypal credentials present: ${countPaypalVars()}`);
console.log(`asking: ${env.baseUrl}`);

const only = process.argv[2];

const tasks = only ? TASKS.filter((task) => task.id === only) : TASKS;
if (tasks.length === 0) {
	console.error(`no task called ${only}. Known: ${TASKS.map((task) => task.id).join(', ')}`);
	process.exit(1);
}

for (const task of tasks) {
	await runTask(task);
}

async function runTask(task: Task) {
	const parsed = await ask(env, task);

	const response = await fetch(`${env.baseUrl}/api/requests`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			mandateId: task.mandateId,
			agentId: env.agentId,
			request: task.say,
			amount: { cents: parsed.amountCents, currency: 'USD' },
			merchantSlug: parsed.merchantSlug,
			category: parsed.category,
			recurring: parsed.recurring
		})
	});

	const body = (await response.json()) as Record<string, unknown>;

	if (!response.ok) {
		console.error(`${task.id}: refused by the service (${response.status})`, body);
		return;
	}

	const verdict = String(body.verdict);
	const label =
		verdict === 'deny'
			? 'REFUSED'
			: verdict === 'ask'
				? 'WAITING FOR YOU'
				: String(body.status) === 'captured'
					? 'PAID'
					: 'DID NOT COMPLETE';

	console.log(`${task.id}: ${label}`);
	console.log(`  rule: ${body.rule}`);
	console.log(`  says: ${body.reason}`);
	if (body.captureId) console.log(`  capture: ${body.captureId}`);
	if (body.captureError) console.log(`  paypal said: ${JSON.stringify(body.captureError)}`);
	console.log('');
}

function countPaypalVars(): number {
	return Object.keys(process.env).filter(
		(name) => name.startsWith('PAYPAL_') && Boolean(process.env[name])
	).length;
}
