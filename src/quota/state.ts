import type { RuntimeDiscovery } from "../core/types.js";
import { UsageLedger } from "../usage/ledger.js";
import { deriveQuotaSnapshots, signalLookbackMs, type QuotaDerivationOptions } from "./broker.js";
import type { QuotaSnapshot } from "./types.js";

/** Read recent ledger signals and derive quota snapshots. Falls back to `unknown` if the ledger cannot be read. */
export function loadQuotaSnapshots(
  runtimes: RuntimeDiscovery[],
  options: QuotaDerivationOptions & { ledgerPath?: string } = {},
): { snapshots: QuotaSnapshot[]; warning?: string } {
  const now = options.now ?? new Date();
  try {
    const ledger = UsageLedger.open(options.ledgerPath);
    try {
      const runs = ledger.quotaSignals(new Date(now.getTime() - signalLookbackMs(options)));
      return { snapshots: deriveQuotaSnapshots(runtimes, runs, { ...options, now }) };
    } finally {
      ledger.close();
    }
  } catch (error) {
    return {
      snapshots: deriveQuotaSnapshots(runtimes, [], { ...options, now }),
      warning: `failed to read usage ledger: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
