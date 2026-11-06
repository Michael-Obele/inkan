import { SCENARIO, type ScenarioStep } from '../../src/lib/server/scenario';

export type Task = ScenarioStep & { mandateId: string };

/** The same beats the preview replays, so the live and recorded demos cannot drift. */
export const TASKS: Task[] = SCENARIO.map((step) => ({ ...step, mandateId: 'mnd_demo' }));
