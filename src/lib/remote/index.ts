/**
 * One import surface for the app's remote functions, as `agent/rules.md` asks.
 * Everything here is still declared in a `*.remote.ts` module next door.
 */
export { getAllowance, lowerCeiling, stopAgent } from './allowance.remote';
export { getApproval, decideApproval } from './approval.remote';
export { getAgentConsole, resetTheDemo, runBeatNow } from './demo.remote';
export { getLedger, refundCapture } from './ledger.remote';
export { getShell } from './shell.remote';
export { getShop } from './shop.remote';
