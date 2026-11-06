import { describe, expect, it } from 'vitest';
import { RunnerCredentialError, validateRunnerEnv } from '../../../runner/src/env';

const CLEAN = {
	MANDATE_BASE_URL: 'http://localhost:5173',
	AGENT_ID: 'coffee-runner'
};

describe('runner environment', () => {
	it('accepts an environment with no PayPal variables', () => {
		expect(validateRunnerEnv(CLEAN)).toMatchObject({
			baseUrl: 'http://localhost:5173',
			agentId: 'coffee-runner'
		});
	});

	it('refuses a client id', () => {
		expect(() => validateRunnerEnv({ ...CLEAN, PAYPAL_CLIENT_ID: 'abc' })).toThrow(
			RunnerCredentialError
		);
	});

	it('refuses a client secret', () => {
		expect(() => validateRunnerEnv({ ...CLEAN, PAYPAL_CLIENT_SECRET: 'xyz' })).toThrow(
			/PayPal credentials/
		);
	});

	it('names every leaked variable, not just the first', () => {
		try {
			validateRunnerEnv({
				...CLEAN,
				PAYPAL_CLIENT_ID: 'a',
				PAYPAL_CLIENT_SECRET: 'b',
				PAYPAL_ENVIRONMENT: 'sandbox'
			});
			expect.unreachable('it should have thrown');
		} catch (error) {
			expect(error).toBeInstanceOf(RunnerCredentialError);
			expect((error as Error).message).toContain('PAYPAL_CLIENT_ID');
			expect((error as Error).message).toContain('PAYPAL_CLIENT_SECRET');
			expect((error as Error).message).toContain('PAYPAL_ENVIRONMENT');
		}
	});

	it('ignores a PayPal variable that is present but empty', () => {
		expect(() => validateRunnerEnv({ ...CLEAN, PAYPAL_CLIENT_ID: '' })).not.toThrow();
	});

	it('refuses to start without somewhere to ask', () => {
		expect(() => validateRunnerEnv({ AGENT_ID: 'a' })).toThrow(/MANDATE_BASE_URL/);
	});
});
