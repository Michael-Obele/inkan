/**
 * The three things a beat is allowed to do. Shared by the service, the remote
 * module and the console, so it lives where the browser can read it too.
 */
export type BeatOutcome = 'paid' | 'waiting' | 'refused';
