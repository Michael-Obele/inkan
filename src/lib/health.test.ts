import { expect, test } from 'vitest';
import { healthPayload } from './health';

test('health payload carries the service name and the given time', () => {
	const payload = healthPayload(new Date('2026-11-04T12:00:00Z'));

	expect(payload).toEqual({
		ok: true,
		service: 'inkan',
		now: '2026-11-04T12:00:00.000Z'
	});
});
