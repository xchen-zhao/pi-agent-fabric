import type { Confidence, QuotaStatus, RuntimeId } from "../core/types.js";

export interface QuotaSnapshot {
  runtime: RuntimeId;
  status: QuotaStatus;
  confidence: Confidence;
  source: "provider-api" | "rate-limit-header" | "cli-status" | "local-ledger" | "error-inference" | "manual";
  checkedAt: string;
  resetAt?: string;
  cooldownUntil?: string;
  remainingPercent?: number;
  note?: string;
}
