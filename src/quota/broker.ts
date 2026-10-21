import type { RuntimeDiscovery } from "../core/types.js";
import type { QuotaSignalRun } from "../usage/ledger.js";
import type { QuotaSnapshot } from "./types.js";

/**
 * V0 不发送模型请求，也不猜测订阅剩余额度。
 * 保留给尚无本地账本数据的调用方使用。
 */
export function initialQuotaSnapshot(runtime: RuntimeDiscovery): QuotaSnapshot {
  return {
    runtime: runtime.id,
    status: "unknown",
    confidence: "unknown",
    source: "local-ledger",
    checkedAt: new Date().toISOString(),
    state: "unknown",
    note: runtime.installed ? "尚未执行额度探测" : "Runtime 未安装，无法判断额度",
  };
}

export interface QuotaDerivationOptions {
  now?: Date;
  /** Cooldown after a rate-limit signal without an explicit retry-after/reset time. Default 15 minutes. */
  rateLimitCooldownMs?: number;
  /** Cooldown after a quota-exhausted signal without an explicit reset time. Default 60 minutes. */
  quotaCooldownMs?: number;
  /** Cooldown after an authentication failure. Default 60 minutes. */
  authCooldownMs?: number;
}

export const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 15 * 60_000;
export const DEFAULT_QUOTA_COOLDOWN_MS = 60 * 60_000;
export const DEFAULT_AUTH_COOLDOWN_MS = 60 * 60_000;

/** How far back callers should read the ledger so every default cooldown is covered. */
export function signalLookbackMs(options: QuotaDerivationOptions = {}): number {
  return Math.max(
    options.rateLimitCooldownMs ?? DEFAULT_RATE_LIMIT_COOLDOWN_MS,
    options.quotaCooldownMs ?? DEFAULT_QUOTA_COOLDOWN_MS,
    options.authCooldownMs ?? DEFAULT_AUTH_COOLDOWN_MS,
    24 * 60 * 60_000,
  );
}

type SignalKind = "rate-limited" | "quota-exhausted" | "authentication";

function signalKind(run: QuotaSignalRun): SignalKind | undefined {
  if (run.errorCategory === "rate-limited") return "rate-limited";
  if (run.errorCategory === "quota-exhausted") return "quota-exhausted";
  if (run.errorCategory === "authentication") return "authentication";
  if (run.quotaStatus === "exhausted") return "quota-exhausted";
  if (run.quotaStatus === "cooldown") return "rate-limited";
  return undefined;
}

function validDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function cooldownUntil(run: QuotaSignalRun, kind: SignalKind, options: QuotaDerivationOptions): Date {
  const finished = validDate(run.finishedAt) ?? new Date(0);
  const reset = validDate(run.quotaResetAt);
  if (reset && reset > finished) return reset;
  if (kind === "rate-limited" && run.retryAfterMs !== undefined && run.retryAfterMs > 0) {
    return new Date(finished.getTime() + run.retryAfterMs);
  }
  const fallback = kind === "rate-limited"
    ? options.rateLimitCooldownMs ?? DEFAULT_RATE_LIMIT_COOLDOWN_MS
    : kind === "quota-exhausted"
      ? options.quotaCooldownMs ?? DEFAULT_QUOTA_COOLDOWN_MS
      : options.authCooldownMs ?? DEFAULT_AUTH_COOLDOWN_MS;
  return new Date(finished.getTime() + fallback);
}

/**
 * Derive a per-runtime quota snapshot from local facts only:
 * discovery (installed or not) and recent Usage Ledger rows.
 *
 * - `limited`: the newest quota-relevant signal (rate limit, exhausted quota,
 *   reported cooldown/exhausted, or auth failure) is still inside its cooldown
 *   window and no later run succeeded.
 * - `available`: the newest run completed, or the last signal's cooldown expired
 *   and a later run succeeded. This is an inference, not a provider guarantee.
 * - `unknown`: not installed, no recent runs, or only unrelated failures.
 */
export function deriveQuotaSnapshot(
  runtime: RuntimeDiscovery,
  runs: QuotaSignalRun[],
  options: QuotaDerivationOptions = {},
): QuotaSnapshot {
  const now = options.now ?? new Date();
  const base = { runtime: runtime.id, checkedAt: now.toISOString() };
  if (!runtime.installed) {
    return { ...base, status: "unknown", confidence: "unknown", source: "local-ledger", state: "unknown", note: "Runtime 未安装，无法判断额度" };
  }

  const own = runs
    .filter((run) => run.runtime === runtime.id)
    .sort((a, b) => (validDate(b.finishedAt)?.getTime() ?? 0) - (validDate(a.finishedAt)?.getTime() ?? 0));
  if (own.length === 0) {
    return { ...base, status: "unknown", confidence: "unknown", source: "local-ledger", state: "unknown", note: "本地账本中没有近期运行记录" };
  }

  const latest = own[0]!;
  const latestKind = signalKind(latest);
  if (latestKind) {
    const until = cooldownUntil(latest, latestKind, options);
    if (until > now) {
      const status = latestKind === "authentication" ? "unauthorized" : latestKind === "quota-exhausted" ? "exhausted" : "cooldown";
      return {
        ...base,
        status,
        confidence: latest.quotaResetAt ? "reported" : "inferred",
        source: latest.quotaStatus && !latest.errorCategory ? "local-ledger" : "error-inference",
        state: "limited",
        cooldownUntil: until.toISOString(),
        ...(latest.quotaResetAt ? { resetAt: latest.quotaResetAt } : {}),
        note: `最近一次运行报告 ${latestKind}，冷却至 ${until.toISOString()}`,
      };
    }
    return {
      ...base,
      status: "unknown",
      confidence: "inferred",
      source: "error-inference",
      state: "unknown",
      note: `${latestKind} 冷却已结束，尚无新的成功运行`,
    };
  }

  if (latest.status === "completed") {
    return {
      ...base,
      status: latest.quotaStatus === "constrained" ? "constrained" : "available",
      confidence: "inferred",
      source: "local-ledger",
      state: "available",
      note: `最近一次运行成功于 ${latest.finishedAt}`,
    };
  }

  return {
    ...base,
    status: "unknown",
    confidence: "unknown",
    source: "local-ledger",
    state: "unknown",
    note: `最近一次运行失败（${latest.errorCategory ?? "unknown"}），与额度无关`,
  };
}

export function deriveQuotaSnapshots(
  runtimes: RuntimeDiscovery[],
  runs: QuotaSignalRun[],
  options: QuotaDerivationOptions = {},
): QuotaSnapshot[] {
  return runtimes.map((runtime) => deriveQuotaSnapshot(runtime, runs, options));
}

