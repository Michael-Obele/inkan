/**
 * One prefix for everything the agent does, so a busy dev terminal can be
 * filtered down to the four beats that matter on camera.
 *
 * Silent under Vitest: a passing test suite should not read like a demo run.
 */
const silent = process.env.NODE_ENV === 'test';

export function agentLog(message: string): void {
	if (silent) return;
	console.log(`\u001b[36m[agent]\u001b[0m ${message}`);
}

export function serviceLog(message: string): void {
	if (silent) return;
	console.log(`\u001b[35m[inkan]\u001b[0m ${message}`);
}
