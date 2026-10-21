import type { Confidence, QuotaStatus, RuntimeId } from "../core/types.js";

/** Coarse routing state derived from local signals only. */
export type RoutingState = "available" | "limited" | "unknown";

export interface QuotaSnapshot {
  runtime: RuntimeId;
  status: QuotaStatus;
  confidence: Confidence;
  source: "provider-api" | "rate-limit-header" | "cli-status" | "local-ledger" | "error-inference" | "manual";
  checkedAt: string;
  /** Derived routing state. `limited` means a recent quota/rate-limit/auth signal is still inside its cooldown window. */
  state?: RoutingState;
  resetAt?: string;
  cooldownUntil?: string;
  remainingPercent?: number;
  note?: string;
}
